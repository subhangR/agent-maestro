import { execFile, ChildProcess } from 'child_process';
import * as path from 'path';
import {
  ActiveSpell,
  DispatchMatchReport,
  DispatchResult,
  HookDispatchPayload,
  HookDispatchSpellOutcome,
  HookRuleOutcomeStatus,
  Session,
  Spell,
  SpellHookEvent,
  SpellNotifyLevel,
  SpellRule,
} from '../../types';
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { ITeamMemberRepository } from '../../domain/repositories/ITeamMemberRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';

/** Minimal config surface the dispatcher needs (C5 run-command allowlist). */
export interface HookDispatcherConfig {
  spellCmdAllowlist: string[];
}

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
 * There is NO block path for tool calls — `gate` was dropped. On an internal rule
 * error the rule is skipped (fail-open) and surfaced for logging; other rules run.
 *
 * run-command (§11.5) is permission-gated (C5) then ASYNC fire-and-forget: the
 * dispatcher kicks off execFile, returns immediately, and — when the command
 * finishes, if `feedOutput` — delivers stdout via `session:prompt_send`.
 */
export class HookDispatcherService {
  /** Hard cap on run-command duration; a runaway spell must not pin a process. */
  private static readonly COMMAND_TIMEOUT_MS = 30_000;
  /** Max stdout captured from a run-command before truncation. */
  private static readonly COMMAND_MAX_BUFFER = 256 * 1024;
  /** Cap on target length fed to a user-supplied regex (ReDoS hardening). */
  private static readonly MATCHER_TARGET_MAX = 4096;
  /** C5: max concurrent in-flight run-commands per session. */
  private static readonly MAX_RUN_COMMANDS_PER_SESSION = 3;
  /** C5: max concurrent in-flight run-commands across all sessions. */
  private static readonly MAX_RUN_COMMANDS_GLOBAL = 16;
  /**
   * C5: always-on binary denylist (argv[0] basename). Shells and privilege/env
   * launchers are refused unconditionally — they turn the no-shell execFile into
   * an arbitrary-command vector.
   */
  private static readonly BINARY_DENYLIST = new Set([
    'sh', 'bash', 'zsh', 'dash', 'fish', 'ksh', 'csh', 'env', 'sudo',
  ]);

  /** C5: in-flight run-command counts, tracked at spawn/reap. */
  private inFlightGlobal = 0;
  private inFlightPerSession = new Map<string, number>();
  /** C5: live child processes, killed on shutdown. */
  private children = new Set<ChildProcess>();
  /** Serialize hook dispatches that update loop counters for the same session. */
  private sessionLocks = new Map<string, Promise<unknown>>();

  constructor(
    private sessionRepo: ISessionRepository,
    private spellRepo: ISpellRepository,
    private teamMemberRepo: ITeamMemberRepository,
    private eventBus: IEventBus,
    private logger: ILogger,
    private config: HookDispatcherConfig,
  ) {}

  async dispatch(payload: HookDispatchPayload): Promise<DispatchResult> {
    if (!payload?.sessionId) throw new ValidationError('sessionId is required');
    if (!payload?.event) throw new ValidationError('event is required');

    const previous = this.sessionLocks.get(payload.sessionId) ?? Promise.resolve();
    const run = previous.then(
      () => this.dispatchLocked(payload),
      () => this.dispatchLocked(payload),
    );
    this.sessionLocks.set(payload.sessionId, run.then(() => {}, () => {}));
    return run;
  }

