# Config & Options Reference (Data Dictionary)

Every configurable field, its allowed values, defaults, and constraints — so you know
exactly which controls the UI needs and what each can hold. **All of this is enforced by the
shipped backend**, so designing outside these bounds isn't buildable without a backend change.

---

## Spell (top-level)

| Field | Type | Required | Constraints / notes | UI control implied |
|---|---|---|---|---|
| `name` | string | ✅ | 1–60 chars | text input |
| `description` | string | ✅ | ≤ 1000 chars; human summary only (NOT the injected body) | short textarea |
| `icon` | string (emoji) | ➖ | ≤ 10 chars; single emoji in practice | emoji picker / input |
| `color` | enum slug | ✅ | one of 9 (below) | color swatch picker |
| `rules` | Rule[] | ✅ | **1–20 rules** | repeatable rule builder |
| `isDefault` | bool | (read) | true = seed (read-only, non-deletable) | badge |
| `createdAt`/`updatedAt` | number (ms) | (read) | timestamps | metadata display |

### Colors (exactly these 9 — used for the ring identity)

| Slug | Hex |
|---|---|
| `amber` | #f59e0b |
| `rose` | #f43f5e |
| `violet` | #8b5cf6 |
| `sky` | #0ea5e9 |
| `emerald` | #10b981 |
| `fuchsia` | #d946ef |
| `lime` | #84cc16 |
| `cyan` | #06b6d4 |
| `indigo` | #6366f1 |

> Color is the spell's visual identity on session rings. Because rings stack (multiple active
> spells = concentric rings), design the picker and the ring rendering to stay legible with
> 3–5 overlapping colors, and **never rely on color alone** (pair with icon/label).

---

## Rule

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | (server-assigned) | stable; used for loop-counter identity |
| `label` | string | ➖ | human handle; shows in summaries + active surfaces |
| `enabled` | bool | ✅ | disabled rules are saved but never fire |
| `trigger` | Trigger | ✅ | see below |
| `action` | ActionConfig | ✅ | see below |

---

## Trigger

Discriminated on `type`.

### `type: 'hook'` (available now)
| Field | Type | Required | Notes |
|---|---|---|---|
| `hookEvent` | enum (8) | ✅ | see Hook events below |
| `matcher` | string (regex) | ➖ | tested against tool name (tool events) or a payload field; empty = fire on every occurrence; capped at 4096 chars; unsafe/catastrophic regex rejected |

### `type: 'schedule'` (MODELED, NOT ACTIVE)
| Field | Type | Notes |
|---|---|---|
| `cron` | string | reserved |
| `intervalMs` | number | reserved |

> **Schedule is rejected on save in v1.** Design it as a **visible but disabled** option
> ("Scheduled triggers — coming soon") so the mental model includes it, but users can't
> create dead config.

### Hook events (all 8) — with the plain-English copy the UI should use

| Event | Fires when… | Good for |
|---|---|---|
| `SessionStart` | a session begins | priming context, setup commands |
| `UserPromptSubmit` | the user submits a prompt | injecting standing instructions |
| `PreToolUse` | just **before** the agent runs a tool | pre-checks, warnings (matcher = tool name) |
| `PostToolUse` | just **after** the agent runs a tool | lint/test after Edit/Write, feedback (matcher = tool name) |
| `Notification` | the agent emits a notification (e.g. needs input) | nudges, progress pings (matcher = message text) |
| `Stop` | the agent finishes its turn / would stop | **loops** (keep going), notify-on-done, wrap-up commands |
| `SubagentStop` | a spawned subagent finishes | loops/notify at subagent boundaries |
| `SessionEnd` | the session is ending (terminal) | cleanup commands, final notify **only** |

> Note the matcher's target differs by event: for `PreToolUse`/`PostToolUse` it matches the
> **tool name** (Edit, Write, Bash, …); for other events it matches a payload field
> (message, path) or the raw payload. Reflect this in the matcher control's help text.

---

## Action + config

Discriminated on `type`. Show only the panel for the selected action.

### `inject-prompt`
| Field | Type | Required | Notes |
|---|---|---|---|
| `prompt` | string | ✅ | pushed into the session as if typed (delivered as a prompt) |

### `feed-context`
| Field | Type | Required | Notes |
|---|---|---|---|
| `prompt` | string | ✅ | supplied to the agent as context it reads (stdout channel) |

> **inject vs feed** — same input control (a body textarea), different delivery. The UI must
> label the distinction. Inject = "say this to the agent." Feed = "give the agent this context."

### `run-command`
| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `command` | string | ✅ | — | executable (no shell expansion — args are literal, safer) |
| `args` | string[] | ➖ | [] | argument list |
| `cwd` | string | ➖ | session working dir | where it runs |
| `feedOutput` | bool | ➖ | **false** | if on, stdout is fed back to the agent when the command finishes |

