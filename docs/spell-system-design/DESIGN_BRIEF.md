# Spell System Redesign — Design Brief (ground truth for all agents)

Read this + the 6 diagrams in `docs/spell-system-design/*.excalidraw` before any work.

## Repo
Agent Maestro, Bun monorepo. **maestro-server** (Express, CommonJS, file persistence in `~/.maestro*/data/`), **maestro-cli** (Commander, ESM, runs inside Claude sessions), **maestro-ui** (Tauri 2 + React 18 + Zustand + xterm.js). Use `graphify query "<q>"` before grepping.

## Current state (what exists)
Spells are stateless, fire-and-forget. Hardcoded `SPELL_REGISTRY` + `DEFAULT_SPELL_ENTITIES` in `SpellService.ts`. `invoke()` interpolates a `{{key}}` template and emits `session:prompt_send` → UI writes it into the PTY. Only persisted entity is `CustomPrompt`. No activation state, no color, no triggers, no hooks. Two latent bugs: invoke() double-injects (`session:prompt_send` + `spell:invoked` both write PTY); CLI `spell invoke`/`create` send fields the `.strict()` Zod schemas reject.

## Hard constraint
Claude reads `hooks.json` ONCE at session start — no mid-session hook reload. So triggers use **fixed wiring, dynamic behavior**: bind every hook event once to `maestro hook dispatch <EVENT>`, which asks the server which active spells match and acts. Toggle = server state.

## Locked decisions
- **Spell** = first-class persisted entity (`FileSystemSpellRepository`, `data/spells/*.json`), curated `SPELL_LIBRARY` seeds merged with user custom spells. Fields: id, name, description, icon, **color** (from fixed `SPELL_COLORS` palette), action, **loopType**, **trigger{hookEvent,matcher,enabled}**, **failMode** (open|closed, per-spell), maxIterations, skillRef?, isDefault.
- **Activation** = `Session.activeSpells: ActiveSpell[]` {spellId, color, enabled, hookEvent?, matcher?, iteration, ensembleId?, castAt, castBy}. WS `spell:activated/deactivated`.
- **Activation semantics** = per-spell-type (some re-inject each fire, some bounded loop, some gate, some once).
- **Action taxonomy → hook protocol**: inject-prompt (PTY), feed-context (stdout), gate (PreToolUse exit 2 + reason, honors failMode), continue-loop (Stop exit 2, capped), run-command (HookExecutor), notify-channel (maestro-notify).
- **Loop types (real scaffolds v1)**: single-shot, continue-until-done, plan-execute, critic-refine.
- **Attach** = on the task (`Task.spellIds`, baked into manifest at spawn, auto-activate) AND live-cast on running sessions.
- **Color** = fixed on the spell from a palette. **Borders** = concentric rings (cap 4 → "+N") on ALL THREE boxes: list tile (`pn-st`), Spaces rail (`pn-srail-s`), terminal panel (`.terminalContainer`). Generalize the existing `coordinator-glow` inset-shadow.
- **Library** = curated + custom spells + custom skills. Skills stay file-based (`SKILL.md`), linkable from a spell via `skillRef` (new `SkillWriter` + `POST /api/skills`).

## Multi-session & ensembles
- **Multi-target invoke**: `targetSessionIds[]` + `invokerSessionId` (null=UI). Server stamps `senderSessionId`. CLI `maestro spell invoke <id> --targets a,b,c`.
- **castMode**: single | broadcast (same prompt to all) | coordinate (roles + shared objective).
- **Ensemble** (new persisted entity): {id, name, color, objective, memberSessionIds[], leaderSessionId?, spellId, createdBy}; `ensemble:created/updated/disbanded` WS. Members carry an `ActiveSpell` with `ensembleId` → shared-color ring + grouping. Persistent, with cross-session channel `maestro ensemble message "<text>"`. Both agents and users can initiate.

## Feasibility gate — RESOLVED: PASSED (see exit-2-verification-spike.md)
Verified on Claude Code 2.1.153: PreToolUse `exit 2` blocks the tool + feeds stderr to the model; Stop `exit 2` forces continuation. **gate + continue-loop ship as NATIVE exit-2 actions — no PTY fallback.** Caveat: filter the cosmetic "Stop hook error" tray notification (key `stop-hook-error`) while a continue-loop spell is active.

## Build phases
1 Foundation (Spell entity, Session.activeSpells, activate/deactivate routes+WS, fix double-inject + CLI contract bugs) → 2 Dispatcher (`maestro hook dispatch`, bind events, server evaluator; verify exit-2) → 3 Gates & loops → 4 UI (rings on 3 boxes, redesigned picker + details) → 5 Task assignment (Task.spellIds, manifest, auto-activate) + multi-session/ensembles → 6 Custom spell + skill creation.

## Frozen decisions (from M1 audit — canonical)
- **invoke contract**: `invoke()` = set activation state + deliver prompt via the SINGLE `session:prompt_send` path. `spell:invoked` becomes UI-feedback-only (no PTY write). Removes the double-inject bug.
- **schema canonical side**: server `.strict()` schemas are the source of truth; FIX THE CLI to match — `spell invoke` sends `entityType` + `projectId` (+ optional `targetSessionIds`, `invokerSessionId`); `spell create` sends `content` (not `prompt`).
- **action taxonomy enum (frozen)**: `inject-prompt | feed-context | gate | continue-loop | run-command | notify-channel`.
- **ensemble persistence**: disk-persisted via `FileSystemEnsembleRepository` (survives restart); Phase 4, isolatable.
- **exit-2 gate**: Phase 0 spike `docs/spell-system-design/exit-2-verification-spike.md` decides whether gate/continue-loop ship as exit-2 or fall back to PTY-prompt. Does NOT block the rest.
- **build order**: P0 exit-2 spike → P1 foundation (entity/repo, activeSpells, Task.spellIds, activate/deactivate+WS, fix double-inject + CLI schema, SPELL_COLORS, freeze enum, container wiring) → P2 dispatcher (`maestro hook dispatch`, manifest.spells, spawn auto-activate) → P3 gates/loops (if P0 passed) → P4 ensembles. UI builds against mocked stores in parallel from P1.

## Quality bar
UI/UX must be top-notch, stunning, properly engineered: cohesive design tokens, accessible (WCAG), light + dark themes, no jank, additive with existing selected/needsInput/coordinator visuals.