  private async dispatchLocked(payload: HookDispatchPayload): Promise<DispatchResult> {
    const dryRun = !!payload.dryRun;
    const session = await this.sessionRepo.findById(payload.sessionId);
    if (!session) throw new NotFoundError('Session', payload.sessionId);

    const actives = (session.activeSpells ?? []).filter(a => a.enabled);
    if (actives.length === 0) return this.emptyResult(dryRun);

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
    if (resolved.length === 0) return this.emptyResult(dryRun);

    const outcomes: HookDispatchSpellOutcome[] = [];
    const matched: DispatchMatchReport[] = [];
    // spellId → (ruleId → newIteration) — applied in one sessionRepo.update at the end.
    const iterationUpdates = new Map<string, Record<string, number>>();

    for (const { active, spell } of resolved) {
      const rules = (spell.rules ?? []).filter(rule => this.ruleMatches(active, rule, payload.event, payload.payload));
      for (const rule of rules) {
        if (dryRun) {
          // C2: match + compose, execute NOTHING (no execFile, no prompt_send, no
          // counter increments, no domain events).
          const { report, outcome } = await this.dryRunRule(session, active, spell, rule);
          matched.push(report);
          if (outcome) outcomes.push(outcome);
          continue;
        }
        try {
          const outcome = await this.executeRuleAction(session, active, spell, rule, payload, iterationUpdates);
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
            status: 'error',
          };
          outcomes.push(outcome);
          void this.emitRuleFired(session, spell, rule, payload.event, outcome);
        }
      }
    }

    if (dryRun) {
      return { ...this.composeResult(outcomes, payload.event), dryRun: true, matched };
    }

