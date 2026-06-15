import { execFile } from 'child_process';
import {
  ActiveSpell,
  DispatchResult,
  HookDispatchPayload,
  HookDispatchSpellOutcome,
  Session,
  Spell,
  SpellAction,
  SpellHookEvent,
} from '../../types';
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';

/**
 * P2/P3: Hook Dispatcher.
 *
 * Every Claude session binds each hook event once to `maestro hook dispatch <EVENT>`.
 * The CLI POSTs to /api/hooks/dispatch with {sessionId, event, payload}; we look up
 * Session.activeSpells, filter to spells whose trigger matches, execute the action,
 * and return a DispatchResult that the CLI translates to exit code + stdout/stderr.
 *
 * Composition (when multiple active spells fire on the same event):
 *   - any spell with block:true wins → exit 2 with composed reasons
 *   - otherwise inject/feed stdout payloads are concatenated in iteration order
 *   - continue-loop signals compose by "any continue wins"; reasons joined
 *   - run-command / notify-channel actions all run; side effects accumulate
 *
 * failMode (per spell): on internal error inside that spell's action,
 *   - 'closed' → treated as a block (gate semantics) — fail-closed
 *   - 'open'   → spell is skipped, others continue (default)
 */
export class HookDispatcherService {
  /** Hard cap on run-command duration; spells should not pin a hook for long. */
  private static readonly COMMAND_TIMEOUT_MS = 30_000;
  /** Max stdout returned by run-command per spell. */
  private static readonly COMMAND_MAX_BUFFER = 256 * 1024;

  constructor(
    private sessionRepo: ISessionRepository,
    private spellRepo: ISpellRepository,
    private eventBus: IEventBus,
    private logger: ILogger,
  ) {}

  async dispatch(payload: HookDispatchPayload): Promise<DispatchResult> {
    if (!payload?.sessionId) throw new ValidationError('sessionId is required');
    if (!payload?.event) throw new ValidationError('event is required');

    const session = await this.sessionRepo.findById(payload.sessionId);
    if (!session) throw new NotFoundError('Session', payload.sessionId);

    const matchedActives = this.matchActiveSpells(session, payload.event, payload.payload);
    if (matchedActives.length === 0) {
      return this.emptyResult();
    }

    // Resolve to Spell entities; drop any whose definition is missing.
    const resolved: { active: ActiveSpell; spell: Spell }[] = [];
    for (const active of matchedActives) {
      try {
        const spell = await this.spellRepo.findById(active.spellId);
        if (!spell) {
          this.logger.warn('Active spell references unknown spell id', {
            sessionId: session.id,
            spellId: active.spellId,
          });
          continue;
        }
        resolved.push({ active, spell });
      } catch (err) {
        this.logger.warn('Failed to resolve active spell', {
          sessionId: session.id,
          spellId: active.spellId,
          error: (err as Error).message,
        });
      }
    }

    if (resolved.length === 0) return this.emptyResult();

    const outcomes: HookDispatchSpellOutcome[] = [];
    for (const { active, spell } of resolved) {
      try {
        const outcome = await this.executeAction(session, active, spell, payload);
        outcomes.push(outcome);
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.error('Spell action threw', err as Error);
        // failMode === 'closed' → treat as a block; 'open' (default) → skip.
        if (spell.failMode === 'closed') {
          outcomes.push({
            spellId: spell.id,
            action: spell.action,
            block: true,
            reason: `Spell "${spell.name}" failed (fail-closed): ${msg}`,
            error: msg,
          });
        } else {
          outcomes.push({
            spellId: spell.id,
            action: spell.action,
            error: msg,
          });
        }
      }
    }

    return this.composeResult(outcomes);
  }

  // --- Matching ---

  /**
   * Pick the active spells whose enabled trigger matches the given hook event.
   * Matcher semantics:
   *   - PreToolUse / PostToolUse: regex against payload.tool_name (case-sensitive).
   *   - other events with matcher: regex against payload.matcherTarget if provided,
   *     else free-text match against JSON-stringified payload.
   *   - no matcher: always matches the event.
   * Invalid regex falls back to substring contains.
   */
  private matchActiveSpells(
    session: Session,
    event: SpellHookEvent,
    payload?: Record<string, any>,
  ): ActiveSpell[] {
    const actives = session.activeSpells ?? [];
    return actives.filter(a => {
      if (!a.enabled) return false;
      if (a.hookEvent && a.hookEvent !== event) return false;
      if (!a.matcher) return true;
      const target = this.matcherTarget(event, payload);
      return this.matcherMatches(a.matcher, target);
    });
  }

