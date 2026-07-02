import { execFile } from 'child_process';
import {
  ActiveSpell,
  DispatchResult,
  HookDispatchPayload,
  HookDispatchSpellOutcome,
  Session,
  Spell,
  SpellHookEvent,
  SpellRule,
} from '../../types';
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';

/**
 * Hook Dispatcher (v2 — multi-rule, no gate).
 *
 * Every Claude session binds each hook event once to `maestro hook dispatch <EVENT>`.
 * The CLI POSTs to /api/hooks/dispatch with {sessionId, event, payload}; we look up
 * Session.activeSpells, resolve each to its Spell, iterate the spell's rules, keep
 * enabled `hook`-type rules whose event + matcher match, execute each rule's action,
 * and return a DispatchResult the CLI translates to exit code + stdout/stderr.
 *
 * Composition (when multiple rules across multiple active spells fire on one event):
 *   - feed-context stdout is concatenated in (activeSpell × rule) order
 *   - continue-loop signals compose by "any continue wins" on Stop/SubagentStop
 *   - inject-prompt / run-command / notify-channel run for side effects
 *
 * There is NO block path — `gate` was dropped. On an internal rule error the rule
 * is skipped (fail-open) and the error surfaced for logging; other rules continue.
 *
 * run-command is ASYNC fire-and-forget (§11.5): the dispatcher kicks off execFile,
 * returns from the hook immediately (contributes nothing to the synchronous exit
 * code / stdout), and — when the command finishes, if `feedOutput` — delivers stdout
 * asynchronously via `session:prompt_send`. This decouples command latency from the
 * ~4s hook budget so long lint/test runs can still feed results back.
 */
export class HookDispatcherService {
  /** Hard cap on run-command duration; a runaway spell must not pin a process. */
  private static readonly COMMAND_TIMEOUT_MS = 30_000;
  /** Max stdout captured from a run-command before truncation. */
  private static readonly COMMAND_MAX_BUFFER = 256 * 1024;
  /** Cap concurrent run-commands kicked off per dispatch (PI-10). */
  private static readonly MAX_RUN_COMMANDS_PER_DISPATCH = 5;
  /** Cap on target length fed to a user-supplied regex (ReDoS hardening). */
  private static readonly MATCHER_TARGET_MAX = 4096;

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

    const actives = (session.activeSpells ?? []).filter(a => a.enabled);
    if (actives.length === 0) return this.emptyResult();

    // Resolve each active spell to its definition; drop any that are missing.
    const resolved: { active: ActiveSpell; spell: Spell }[] = [];
    for (const active of actives) {
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
    // spellId → (ruleId → newIteration) — applied in one sessionRepo.update at the end.
    const iterationUpdates = new Map<string, Record<string, number>>();
    let runCommandsStarted = 0;

    for (const { active, spell } of resolved) {
      const rules = (spell.rules ?? []).filter(rule => this.ruleMatches(rule, payload.event, payload.payload));
      for (const rule of rules) {
        try {
          const outcome = await this.executeRuleAction(session, active, spell, rule, payload, {
            iterationUpdates,
            canStartRunCommand: () => {
              if (runCommandsStarted >= HookDispatcherService.MAX_RUN_COMMANDS_PER_DISPATCH) return false;
              runCommandsStarted += 1;
              return true;
            },
          });
          outcomes.push(outcome);
          void this.emitRuleFired(session, spell, rule, payload.event, outcome);
        } catch (err) {
          const msg = (err as Error).message;
          this.logger.error('Spell rule action threw', err as Error);
          const outcome: HookDispatchSpellOutcome = {
            spellId: spell.id,
            ruleId: rule.id,
            action: rule.action.type,
            error: msg,
          };
          outcomes.push(outcome);
          void this.emitRuleFired(session, spell, rule, payload.event, outcome);
        }
      }
    }

    await this.persistIterationUpdates(session, iterationUpdates);

    return this.composeResult(outcomes, payload.event);
  }

  // --- Matching ---

  /** A rule fires when it is enabled, is a hook trigger for this event, and its matcher matches. */
  private ruleMatches(rule: SpellRule, event: SpellHookEvent, payload?: Record<string, any>): boolean {
    if (!rule.enabled) return false;
    if (rule.trigger.type !== 'hook') return false; // schedule rules never fire in v1
    if (rule.trigger.hookEvent !== event) return false;
    const matcher = rule.trigger.matcher;
    if (!matcher) return true;
    return this.matcherMatches(matcher, this.matcherTarget(event, payload));
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
    // Cap target length so a pre-existing/legacy unsafe pattern can't stall the
    // event loop on an attacker-influenced long input. Validation also rejects
    // catastrophic-backtracking patterns at create/update time.
    const t = target.length > HookDispatcherService.MATCHER_TARGET_MAX
      ? target.slice(0, HookDispatcherService.MATCHER_TARGET_MAX)
      : target;
    try {
      return new RegExp(matcher).test(t);
    } catch {
      return t.includes(matcher);
    }
  }

