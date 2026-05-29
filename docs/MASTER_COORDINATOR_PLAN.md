# Master Coordinator — Architecture & Feature Plan

> Status: design proposal. Owners: backend + CLI + UI.
> Session: `sess_1779990479114_j9g0f60ka` · Task: `task_1779973534490_tgkvb9pj4`

## 1. Goal

Let a **master project** host sessions that can **observe and coordinate work across every project** on the server:

1. List all projects.
2. List **active** sessions and tasks in any project.
3. **Send a message / prompt** to any session in any project.
4. Get back enough timeline / status to know whether the message landed and what changed.

Today the read paths (#1, #2 partially, #3 partially) exist; the write path (#3) is hard-blocked by a team-boundary check, and there is no live observation channel (#4). This doc covers what to keep, what to extend, and what to add.

---

## 2. Current State (audit summary)

| Concern | Status | Location |
|---|---|---|
| `Project.isMaster` flag | ✅ | `maestro-server/src/types.ts:137` |
| `Session.isMasterSession` derived flag | ✅ | `maestro-server/src/types.ts:382`, set in `SessionService.ts:39-42` |
| Master auth middleware (`X-Session-Id` → isMasterSession) | ✅ | `maestro-server/src/api/masterRoutes.ts:15-55` |
| `GET /api/master/{projects,tasks,sessions,context}` | ✅ | `masterRoutes.ts` |
| CLI `maestro master {projects,tasks,sessions,context}` | ✅ | `maestro-cli/src/commands/master.ts` |
| `canUseMasterCommands` capability gating | ✅ | `maestro-cli/src/prompting/capability-policy.ts:24,170` |
| Manifest exposes `masterProjects[]` to agent | ✅ | `manifest-generator.ts:320-344`, prompt section `prompt-builder.ts:852-886` |
| UI toggle for `isMaster` | ✅ | `ProjectTabBar.tsx:233-248` |
| **Cross-project prompt** (`POST /sessions/:id/prompt`) | ❌ blocked | `sessionRoutes.ts:231-245`, `canCommunicateWithinTeamBoundary()` |
| **Active-only filter** on `/master/sessions` | ❌ | n/a |
| **WS subscription** to "all projects" / per-master fanout | ❌ | `WebSocketBridge.ts:27-31, 341-383` filters by single `projectId` |
| Master UI dashboard | ❌ | n/a |
| Master-to-session reply / response channel | ❌ | prompts are fire-and-forget |
| Persisted mail (Mail entity referenced in docs) | ❌ not implemented | — |

**TL;DR:** master read APIs exist; master *write* (talk to a session in another project) is the missing piece, plus a live view.

---

## 3. Design principles

1. **Authorization is server-enforced.** A master session's authority is proven by the session record (`isMasterSession === true`) verified against `X-Session-Id` on every request — never by client-claimed flags.
2. **Don't fork the prompt endpoint.** Extend the existing `POST /sessions/:id/prompt` with a master-bypass for the team-boundary check, instead of adding a parallel master prompt route. Single ingress point = single audit trail.
3. **Master is observe-and-direct, not own.** Master sessions never become the `parentSessionId` of a session they didn't spawn. Cross-project prompts are recorded with `senderSessionId` + `master: true` flag on the timeline event so the target's lineage stays intact.
4. **The CLI is the contract.** Anything the UI dashboard can do, a master agent can do via `maestro master *` commands. Keep the agent-facing surface in lockstep with the UI surface.
5. **Subscription explicitness.** A master WS client opts in to global fanout (`subscribeAllProjects: true`) rather than implicitly receiving everything; default behavior for non-master clients is unchanged.

---

## 4. Feature increments

Plan ships in four increments so each is testable in isolation. Estimated effort in parentheses.

### Increment A — Active-session view (S)

**What:** A master session needs to see what's *running right now*, not historical sessions.

**Server changes:**
- Extend `GET /api/master/sessions` with `?status=active` (alias for `status IN ('spawning','idle','working')`) and `?status=<csv>` for explicit lists.
- Add `?includeCompleted=false` default to **drop** `completed|failed|stopped` from default master list responses; pass `=true` to opt in.
- Add `GET /api/master/sessions/:id` — single session detail by id with master auth (no projectId scoping). Returns full session including `timeline`, `taskIds`, `teamMemberSnapshots`.
- Add `GET /api/master/tasks?status=active` similarly (`in_progress|in_review|blocked`).

**CLI changes (`master.ts`):**
- `maestro master sessions --active` (default for new flag) and `--status <csv>`.
- `maestro master session <id>` — show full detail.
- `maestro master tasks --active`.

**UI:** none in this increment.

**Tests:** Jest in `maestro-server/test/api/masterRoutes.test.ts` for active filters; Vitest in `maestro-cli/tests/commands/master.test.ts`.

---

### Increment B — Cross-project prompt (M) — **the core enable**

**What:** A master session can send a prompt to any session in any project.

**Server changes (`sessionRoutes.ts`):**

Replace the boundary check at `sessionRoutes.ts:732-742` with:

```ts
const isMasterSender = senderSession?.isMasterSession === true;
const sameProject = senderSession?.projectId === session.projectId;

const allowed =
  isMasterSender ||
  canCommunicateWithinTeamBoundary(senderSession, session);

if (!allowed) {
  return res.status(403).json({
    error: true,
    code: 'prompt_scope_violation',
    message: isMasterSender
      ? 'Internal error: master session unexpectedly rejected.'
      : 'Session prompt is limited to parent/sibling/team sessions.',
    details: { senderSessionId, targetSessionId: sessionId },
  });
}
```

Then in the timeline event, tag master-originated prompts so they're auditable:

```ts
await sessionService.addTimelineEvent(
  sessionId,
  'prompt_received',
  `Received prompt from ${isMasterSender ? 'MASTER ' : ''}session ${senderSessionId}: "${preview}"`,
  undefined,
  { senderSessionId, mode, master: isMasterSender, crossProject: !sameProject }
);
```

Prepend sender identity already happens via `prependSenderIdentity()`; extend it for master:
```ts
const prefix = isMasterSender
  ? `[From: ${senderName} (master ${senderSessionId})]`
  : `[From: ${senderName} (${senderSessionId})]`;
```

Capability gate stays where it is — `canPromptOtherSessions` is enforced *client-side* on the agent; *server-side* enforcement is the master/team-boundary check above.

**CLI changes:**
- Update `canPromptOtherSessions` in `capability-policy.ts:171` to also be `true` when `options.isMasterSession`:
  ```ts
  canPromptOtherSessions:
    (isCoordinatedMode(mode) && allowed.has('session:prompt')) ||
    (options.isMasterSession && allowed.has('session:prompt')),
  ```
- Add `session:prompt` to the master command set so master sessions get it injected automatically.
- New convenience command: `maestro master prompt <targetSessionId> --message "<text>" [--mode send|paste]` — thin wrapper around the existing prompt endpoint, but with explicit master context. Internally hits `POST /api/sessions/:id/prompt` with `senderSessionId = MAESTRO_SESSION_ID`.

**UI:** none yet.

**Tests:**
- Server: master session can prompt arbitrary session; non-master cross-project prompt still 403s; timeline event records `master: true, crossProject: true`.
- CLI: `master prompt` snapshot test + permission gate when invoked from non-master session.

---

### Increment C — Master live view via WebSocket (M)

**What:** A master UI (and optionally a master agent) sees real-time updates across all projects without a per-project subscribe dance.

**Server changes (`WebSocketBridge.ts`):**

1. Extend `SubscriptionFilter` (line 27-31):
   ```ts
   interface SubscriptionFilter {
     sessionIds?: Set<string>;
     projectId?: string;
     projectIds?: Set<string>;          // NEW: multi-project subscribe
     taskIds?: Set<string>;
     allProjects?: boolean;             // NEW: master fanout opt-in
   }
   ```

2. In `shouldFilterOut()` (line 341-383): if `allProjects === true`, never filter on `projectId`. Continue to honor `sessionIds`/`taskIds` if also provided (master can scope to specific sessions of interest).

3. **Auth gate for `allProjects`:** in the subscribe handler, if `allProjects: true` is requested, require an `X-Session-Id` (or a `sessionId` field in the subscribe payload) and verify `isMasterSession === true` against `SessionService`. Reject with `subscription_denied` otherwise. This makes the global firehose master-only.

**UI changes (`useMaestroStore`/`MaestroClient`):**
- New method `subscribeAllProjects(sessionId: string)` that sends the master sub payload.
- A `useMasterWorkspaceStore` (new Zustand store) holds: `projects[]`, `tasksByProject{}`, `sessionsByProject{}`, last update timestamps. Hydrated from `GET /api/master/context` on mount; mutated by WS events.

**Tests:** Jest WS bridge test for master auth on `allProjects`; non-master rejected.

---

### Increment D — Master UI dashboard + targeted prompt (M)

**What:** A first-class UI surface in the desktop app for the master project.

**Layout (new `MasterDashboardPanel.tsx`):**
- Project list (left): each project shows live task/session counts.
- Selected project → middle column: active sessions (status pill, team-member chip, last timeline event time).
- Right pane on session click: timeline tail + a **"Prompt this session"** composer (textarea + send/paste mode toggle + send button → `POST /api/sessions/:id/prompt`).
- Banner: "★ Master session — actions touch other projects."

**Surface rules:**
- Dashboard is only mounted when the *currently selected project* has `isMaster === true`. Lives next to `MaestroPanel`, not inside it.
- Read-only outside master projects (no prompt composer rendered).

**Store wiring:** consumes `useMasterWorkspaceStore` (Increment C); composer goes through `MaestroClient.sendPrompt(targetSessionId, content, mode, senderSessionId)`, where `senderSessionId` is the current master session id.

**Tests:** Vitest component tests on the composer + a smoke test that non-master projects don't render it.

---

## 5. Data-model deltas

| Type | Field | Change | Rationale |
|---|---|---|---|
| `SessionTimelineEvent.metadata` | `master?: boolean`, `crossProject?: boolean` | additive | cross-project prompt audit |
| `SubscriptionFilter` | `projectIds`, `allProjects` | additive | master fanout |
| (no new entities) | — | — | reuse `Session`, `Project`, `Task` |

No new persisted entities. Mail can wait until the use case appears for *async* delivery (master is currently a sync coordination tool).

---

## 6. Cross-package type sync (Ubiquitous Engineer concern)

`SubscriptionFilter` and the new timeline metadata flags need mirroring:
- `maestro-server/src/types.ts` — canonical.
- `maestro-ui/src/app/types/maestro.ts` — UI side of the WS payload.
- CLI doesn't currently model timeline metadata explicitly; no change there.

`AgentMode` is **not** affected — master is an orthogonal axis (capability flag), not a fifth mode.

---

## 7. Security & failure cases

1. **`X-Session-Id` spoofing.** Mitigated today because the middleware loads the session from server storage and re-checks `isMasterSession`. No change.
2. **Master session compromise.** A compromised master session can prompt anywhere. Acceptable — same trust level as a coordinator already has over its team — but log every cross-project prompt to a dedicated audit field (the `master: true, crossProject: true` timeline metadata covers this).
3. **Prompt to a non-existent / completed session.** Existing `sessionService.getSession()` throws 404; surface as `target_not_found` from the master prompt command.
4. **Demoting a master project while sessions hold master auth.** `isMasterSession` is stamped at spawn time on the *session*, not the project. Existing sessions retain their master power until they end. Document this; if too permissive, add a "revoke" step that updates active sessions when `isMaster` flips off (low priority).
5. **WS firehose cost.** `allProjects` fanout is bounded by master count, which is small. No throttling change beyond existing per-entity batching.

---

## 8. Out of scope (for this round)

- Persistent inter-session mail with delivery guarantees.
- Master *spawning* sessions in other projects (today only via `session:spawn` inside one project; cross-project spawn is a bigger change to manifest generation and worktree handling).
- A "demote on revoke" cascade for `isMaster: false`.
- Permission policies for **per-project** master scope (today master = all projects; finer grain can come later).

---

## 9. Rollout order & checkpoints

1. **A** ships first (read-only, safe). Verify with CLI smoke test.
2. **B** ships next behind no flag — the change is the trust model, not a UI toggle. Add a regression test that non-master cross-project prompts still 403.
3. **C** ships with the WS auth gate. Manually verify with two browser windows on different projects.
4. **D** ships last; wire it to the store from C.

Each increment is independently shippable and revertible.

---

## 10. Open questions for the user

1. **Active definition.** Treating "active" as `spawning|idle|working` for sessions and `in_progress|in_review|blocked` for tasks — is that the right cut, or should `idle` be excluded from "active sessions"?
2. **Master prompt convenience command.** Is `maestro master prompt <id>` worth adding, or should master agents just use the existing `maestro session prompt <id>`? (Leaning yes — explicit master command makes audit grepping easier.)
3. **UI dashboard placement.** Standalone panel like `MaestroPanel`, or a tab inside it? (Leaning standalone — different mental model.)
4. **Response channel.** Today master prompts are fire-and-forget; reply comes only via watching the target's timeline. Want a structured `replyToSessionId` field so a target session's response gets routed back as a notification, or punt to a future increment?
