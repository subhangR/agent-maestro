# tm8 — The Execution Transplant

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R16–R20, R27–R29; source-audit corrections applied); verified per `08-AMENDMENT-VERIFICATION.md`; **rewritten in place for AM-1/T-D21 (no Tauri — tm8 is server + web only; server-side PTY is the only spawn path)**. Execution (running agent sessions) is the one capability not specified by the Collab V2 corpus. The true lifts (PTY host, WS engine, terminal UI, prompt composition — audited portable) are **transplanted, never rewritten**; spawn/manifest is a **bounded re-authoring with the old code as behavioral spec** [R27]. This doc is the corrected inventory.

---

## 1. Transplant inventory

### 1.1 Lifts as-is (copy, keep the scars)

| Asset | Why it's load-bearing |
|---|---|
| **PTY host** (server-side pty management) | node-pty must run under **node, not bun** (onData never fires under bun; bun strips spawn-helper exec bit). 16ms output-frame coalescing. What was `MAESTRO_PTY_HOST=server` mode in old maestro is **the architecture** in tm8 (T-D21): all sessions spawn on the server PTY host — laptop, hub, and hosted workspaces are the same path; there is no client-side spawn. |
| **WS bridge** (batching, per-entity throttling, subscription filtering, immediate bypass for spawn/modal) | The *engine* lifts cleanly behind its event-bus seam. **Budgeted delta [R28]:** ~40% of the module (~150–190 LOC) is policy hard-wired to the old entity taxonomy — immediate-bypass lists, per-entity throttle tables, subscription families, namespace filtering — and is a deliberate small rewrite (~200 LOC) against the WorkspaceEvent + `work_session` vocabulary. Semantically load-bearing (spawn/modal immediacy is what makes the desktop feel right). One socket per client for graph events *and* stream frames. |
| **Terminal UI components** (browser app) | xterm setup, write scheduler, WebGL renderer on Chromium with DOM fallback, unmount-terminals-of-exited-sessions memory work, bounded log strips. tm8 is web-only (T-D21); the lifted renderer path is the one old maestro already shipped on web. |
| **Spawn wire contract** | The `session:spawn` payload shape (session, command, cwd, envVars, manifest path, ids, spawn provenance) is preserved **verbatim** as the internal server→UI contract [R29]: the server PTY host executes the spawn, the UI receives the event over the WS bridge and attaches a terminal to the session's stream, and CLI `worker init` boots the agent inside the server-hosted PTY. (Old maestro's Tauri-side spawn handler is **not** transplanted — T-D21 removed the client-spawn path entirely.) |

### 1.2 Re-authored with behavioral parity — bounded build, NOT a lift [R27]

**Spawn + manifest composition.** *Corrected per the source audit (07 §8):* there is no spawn *service* to transplant. Today's flow is an ~850-LOC inline route reading **seven** entity types (sessions, tasks, team members, model profiles, project, team, spells), performing git side effects (worktrees), applying a ~5-level launch-config precedence chain + permission-mode inheritance + coordinator/sub-team re-rooting, with a hardcoded 27-entry model-power table — and manifest composition runs as a **CLI subprocess reading `~/.maestro/data` files directly** (the route `flush()`es repos to feed it), duplicating the launch/permission logic verbatim.

The tm8 plan: **write a real `SpawnService` in the execution block implementing the behavioral spec that the old code constitutes** — precedence chains, coordinator/sub-team resolution, worktree flow, spell injection — against graph reads through the contract, with manifest composition moved **in-process** (killing the subprocess + shared-disk pipeline and the flush hack; the CLI keeps only manifest *reading*). The model-power ranking becomes model-profile **data** (one place, not two). Bounded, well-understood work: **~1,500–2,000 LOC planned as a build, not budgeted as a lift.** Target shape:

```
spawn(taskIds, teamMemberId, mode) — one transaction through the contract:
 1. read task / team_member / space entities (graph reads; all needed fields exist:
    identity, mode, permission_mode, command_permissions, model, agent_tool)
 2. create work_session entity + working_on edge(s); created_by = spawning actor
 3. compose manifest (prompt context, skills, spells, permissions) → session_manifests side table
 4. emit spawn_request over the WS bridge (immediate-bypass class, as today)
 5. terminal boots → CLI reads manifest → agent runs
```

Report-back writes become graph appends: progress → messages anchored to the work_session/task; status → work commands; PR → link-pr command. Session timeline is retired in favor of anchored messages + activity (inherited law: one message shape).

**Single-writer status [R29]:** today session status has 3+ independent writers (create route, PTY host on exit, stop route, agent-side REST flips). In tm8 every transition funnels through one function in the execution block → one command → one WorkspaceEvent. **Preserved integration shape [R29]:** the `session:spawn` payload (session, command, cwd, envVars, manifest path, ids, spawn provenance) is preserved verbatim as the server→UI wire contract; spawn executes on the server PTY host (T-D21), the UI only attaches. **Status chattiness [R20]:** idle-detection flapping is debounced in the execution block *before* touching the graph — status is graph state; keystroke-grade liveness never becomes entity writes. **Skills/spells feed the manifest from the graph [R19]:** the spawn transaction renders `equips`-edged spell/skill content into the manifest (replacing filesystem scope-loading); the hardened spell *engine* (gating, ensembles, notify) is homed in the **server block** as a WorkspaceEvent-driven service (see 06, "Homes for the completeness holes").