  // --- Action execution ---

  private async executeRuleAction(
    session: Session,
    active: ActiveSpell,
    spell: Spell,
    rule: SpellRule,
    payload: HookDispatchPayload,
    ctx: {
      iterationUpdates: Map<string, Record<string, number>>;
      canStartRunCommand: () => boolean;
    },
  ): Promise<HookDispatchSpellOutcome> {
    const action = rule.action;
    switch (action.type) {
      case 'inject-prompt':
        return this.execInjectPrompt(session, spell, rule, action.prompt);
      case 'feed-context':
        return this.execFeedContext(spell, rule, action.prompt);
      case 'continue-loop':
        return this.execContinueLoop(active, spell, rule, action, ctx.iterationUpdates);
      case 'run-command':
        return this.execRunCommand(session, spell, rule, action, payload, ctx.canStartRunCommand);
      case 'notify-channel':
        return this.execNotifyChannel(session, spell, rule, action, payload);
      default: {
        // Exhaustiveness guard — the discriminated union makes this unreachable.
        const _never: never = action;
        return {
          spellId: spell.id,
          ruleId: rule.id,
          action: (_never as any)?.type,
          error: 'Unknown spell action',
        };
      }
    }
  }

  private async execInjectPrompt(
    session: Session,
    spell: Spell,
    rule: SpellRule,
    prompt: string,
  ): Promise<HookDispatchSpellOutcome> {
    await this.eventBus.emit('session:prompt_send', {
      sessionId: session.id,
      content: prompt,
      mode: 'send' as const,
      senderSessionId: null,
      senderProjectId: null,
      targetProjectId: session.projectId ?? null,
      timestamp: Date.now(),
    });
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'inject-prompt',
      // No stdout: the prompt is delivered via session:prompt_send above, and the
      // CLI writes any returned stdout back to the terminal — returning it here
      // would double-deliver on stdout-surfacing hooks (UserPromptSubmit, etc.).
    };
  }

  private async execFeedContext(
    spell: Spell,
    rule: SpellRule,
    prompt: string,
  ): Promise<HookDispatchSpellOutcome> {
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'feed-context',
      stdout: prompt,
    };
  }

  private async execContinueLoop(
    active: ActiveSpell,
    spell: Spell,
    rule: SpellRule,
    action: { type: 'continue-loop'; loopType?: string; maxIterations?: number },
    iterationUpdates: Map<string, Record<string, number>>,
  ): Promise<HookDispatchSpellOutcome> {
    const cap = Math.max(1, action.maxIterations ?? 1);
    const current = active.ruleIterations?.[rule.id] ?? 0;
    const next = current + 1;
    if (next > cap) {
      // Loop is done — no continue so Stop/SubagentStop succeeds normally.
      return {
        spellId: spell.id,
        ruleId: rule.id,
        action: 'continue-loop',
        continue: false,
        reason: `Loop "${rule.label ?? spell.name}" reached max iterations (${cap}).`,
      };
    }
    // Stage the bumped iteration; persisted once after all rules run.
    const perSpell = iterationUpdates.get(spell.id) ?? {};
    perSpell[rule.id] = next;
    iterationUpdates.set(spell.id, perSpell);

    const reason = this.loopContinuationReason(spell, rule, action.loopType, next, cap);
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'continue-loop',
      continue: true,
      reason,
      stdout: reason,
    };
  }

  private execRunCommand(
    session: Session,
    spell: Spell,
    rule: SpellRule,
    action: { type: 'run-command'; command: string; args?: string[]; cwd?: string; feedOutput?: boolean },
    payload: HookDispatchPayload,
    canStart: () => boolean,
  ): HookDispatchSpellOutcome {
    if (!canStart()) {
      this.logger.warn('run-command skipped: per-dispatch concurrency cap reached', {
        sessionId: session.id,
        spellId: spell.id,
        ruleId: rule.id,
      });
      return {
        spellId: spell.id,
        ruleId: rule.id,
        action: 'run-command',
        error: 'run-command skipped (concurrency cap)',
      };
    }

    const cwd = action.cwd
      || (payload.payload?.cwd as string | undefined)
      || session.env?.PWD
      || undefined;

    // Fire-and-forget: kick off the child and return immediately. The command's
    // latency is fully decoupled from the hook response. When it finishes, if
    // feedOutput is set, stdout is delivered asynchronously via session:prompt_send.
    execFile(
      action.command,
      action.args ?? [],
      {
        cwd,
        timeout: HookDispatcherService.COMMAND_TIMEOUT_MS,
        maxBuffer: HookDispatcherService.COMMAND_MAX_BUFFER,
      },
      (err, stdout, stderr) => {
        const tag = `[${spell.name} · ${rule.label ?? rule.id}]`;
        if (err) {
          this.logger.warn('run-command failed', {
            sessionId: session.id,
            spellId: spell.id,
            ruleId: rule.id,
            error: (stderr?.toString() || err.message).slice(0, 500),
          });
          return;
        }
        if (!action.feedOutput) return;
        const out = (stdout?.toString() ?? '').trim();
        if (!out) return;
        void this.eventBus.emit('session:prompt_send', {
          sessionId: session.id,
          content: `${tag} command output:\n${out}`,
          mode: 'send' as const,
          senderSessionId: null,
          senderProjectId: null,
          targetProjectId: session.projectId ?? null,
          timestamp: Date.now(),
        });
      },
    );

    // Synchronous outcome contributes nothing to exit code / stdout.
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'run-command',
    };
  }

  private async execNotifyChannel(
    session: Session,
    spell: Spell,
    rule: SpellRule,
    action: { type: 'notify-channel'; channel?: string; message?: string },
    payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    const message = action.message || `[${spell.name}] fired on ${payload.event}`;
    // Thread `channel` as an optional routing hint (§11.7); the downstream relay
    // falls back to a default channel when it is absent.
    await this.eventBus.emit('notify:progress', {
      sessionId: session.id,
      message,
      channel: action.channel,
    });
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'notify-channel',
    };
  }

  // --- Helpers ---

  private loopContinuationReason(
    spell: Spell,
    rule: SpellRule,
    loopType: string | undefined,
    next: number,
    cap: number,
  ): string {
    const base = `Loop "${rule.label ?? spell.name}" iteration ${next}/${cap}`;
    if (loopType === 'critic-refine') {
      return `${base}: critique your previous output and refine it. Address any issues you find.`;
    }
    if (loopType === 'plan-execute') {
      return `${base}: now execute the plan you wrote. Report progress as you go.`;
    }
    if (loopType === 'continue-until-done') {
      return `${base}: continue until the task is complete.`;
    }
    return `${base}.`;
  }

  private async emitRuleFired(
    session: Session,
    spell: Spell,
    rule: SpellRule,
    event: SpellHookEvent,
    outcome: HookDispatchSpellOutcome,
  ): Promise<void> {
    try {
      await this.eventBus.emit('spell:rule_fired', {
        sessionId: session.id,
        spellId: spell.id,
        ruleId: rule.id,
        event,
        action: rule.action.type,
        outcome: outcome.error ? 'error' : 'ok',
        timestamp: Date.now(),
      });
    } catch {
      // Observability event must never affect dispatch.
    }
  }

  private async persistIterationUpdates(
    session: Session,
    iterationUpdates: Map<string, Record<string, number>>,
  ): Promise<void> {
    if (iterationUpdates.size === 0) return;
    const nextActives = (session.activeSpells ?? []).map(a => {
      const updates = iterationUpdates.get(a.spellId);
      if (!updates) return a;
      return { ...a, ruleIterations: { ...(a.ruleIterations ?? {}), ...updates } };
    });
    await this.sessionRepo.update(session.id, { activeSpells: nextActives });
  }

  /**
   * Simplified composition (§11.3): no block path. The only exit-2 signal is a
   * continue-loop on Stop/SubagentStop. Everything else → exit 0 + concatenated
   * feed-context stdout.
   */
  private composeResult(outcomes: HookDispatchSpellOutcome[], event?: SpellHookEvent): DispatchResult {
    const continuing = outcomes.filter(o => o.continue);
    const isStopEvent = event === 'Stop' || event === 'SubagentStop';
    const stdout = outcomes.map(o => o.stdout ?? '').filter(Boolean).join('\n\n');

    if (continuing.length > 0 && isStopEvent) {
      const reason = continuing
        .map(o => o.reason || `Continue from ${o.spellId}.`)
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

    // Non-Stop continue-loop is downgraded to a stdout hint (composeResult never
    // blocks a non-Stop event); plain feed-context stdout flows through here too.
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