  private matcherTarget(event: SpellHookEvent, payload?: Record<string, any>): string {
    if (!payload) return '';
    if (event === 'PreToolUse' || event === 'PostToolUse') {
      // Claude's hook payload uses `tool_name`; accept either casing.
      return String(payload.tool_name ?? payload.toolName ?? '');
    }
    // Generic: prefer explicit matcherTarget; fall back to common payload fields.
    return String(
      payload.matcherTarget
      ?? payload.path
      ?? payload.file_path
      ?? payload.filePath
      ?? payload.message
      ?? JSON.stringify(payload),
    );
  }

  private matcherMatches(matcher: string, target: string): boolean {
    if (!target) return false;
    try {
      const re = new RegExp(matcher);
      return re.test(target);
    } catch {
      return target.includes(matcher);
    }
  }

  // --- Action execution ---

  private async executeAction(
    session: Session,
    active: ActiveSpell,
    spell: Spell,
    payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    const action: SpellAction = spell.action;
    switch (action) {
      case 'inject-prompt':
        return this.execInjectPrompt(session, spell, payload);
      case 'feed-context':
        return this.execFeedContext(spell);
      case 'gate':
        return this.execGate(spell, payload);
      case 'continue-loop':
        return this.execContinueLoop(session, active, spell);
      case 'run-command':
        return this.execRunCommand(spell);
      case 'notify-channel':
        return this.execNotifyChannel(session, spell, payload);
      default:
        return {
          spellId: spell.id,
          action,
          error: `Unknown spell action: ${action}`,
        };
    }
  }

  private async execInjectPrompt(
    session: Session,
    spell: Spell,
    _payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    const text = this.spellPromptText(spell);
    // The PTY-write path: emit session:prompt_send so the running terminal
    // receives it the same way as a UI cast.
    await this.eventBus.emit('session:prompt_send', {
      sessionId: session.id,
      content: text,
      mode: 'send' as const,
      senderSessionId: null,
      senderProjectId: null,
      targetProjectId: session.projectId ?? null,
      timestamp: Date.now(),
    });
    return {
      spellId: spell.id,
      action: 'inject-prompt',
      // Some hooks (UserPromptSubmit) also surface stdout into the model context;
      // returning the text is harmless for non-stdout hooks since the CLI only
      // forwards stdout for feed-context outcomes.
      stdout: text,
    };
  }

  private async execFeedContext(spell: Spell): Promise<HookDispatchSpellOutcome> {
    return {
      spellId: spell.id,
      action: 'feed-context',
      stdout: this.spellPromptText(spell),
    };
  }

  private async execGate(
    spell: Spell,
    payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    // The gate spell BLOCKS by default; the model can re-invoke after the block
    // message lands in stderr. Reason composition includes the matched target so
    // the agent knows which call was blocked.
    const target = this.matcherTarget('PreToolUse', payload.payload);
    const reason =
      spell.description ||
      `Blocked by spell "${spell.name}"${target ? ` (matched: ${target})` : ''}.`;
    return {
      spellId: spell.id,
      action: 'gate',
      block: true,
      reason,
    };
  }

  private async execContinueLoop(
    session: Session,
    active: ActiveSpell,
    spell: Spell,
  ): Promise<HookDispatchSpellOutcome> {
    const cap = Math.max(1, spell.maxIterations ?? 1);
    const next = (active.iteration ?? 0) + 1;
    if (next > cap) {
      // Loop is done — return no block / no continue so Stop succeeds normally.
      return {
        spellId: spell.id,
        action: 'continue-loop',
        continue: false,
        reason: `Loop "${spell.name}" reached max iterations (${cap}).`,
      };
    }
    // Persist the bumped iteration so subsequent Stops respect the cap.
    const updatedActives = (session.activeSpells ?? []).map(a =>
      a.spellId === spell.id ? { ...a, iteration: next } : a,
    );
    await this.sessionRepo.update(session.id, { activeSpells: updatedActives });

    const reason = this.loopContinuationReason(spell, next, cap);
    return {
      spellId: spell.id,
      action: 'continue-loop',
      continue: true,
      reason,
      // Loops can also feed a hint into the next turn via stdout when allowed.
      stdout: reason,
    };
  }

