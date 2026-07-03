# Backend Contract (for implementability & wiring)

What the UI binds to. All of this is **live on staging** today. Types are the source of
truth from `maestro-server/src/types.ts`; the UI mirrors them in
`maestro-ui/src/app/types/maestro.ts`. Endpoints are under `/api`.

---

## Data shapes (TypeScript, authoritative)

```ts
type SpellColorSlug = 'amber'|'rose'|'violet'|'sky'|'emerald'|'fuchsia'|'lime'|'cyan'|'indigo';

type SpellActionType = 'inject-prompt'|'feed-context'|'run-command'|'continue-loop'|'notify-channel';
type SpellLoopType   = 'single-shot'|'continue-until-done'|'plan-execute'|'critic-refine';
type SpellHookEvent  = 'PreToolUse'|'PostToolUse'|'UserPromptSubmit'|'Stop'|'SubagentStop'|'Notification'|'SessionStart'|'SessionEnd';

type SpellTrigger =
  | { type: 'hook'; hookEvent: SpellHookEvent; matcher?: string }
  | { type: 'schedule'; cron?: string; intervalMs?: number };   // rejected on save (v1)

type SpellActionConfig =
  | { type: 'inject-prompt'; prompt: string }
  | { type: 'feed-context';  prompt: string }
  | { type: 'run-command';   command: string; args?: string[]; cwd?: string; feedOutput?: boolean }
  | { type: 'continue-loop'; loopType?: SpellLoopType; maxIterations?: number }
  | { type: 'notify-channel'; channel?: string; message?: string };

interface SpellRule { id: string; label?: string; enabled: boolean; trigger: SpellTrigger; action: SpellActionConfig }
interface SpellRuleInput { id?: string; label?: string; enabled: boolean; trigger: SpellTrigger; action: SpellActionConfig }

interface Spell {
  id: string; name: string; description: string; icon?: string;
  color: SpellColorSlug; rules: SpellRule[];
  isDefault?: boolean; createdAt: number; updatedAt: number;
}

interface ActiveSpell {
  spellId: string; color: SpellColorSlug; enabled: boolean;
  ruleIterations: Record<string, number>;      // ruleId -> iteration
  ensembleId?: string; castAt: number; castBy: string | null;
}

const ACTIONS_BY_EVENT: Record<SpellHookEvent, SpellActionType[]> = { /* see 02 */ };

interface CreateSpellPayload { name: string; description: string; icon?: string; color: SpellColorSlug; rules: SpellRuleInput[] }
interface UpdateSpellPayload { name?; description?; icon?; color?; rules?: SpellRuleInput[] }
```

`Session.activeSpells: ActiveSpell[]` is where a session's live spells live.

---

## REST endpoints

### Spells (Mechanism A)
| Method | Path | Body / params | Returns |
|---|---|---|---|
| GET | `/api/spells` | — | `Spell[]` (seeds + custom, merged) |
| GET | `/api/spells/:id` | — | `Spell` |
| POST | `/api/spells` | `CreateSpellPayload` | `Spell` (201) |
| PUT | `/api/spells/:id` | `UpdateSpellPayload` | `Spell` (seeds rejected) |
| DELETE | `/api/spells/:id` | — | `{success:true}` (seeds rejected) |
| POST | `/api/spells/:id/activate` | `{ targetSessionIds: string[], invokerSessionId?: string\|null }` | `{ spell, sessions[] }` |
| POST | `/api/spells/:id/deactivate` | `{ targetSessionIds: string[] }` | `{ spell, sessionIds[] }` |

### Casts / entities / custom prompts (Mechanism B)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/spells/definitions?entityType=` | invocation templates |
| GET | `/api/spells/entities/:type?projectId=` | entities of a type to cast from |
| POST | `/api/spells/invoke` | one-shot cast (see `SpellInvocationPayload`) |
| GET/POST/PUT/DELETE | `/api/spells/custom-prompts[/:id]` | custom prompt CRUD |

### Ensembles (Mechanism A, advanced)
| Method | Path |
|---|---|
| GET | `/api/ensembles`, `/api/ensembles/:id` |
| POST | `/api/ensembles` |
| PUT | `/api/ensembles/:id` |
| POST | `/api/ensembles/:id/members`, `/api/ensembles/:id/disband`, `/api/ensembles/:id/message` |
| DELETE | `/api/ensembles/:id/members/:sessionId` |

---

## WebSocket events (real-time — subscribe & update stores)

| Event | Payload (key fields) | UI effect |
|---|---|---|
| `spell:activated` | `{ spellId, sessionIds, activeSpell, timestamp }` | add ring/chip on target sessions |
| `spell:deactivated` | `{ spellId, sessionIds, timestamp }` | remove ring/chip |
| `spell:invoked` | invocation result per target | cast feedback pulse/toast (Mechanism B) |
| `spell:rule_fired` | `{ sessionId, spellId, ruleId, event, action, outcome }` | activity feed / "it fired" (S8) — **note: not yet forwarded by the WS bridge; see 05** |
| `session:prompt_send` | `{ sessionId, content, ... }` | how inject-prompt + run-command output reach the terminal (delivery channel) |
| `notify:progress` | `{ sessionId, message, channel? }` | notify-channel output → relay |

---

## Existing UI plumbing (what you'll build on)

- **Stores (Zustand):** `useSpellLibraryStore` (catalog + recents + CRUD),
  `useActiveSpellsStore` (**source of truth** for active spells per session; WS-driven),
  `useSpellActivationStore` (cast/deactivate + receipt/undo), `useSpellLauncherStore` (launcher
  UI state), `useSpellbookStore` (drawer), `useEnsembleStore`.
- **Client:** `maestro-ui/src/utils/MaestroClient.ts` (typed REST).
- **Helpers:** `utils/spellSummary.ts` (rule-summary language, KNOWN_TOOLS, isRiskySpell,
  loopProgress), `utils/spellRings.ts` (ring rendering off `color`), `utils/useSpellCastPulse.ts`.
- **Env:** staging server on `:4569`, UI (Vite) on `:4568`, `VITE_API_URL=http://localhost:4569/api`.

---

## Behavior notes that affect UX copy

- **Editing an active spell** is safe: the dispatcher **re-reads rules at fire time**, so
  edits apply on the next trigger. No re-cast needed. (Say this in the editor.)
- **Re-casting** an already-active spell preserves in-flight loop counters for unchanged rules.
- **run-command** is async fire-and-forget; output (if `feedOutput`) arrives later via
  `session:prompt_send`. Long commands don't block the agent and aren't dropped.
- **inject vs feed**: inject emits `session:prompt_send` (delivered as a prompt); feed returns
  the text as context (stdout). Same authoring control, different delivery.
- **Clean-break migration** ran on the staging server's first boot after merge — old
  single-action custom spells were removed and the new seeds regenerated. Fresh data is on the
  new model; the UI never has to handle old-shape spells.
- **Security:** hook dispatch is self-only (a session can't drive another's spells);
  `run-command` uses `execFile` (no shell expansion). Authoring run-command rules may be gated
  by command permissions.
