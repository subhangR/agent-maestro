# tm8 — Node, Workspace, and Gateway Architecture

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R1, R3, R4, R5, R6, R11, R12, Q1); verified per `08-AMENDMENT-VERIFICATION.md` (fixes F2, F4 applied). Defines the node model (T-L1), the container hierarchy, the gateway module, identity, and the canonical user flows.

---

## 1. Container hierarchy

```
NODE  (one tm8-server process; one machine or one hosted slot)
 └─ WORKSPACE  (the root container one server instance serves; one owner)
     └─ SPACES  (the collaboration + permission boundary; each has its entity graph,
        │        members, roles; visibility per T-L9)
     │    └─ entities / edges / messages / side tables
     └─ linked PROJECTS  (repos / working dirs) — many-to-many with spaces:
          a space can link multiple projects; a project can appear in multiple spaces.
          Projects are linked resources of a space, not containers.
```

- **Workspace** = what you see when you open tm8: your space list, your teammates, your sessions. One owner identity per workspace.
- **Space** = the unit of sharing. Inviting someone shares *a space*, nothing else. Local default: one space per project is a fine convention, but nothing enforces it — a space may span repos (a product spanning UI+server+cli repos is one space).
- Cross-space queries within one workspace replace old maestro's "master project" cross-project access.

## 2. The six blocks (T-L1) — responsibilities