### 1.3 Replaced (deliberately)

**The agent-facing CLI surface.** Agents speak the **graph CLI** (`walk`, `get`, `list`, `message send`, `edge add`, `pull`, `task status/complete`, `pr link` — the inherited `03-CONSUMER-SURFACES` tree), space-scoped via pinned spaceId. A **compat adapter** maps the old verbs onto graph ops during transition so existing skills/spells/prompts keep working. *Corrected scope [R18]:* the audited runtime surface is ~54 REST endpoints / ~7,800 LOC — the adapter is **the worker + coordinator core loop, not six report verbs**. Frozen v1 list (pending the prompt-corpus grep): **task report \*** , **task create/edit/get/list/children/tree**, **task docs add**, **session report \***, **session prompt**, **session siblings**, **session spawn** (coordinators spawn workers — depends on `execution.spawn`, §5), **team-member list/get**, **modal** [R29], **whoami/status**. Spell/modal-show/master verbs migrate natively to graph grammar (coordinator-facing, re-promptable; `master` cross-project → cross-space queries).

| Old verb | Graph op |
|---|---|
| `maestro task report progress <id> "…"` | message anchored to task (+activity) |
| `maestro task report complete <id> "…"` | `commands/work` → in_review/done + message |
| `maestro task create/edit/get/list/…` | `entities.create/patch/get`, `collections.query` |
| `maestro session report …` | message anchored to own work_session + status |
| `maestro session prompt <id> --message` | **`execution.prompt` — PTY delivery, not just a message [R17]**: see §6 |
| `maestro session spawn …` | `execution.spawn` [R16/R18] |
| `maestro session siblings` | collection query: work_sessions in space |
| `maestro task docs add` | create doc + `attached_to` edge |
| `maestro modal …` | session_modals side table ops + immediate-class event [R29] |

The adapter is sugar over the operation catalog (T-L12) and ages out as prompts migrate to the graph grammar.

## 2. The seam law

**The execution block talks to the graph only through the contract** — spawn reads entities via the service layer, runtime emits WorkspaceEvents, report-back writes messages/edges/commands. It never reaches into tables and never smuggles a Session-shaped blob into the graph. This seam is what makes execution a *block* (T-L1) rather than a second data model.

## 3. Streams (restating T-L10 operationally)

- PTY frames: PTY → tm8-server fan-out → WS → terminal component. Multiple subscribers already supported (multi-window today); sharing = non-owner subscribers admitted after a graph authorization check.
- The DB is in the path only for: work_session status transitions, share_mode changes, transcript artifact on exit. Frame traffic never touches it.
- Remote viewing: viewer → session's home server (direct or via gateway relay). Hosted workspaces: the PTY host runs on the hub slot; identical path.

## 4. Carried operational lessons (verbatim into tm8's engineering notes)

- Run the server's PTY code under node; never bun (node-pty incompatibilities).
- Never run parallel UI builds (vite SIGTERM storm); verify with scoped `tsc -b`.
- WebGL xterm renderer on Chromium, DOM fallback otherwise (tm8 is browser-only per T-D21; the old Tauri addon-crash lesson survives as: never assume a GPU renderer, always keep the DOM fallback).
- Server test suites: `--forceExit` (open-handle hangs).
- Terminal perf: coalesce PTY output into 16ms frames server-side; bound client-side log memory; unmount exited terminals.
- Spawned workers get bypass permissions (no prompt stalls); parallel workers need disjoint working trees (worktree-per-worker or package-disjoint scopes).

## 5. The execution operation family [R16]

The inherited operation catalog has zero execution verbs; tm8 extends it with an `execution.*` family, designed now so CLI/MCP/UI projections stay T-L12-clean and `capabilities`/`/actions` can honestly gate them (`501 not_implemented` on nodes with execution disabled — the T-L1 composition story depends on this):

```
execution.spawn        create work_session + working_on edges + manifest + spawn_request (the R27 SpawnService)
execution.prompt       deliver text INTO a live session's PTY (§6)
execution.terminate    stop a session (single-writer transition, R29)
execution.streams.attach   subscribe to the PTY fan-out (view; drive = later permission tier)
```

## 6. `session prompt` is a delivery mechanism, not a message [R17]

Today `maestro session prompt <id> --message` *injects text into the target session's PTY* — it makes an agent act. An anchored message is inert unless something delivers it. tm8 specifies the mechanism: the execution block, for each live work_session it hosts, subscribes to `execution.prompt` commands (and/or messages anchored to that session flagged for delivery) and **injects into the PTY, marking delivery**. Without this, every coordinator↔worker protocol breaks *silently* — messages land in the graph, agents never see them. This is the single most dangerous silent-failure seam in the transplant; it is a named v1 requirement, not an option.

## 7. What v1 execution parity means (acceptance)

tm8 v1 replaces local maestro when: spawn from a task (any team_member persona, any mode) → terminal opens → agent boots with correct manifest/prompt → progress/report-back lands in the graph → session card/panel reflects live status → exit produces transcript artifact → all with terminal latency and stability at parity with current maestro (the perf work is the regression bar, not an aspiration).