  private async execRunCommand(spell: Spell): Promise<HookDispatchSpellOutcome> {
    // Until spells carry an explicit command, run-command is a metadata-only
    // pass-through that records the intent. Real shell execution will arrive
    // with the CLI's HookExecutor in a follow-up; until then we don't shell out
    // implicitly to avoid arbitrary code execution from spell content.
    const cmd = (spell as any).command as string | undefined;
    const args = ((spell as any).commandArgs as string[] | undefined) ?? [];
    if (!cmd || typeof cmd !== 'string') {
      return {
        spellId: spell.id,
        action: 'run-command',
        stdout: '',
      };
    }
    return new Promise<HookDispatchSpellOutcome>(resolve => {
      execFile(
        cmd,
        args,
        {
          timeout: HookDispatcherService.COMMAND_TIMEOUT_MS,
          maxBuffer: HookDispatcherService.COMMAND_MAX_BUFFER,
        },
        (err, stdout, stderr) => {
          if (err) {
            resolve({
              spellId: spell.id,
              action: 'run-command',
              error: stderr?.toString() || err.message,
            });
            return;
          }
          resolve({
            spellId: spell.id,
            action: 'run-command',
            stdout: stdout?.toString() ?? '',
          });
        },
      );
    });
  }

  private async execNotifyChannel(
    session: Session,
    spell: Spell,
    payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    // Surface as a notify:progress event. The frontend / channel relay picks it
    // up and routes to the configured Telegram/Slack/etc. channel — keeping the
    // dispatcher decoupled from any specific transport.
    const message = `[${spell.name}] ${spell.description || 'spell fired'} on ${payload.event}`;
    await this.eventBus.emit('notify:progress', {
      sessionId: session.id,
      message,
    });
    return {
      spellId: spell.id,
      action: 'notify-channel',
    };
  }

  // --- Helpers ---

  private spellPromptText(spell: Spell): string {
    // For now the prompt body is the spell's description (the foundation Spell
    // entity doesn't carry a separate body field). A future field can override
    // this without changing the dispatcher contract.
    return spell.description || spell.name;
  }

  private loopContinuationReason(spell: Spell, next: number, cap: number): string {
    const base = `Loop "${spell.name}" iteration ${next}/${cap}`;
    if (spell.loopType === 'critic-refine') {
      return `${base}: critique your previous output and refine it. Address any issues you find.`;
    }
    if (spell.loopType === 'plan-execute') {
      return `${base}: now execute the plan you wrote. Report progress as you go.`;
    }
    if (spell.loopType === 'continue-until-done') {
      return `${base}: continue until the task is complete.`;
    }
    return `${base}.`;
  }

  private composeResult(outcomes: HookDispatchSpellOutcome[]): DispatchResult {
    const blocking = outcomes.filter(o => o.block);
    const continuing = outcomes.filter(o => o.continue);

    // Gate wins: any block → exit 2 with composed reasons.
    if (blocking.length > 0) {
      const reason = blocking
        .map(o => o.reason || `Blocked by ${o.spellId}.`)
        .join('\n\n');
      return {
        exitCode: 2,
        stdout: '',
        reason,
        blocked: true,
        continued: false,
        spells: outcomes,
        timestamp: Date.now(),
      };
    }

    // Continue-loop signal: exit 2 on Stop tells Claude to keep going.
    if (continuing.length > 0) {
      const reason = continuing
        .map(o => o.reason || `Continue from ${o.spellId}.`)
        .join('\n\n');
      const stdout = outcomes
        .map(o => o.stdout ?? '')
        .filter(Boolean)
        .join('\n\n');
      return {
        exitCode: 2,
        stdout,
        reason,
        blocked: false,
        continued: true,
        spells: outcomes,
        timestamp: Date.now(),
      };
    }

    // Plain composition: concatenate stdout payloads.
    const stdout = outcomes
      .map(o => o.stdout ?? '')
      .filter(Boolean)
      .join('\n\n');
    return {
      exitCode: 0,
      stdout,
      blocked: false,
      continued: false,
      spells: outcomes,
      timestamp: Date.now(),
    };
  }

  private emptyResult(): DispatchResult {
    return {
      exitCode: 0,
      stdout: '',
      blocked: false,
      continued: false,
      spells: [],
      timestamp: Date.now(),
    };
  }
}