    await this.persistIterationUpdates(session, iterationUpdates);
    return this.composeResult(outcomes, payload.event);
  }

  // --- Matching ---

  /**
   * A rule fires when it is enabled (both at the definition AND its per-session
   * runtime override, C4), is a hook trigger for this event, and its matcher
   * matches.
   */
  private ruleMatches(active: ActiveSpell, rule: SpellRule, event: SpellHookEvent, payload?: Record<string, any>): boolean {
    if (!rule.enabled) return false;
    if (active.ruleEnabled?.[rule.id] === false) return false; // C4 runtime disable
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
    iterationUpdates: Map<string, Record<string, number>>,
  ): Promise<HookDispatchSpellOutcome> {
    const action = rule.action;
    switch (action.type) {
      case 'inject-prompt':
        return this.execInjectPrompt(session, spell, rule, action.prompt);
      case 'feed-context':
        return this.execFeedContext(spell, rule, action.prompt);
      case 'continue-loop':
        return this.execContinueLoop(active, spell, rule, action, iterationUpdates);
      case 'run-command':
        return this.execRunCommand(session, spell, rule, action, payload);
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
          status: 'error',
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

  private async execRunCommand(
    session: Session,
    spell: Spell,
    rule: SpellRule,
    action: { type: 'run-command'; command: string; args?: string[]; cwd?: string; feedOutput?: boolean },
    payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    // C5.1–4: permission gate BEFORE any execution — blocked runs are observable.
    const gate = await this.evaluateRunCommandGate(session, action);
    if (!gate.allowed) {
      this.logger.warn('run-command blocked by permission gate', {
        sessionId: session.id, spellId: spell.id, ruleId: rule.id, reason: gate.reason,
      });
      return {
        spellId: spell.id,
        ruleId: rule.id,
        action: 'run-command',
        status: 'blocked',
        error: gate.reason,
        reason: gate.reason,
      };
    }

    // C5.5: concurrency ceiling — per-session + global in-flight caps.
    const perSession = this.inFlightPerSession.get(session.id) ?? 0;
    if (
      perSession >= HookDispatcherService.MAX_RUN_COMMANDS_PER_SESSION ||
      this.inFlightGlobal >= HookDispatcherService.MAX_RUN_COMMANDS_GLOBAL
    ) {
      const reason = `run-command skipped (concurrency cap: session ${perSession}/${HookDispatcherService.MAX_RUN_COMMANDS_PER_SESSION}, global ${this.inFlightGlobal}/${HookDispatcherService.MAX_RUN_COMMANDS_GLOBAL})`;
      this.logger.warn('run-command skipped: concurrency cap reached', {
        sessionId: session.id, spellId: spell.id, ruleId: rule.id,
      });
      return {
        spellId: spell.id,
        ruleId: rule.id,
        action: 'run-command',
        status: 'skipped',
        error: reason,
        reason,
      };
    }

    const cwd = action.cwd
      || (payload.payload?.cwd as string | undefined)
      || session.env?.PWD
      || undefined;

    // Count at spawn; decrement at reap.
    this.inFlightGlobal += 1;
    this.inFlightPerSession.set(session.id, perSession + 1);

    // Fire-and-forget: kick off the child and return immediately. The command's
    // latency is fully decoupled from the hook response. When it finishes, if
    // feedOutput is set, stdout is delivered asynchronously via session:prompt_send.
    const child = execFile(
      action.command,
      action.args ?? [],
      {
        cwd,
        timeout: HookDispatcherService.COMMAND_TIMEOUT_MS,
        maxBuffer: HookDispatcherService.COMMAND_MAX_BUFFER,
      },
      (err, stdout, stderr) => {
        this.reapChild(session.id, child);
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
    this.children.add(child);

    // Synchronous outcome contributes nothing to exit code / stdout.
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'run-command',
      status: 'ok',
    };
  }

  /**
   * C5: decide whether a run-command may execute for the EXECUTING session's team
   * member. Auto-activated/shared spells get no special trust — the gate keys off
   * the running session, not the spell author.
   */
  private async evaluateRunCommandGate(
    session: Session,
    action: { command: string },
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. readOnly permission mode → block outright.
    if (session.teamMemberSnapshot?.permissionMode === 'readOnly') {
      return { allowed: false, reason: 'run-command blocked: session is in readOnly permission mode' };
    }

    // 2. Explicit opt-out via the executing member's command permissions.
    const cmdPerms = await this.resolveCommandPermissions(session);
    if (cmdPerms) {
      if (cmdPerms.commands?.['spell-run-command'] === false) {
        return { allowed: false, reason: 'run-command blocked: spell-run-command disabled for this team member' };
      }
      if (cmdPerms.groups?.['spell'] === false) {
        return { allowed: false, reason: 'run-command blocked: spell command group disabled for this team member' };
      }
    }

    // 3. Always-on binary denylist on argv[0].
    const binary = this.binaryName(action.command);
    if (HookDispatcherService.BINARY_DENYLIST.has(binary)) {
      return { allowed: false, reason: `run-command blocked: "${binary}" is on the shell/privilege denylist` };
    }

    // 4. Optional allowlist — when configured, ONLY listed binaries run.
    const allowlist = this.config.spellCmdAllowlist;
    if (allowlist.length > 0 && !allowlist.includes(binary)) {
      return { allowed: false, reason: `run-command blocked: "${binary}" is not in MAESTRO_SPELL_CMD_ALLOWLIST` };
    }

    return { allowed: true };
  }

  private async resolveCommandPermissions(
    session: Session,
  ): Promise<{ groups?: Record<string, boolean>; commands?: Record<string, boolean> } | null> {
    if (!session.teamMemberId || !session.projectId) return null;
    try {
      const member = await this.teamMemberRepo.findById(session.projectId, session.teamMemberId);
      return member?.commandPermissions ?? null;
    } catch {
      return null;
    }
  }

  /** Basename without extension, so `/bin/bash` and `bash.exe` both match `bash`. */
  private binaryName(command: string): string {
    const base = path.basename(command.trim());
    const dot = base.lastIndexOf('.');
    return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
  }

  private reapChild(sessionId: string, child: ChildProcess): void {
    this.children.delete(child);
    this.inFlightGlobal = Math.max(0, this.inFlightGlobal - 1);
    const perSession = (this.inFlightPerSession.get(sessionId) ?? 1) - 1;
    if (perSession <= 0) this.inFlightPerSession.delete(sessionId);
    else this.inFlightPerSession.set(sessionId, perSession);
  }

  private async execNotifyChannel(
    session: Session,
    spell: Spell,
    rule: SpellRule,
    action: { type: 'notify-channel'; message?: string; level?: SpellNotifyLevel },
    payload: HookDispatchPayload,
  ): Promise<HookDispatchSpellOutcome> {
    const message = action.message || `[${spell.name}] fired on ${payload.event}`;
    // C3: in-app only. Emit an honest notify:progress the UI renders as a toast +
    // activity entry — no external relay, no `channel` routing hint.
    await this.eventBus.emit('notify:progress', {
      sessionId: session.id,
      spellId: spell.id,
      ruleId: rule.id,
      message,
      level: action.level ?? 'info',
    });
    return {
      spellId: spell.id,
      ruleId: rule.id,
      action: 'notify-channel',
    };
  }

  // --- Dry-run (C2) ---

  /**
   * Compute what a matched rule WOULD do without executing anything: no execFile,
   * no session:prompt_send, no counter increments, no domain events. Returns a
   * match-report entry plus (for compose-affecting actions) a side-effect-free
   * outcome so the returned DispatchResult mirrors a live dispatch.
   */
  private async dryRunRule(
    session: Session,
    active: ActiveSpell,
    spell: Spell,
    rule: SpellRule,
  ): Promise<{ report: DispatchMatchReport; outcome?: HookDispatchSpellOutcome }> {
    const action = rule.action;
    const base = { spellId: spell.id, ruleId: rule.id, action: action.type };
    switch (action.type) {
      case 'feed-context':
        return {
          report: { ...base, wouldExecute: true },
          outcome: { spellId: spell.id, ruleId: rule.id, action: 'feed-context', stdout: action.prompt },
        };
      case 'inject-prompt':
        return {
          report: { ...base, wouldExecute: true },
          outcome: { spellId: spell.id, ruleId: rule.id, action: 'inject-prompt' },
        };
      case 'continue-loop': {
        const cap = Math.max(1, action.maxIterations ?? 1);
        const current = active.ruleIterations?.[rule.id] ?? 0;
        const next = current + 1;
        const continues = next <= cap;
        const reason = continues
          ? this.loopContinuationReason(spell, rule, action.loopType, next, cap)
          : `Loop "${rule.label ?? spell.name}" reached max iterations (${cap}).`;
        return {
          report: { ...base, wouldExecute: true },
          outcome: {
            spellId: spell.id,
            ruleId: rule.id,
            action: 'continue-loop',
            continue: continues,
            reason,
            ...(continues ? { stdout: reason } : {}),
          },
        };
      }
      case 'run-command': {
        const gate = await this.evaluateRunCommandGate(session, action);
        return {
          report: { ...base, wouldExecute: gate.allowed, ...(gate.allowed ? {} : { skipReason: gate.reason }) },
        };
      }
      case 'notify-channel':
        return { report: { ...base, wouldExecute: true } };
      default: {
        const _never: never = action;
        return { report: { spellId: spell.id, ruleId: rule.id, action: (_never as any)?.type, wouldExecute: false, skipReason: 'unknown action' } };
      }
    }
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
      const status: HookRuleOutcomeStatus = outcome.status ?? (outcome.error ? 'error' : 'ok');
      await this.eventBus.emit('spell:rule_fired', {
        sessionId: session.id,
        spellId: spell.id,
        ruleId: rule.id,
        event,
        action: rule.action.type,
        outcome: status,
        ...(outcome.reason ? { reason: outcome.reason } : {}),
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
    // Re-read immediately before the write so a spell activation/toggle that
    // completed during rule execution is merged instead of overwritten.
    const current = await this.sessionRepo.findById(session.id);
    if (!current) throw new NotFoundError('Session', session.id);
    const nextActives = (current.activeSpells ?? []).map(a => {
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

  private emptyResult(dryRun = false): DispatchResult {
    return {
      exitCode: 0,
      stdout: '',
      blocked: false,
      continued: false,
      spells: [],
      timestamp: Date.now(),
      ...(dryRun ? { dryRun: true, matched: [] } : {}),
    };
  }

  /**
   * C5: kill every tracked run-command child. Invoked from the container shutdown
   * hook so a server stop doesn't orphan long-running lint/test processes.
   */
  shutdown(): void {
    for (const child of this.children) {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    }
    this.children.clear();
    this.inFlightGlobal = 0;
    this.inFlightPerSession.clear();
  }
}