| Block | Owns | Never does |
|---|---|---|
| **graph engine** | entity envelope + detail tables, edges, messages, counters, versions, activity, RPC invariants, RLS | transport, auth decisions beyond RLS, streaming |
| **db** | Postgres (bundled sidecar locally; managed instance on hubs); one schema, one migration sequence | dialect forks |
| **server** | HTTP facade (`/entities` grammar + closed `/commands/*`), WS bridge, WorkspaceEvent mapper, derived-truth assembly, rate/size limits, **identity/accounts** (account store, sessions, `can_act_as`, node-admin role — every composition [R1]) | privileged shortcuts around RLS |
| **execution** | PTY host, session spawn, manifests, terminal fan-out, work_session lifecycle | touching graph tables directly (contract only — the seam law, 04 §2) |
| **bridge** | outbound node↔node client: connect/authn to remotes, full-catalog reads/writes (RLS-scoped) [R3], pull, report-back, event subscribe, stream subscribe | writes outside the operation catalog; any automated write-back from a pulled projection (T-L6b) [R3] |
| **gateway** | node/workspace routing, relay, hosted-workspace spawner, remote-facing auth surface (fronts the server's identity block) [R1] | graph data of any kind; owning the primary account store (T-L8) |

## 3. Node roles are compositions, not modes

- **User C, normal:** graph+db+server+execution. His workspace, his sessions, fully offline-capable.
- **User C, gateway on:** + gateway block. His node now (a) authenticates other users, (b) exposes designated shared space(s), (c) can spin up **hosted workspaces** (process-per-user tm8-server instances — the validated maestro-gateway Design A pattern), (d) relays streams. C's own workspace is unchanged; he is additionally **node admin**.
- **Users A and B (laptop owners):** local nodes; bridge pointed at C. They see C's shared space *as a collab space* with pull/report-back.
- **User X (browser-only):** logs into C's gateway; acts **directly in** the hub's shared space (create, discuss, react — no pull, he has no second workspace). Optionally creates a **hosted workspace** on the hub, from which he can pull from the shared space like any node owner — the bridge is workspace↔workspace (T-L6), so hosting locality is irrelevant.

## 4. The gateway module

Recycles the existing `maestro-gateway` package (Trusted Hub, Design A, process-per-user; M1 validated) as tm8-gateway. Responsibilities:

1. **Remote-facing auth surface [R1].** Login endpoints for other people's clients and token exchange for bridge callers — authenticating against the **node's identity block** (which lives in the server block; accounts are node-local, v1 [T-D7]). Identity binds to Postgres per-transaction (T-L11/R2); no Firebase, no Supabase, anywhere in tm8 (T-D3).
2. **Routing.** Maps an authenticated user to: the hub's shared space(s), their hosted workspace (if any), and stream endpoints. Thin, mechanical.
3. **Hosted workspace spawner.** Provision/start/stop per-user tm8-server processes sharing the hub's Postgres cluster with **one database per workspace** (stronger isolation than schemas, same cluster — pinned per review Q1). Idle eviction (stop after N idle minutes; cold-start seconds behind the gateway is acceptable) + per-workspace resource caps. **Execution is disabled by default on hosted workspaces** — enabling it is a node-admin capability per workspace, never a space role [R5]: hosted execution is arbitrary code execution on the hub; process-per-user isolation is a start, not a sandbox.
4. **Relay.** Dumb-pipe forwarding of live streams (T-L10) and bridge traffic for unreachable home machines. No storage, no inspection.

**The hub trust model, explicit [R4]:** the hub operator is trusted — they administer the identity store and can technically act as any account homed on their node; the relay sees (but never stores) stream bytes. Cross-node actions are attributed but not cryptographically non-repudiable until portable identity (Phase 4). Choose your hub like you choose your git host. This is the documented Design A trade, not a vulnerability.

**Account lifecycle minimums [R6]:** *recovery* — node admin resets credentials (acceptable at invite scale; a hub is "accounts on a machine someone runs," not a public IdP). *Revocation* — disabling an account kills gateway sessions and bridge tokens; the member entity and authored history remain (graph actor-attribution is historical record). *Re-key compatibility* — `identity_id` is opaque and immutable; display names live elsewhere; `user@server` layers on later without rekeying `user_profiles`.

**Identity across nodes (v1):** credential-per-remote, the git-remotes model. A's identity on C's hub is an account *on C*; A's local node stores a token for C. Portable identity (`user@server`, key-based) is deferred with federation — addresses should be stored in a shape that can carry `user@server` later without rekeying.

## 5. The bridge protocol (v1 verbs, sketch)

Between a client workspace and a remote (home) server — same verbs whether the caller is a laptop node or a hosted workspace:

```
authn        login/token exchange with the remote's gateway (or direct node auth)
spaces       list spaces shared with me on the remote
subscribe    WorkspaceEvent stream for a remote space (scoped, resumable via event cursor)
walk/get     read a remote entity neighborhood (RLS-scoped, same DTOs)
create/patch full catalog mutations, RLS-scoped, expectedVersion honored [R3] — a remote
             member is a first-class member: create tasks, edit descriptions, check
             acceptance criteria, run commands, exactly as a local client would
pull         request projection of entity/subtree @version → local artifact + pulled edge (recorded on the REMOTE)
report-back  append: message / edge / status command / PR link (idempotent, clientMutationId)
fetch-blob   file bytes for attachments referenced by projections/entities (home-node
             storage, membership-checked; relayable) [R11]
stream       subscribe to an announced live media channel (terminal), possibly via relay
```

**The bridge carries the full operation catalog** — the bridge client is just another consumer surface (T-L12); the *projection discipline* (T-L6b) governs only the pulled-artifact relationship. Per-member state for a remote space (inbox, read marks) lives home-side and is queried over the same catalog ops; the UI's cross-space Inbox aggregates across connected remotes [R11]. **Subscription depth rule [R12]:** the local node holds remote data only in memory-bounded caches keyed by event cursor — reconnect resumes from cursor within the remote's retention window (7 days), else re-walks focused entities; nothing remote is ever written to the local Postgres except pull artifacts (explicit build products) and bridge bookkeeping. Durable replication of remote events is forbidden (multi-master by installments). P2P later = pointing the same client at a non-hub node; nothing new except reachability (relay) and portable identity.

## 6. Streams & terminal sharing (T-L10 applied)

- Session state (status, machine, task edges, progress messages) = `work_session` entity in the graph → visible to space members everywhere, renders as chip/card/panel like anything else.
- Live terminal = client connects to the session's **home server** WS; gateway relays if unreachable. Viewer authorization = graph check (space member + share enabled).
- Broadcast ("share my terminal to the space") = explicit act: flip share state on the work_session (command → WorkspaceEvent → LIVE chip everywhere), viewers attach to the existing PTY fan-out as additional subscribers. View-only vs drive (input) is a later permission tier on the same path.
- After exit: transcript artifact attached to the work_session entity; the stream is never stored.