> Runs **async** (fire-and-forget): the agent isn't blocked, and output (if `feedOutput`) is
> delivered when the command completes — even for long (>4s) commands. **Requires an explicit
> "runs shell commands" acknowledgement in the UI before save.** No timeout field is exposed
> (capped server-side).

### `continue-loop` (only on `Stop` / `SubagentStop`)
| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `loopType` | enum (4) | ➖ | `single-shot` | shapes the nudge text (below) |
| `maxIterations` | int | ➖ | 1 | ≥ 1; the cap after which looping stops |

Loop types:
| Value | Meaning (nudge given to the agent each iteration) |
|---|---|
| `single-shot` | plain "keep going" |
| `continue-until-done` | "continue until the task is complete" |
| `plan-execute` | "now execute the plan you wrote" |
| `critic-refine` | "critique your previous output and refine it" |

### `notify-channel`
| Field | Type | Required | Notes |
|---|---|---|---|
| `channel` | string | ➖ | routing hint (e.g. `telegram`, `slack`); relay decides delivery |
| `message` | string | ➖ | overrides the default "[spell] fired on <event>" text |

---

## Capability matrix — which actions are allowed on which event

**This is a hard constraint** (enforced by schema). The action dropdown for a rule must be
filtered to exactly these per selected event:

| Event | inject-prompt | feed-context | run-command | continue-loop | notify-channel |
|---|:---:|:---:|:---:|:---:|:---:|
| PreToolUse | ✅ | ✅ | ✅ | — | ✅ |
| PostToolUse | ✅ | ✅ | ✅ | — | ✅ |
| UserPromptSubmit | ✅ | ✅ | ✅ | — | ✅ |
| Stop | ✅ | ✅ | ✅ | ✅ | ✅ |
| SubagentStop | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notification | ✅ | ✅ | ✅ | — | ✅ |
| SessionStart | ✅ | ✅ | ✅ | — | ✅ |
| SessionEnd | — | — | ✅ | — | ✅ |

---

## Active spell (per session) — runtime state the UI reads

| Field | Type | Notes |
|---|---|---|
| `spellId` | string | which spell |
| `color` | slug | denormalized for ring rendering |
| `enabled` | bool | on/off for this session |
| `ruleIterations` | map ruleId→int | live loop counters (drives "iteration 2/3") |
| `ensembleId` | string? | set if part of an ensemble |
| `castAt` | number | when cast (drives ring order — oldest = outer) |
| `castBy` | string\|null | session that cast it, or null for UI |

---

## Cast modes

| Mode | Behavior | Target count |
|---|---|---|
| **Single** | activate on exactly one session | 1 |
| **Broadcast** | activate on each of N sessions, independently | ≥ 1 |
| **Coordinate** | N sessions form an **ensemble** with a shared objective | ≥ 2 |

> `castMode`/`ensembleName` are UI concepts — the activate call just sends a list of session
> ids. Coordinate mode additionally creates an ensemble.

---

## Seed library (the curated built-ins that ship)

These appear in the library as read-only seeds. Use them to sanity-check that your list/detail
designs handle real content. (Every `run-command` seed ships **disabled by default**.)

| Seed | Rules |
|---|---|
| **Self-Critic** | Stop → continue-loop `critic-refine`, max 3 |
| **Plan-First** | Stop → continue-loop `plan-execute`, max 2 |
| **Progress Pulse** | Notification → inject-prompt ("report progress") |
| **Context Primer** | SessionStart → feed-context (task/docs primer) |
| **Notify-on-Done** | Stop → notify-channel |
| **Lint-on-Edit** | PostToolUse matcher `Edit\|Write` → run-command (feedOutput), **disabled by default** |
| **Guardrail Combo** | PostToolUse `Edit\|Write` → run-command **(disabled)** + Stop → notify-channel (a multi-rule example) |

---

## Validation limits (surface these as inline errors)

- Spell name 1–60 chars; description ≤ 1000; icon ≤ 10.
- 1 ≤ rules ≤ 20.
- `inject-prompt`/`feed-context` → `prompt` must be non-empty.
- `run-command` → `command` must be non-empty; requires the shell-command acknowledgement.
- `continue-loop` → allowed only on Stop/SubagentStop; `maxIterations` ≥ 1.
- Action must be in the capability matrix for the chosen event.
- Matcher must be a safe regex, ≤ 4096 chars.
- `schedule` triggers are rejected on save (v1).

---

## Entities & templates (Mechanism B — for the cast/invoke surfaces)

Entity types you can cast from: `maestro` (project), `task`, `team-member`, `skill`,
`session`, `doc`, `custom-prompt`. Each exposes named verbs/templates (e.g. task → `void`
"get details", `refer`, `execute`; team-member → `adopt`; doc → `review`; universal `send`).
Plus a set of curated "default" entities (Sprint Planning, Break Down into Subtasks, Bug
Triage, Refactor, Write Tests, …) and user-created custom prompts. This mechanism is
unchanged; the redesign only needs to keep its entry points clear and separate from spells.
