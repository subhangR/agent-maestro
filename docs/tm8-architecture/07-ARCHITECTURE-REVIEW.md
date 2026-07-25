# tm8 — Architecture Review (T-D19 gate)

**Status:** Final
**Date:** 2026-07-25
**Reviewer:** Fable 5 architecture review session (`sess_1784939973807_vy08zex25`, task `task_1784939944781_0gc35ww96`)
**Charter:** `06-SEQUENCING-AND-REVIEW.md` §5. Corpus reviewed: tm8 docs 00–06; `docs/collab-v2-api-design/00–05`; branch docs (`COLLAB_V2_ENTITY_GRAPH_DESIGN`, `_GAPS_AND_EXTENSIONS`, `_UI_UX_BRIEF`, `_UI_DATA_CONTRACT` @ `feat/collab-v2-supabase-backend`); `docs/collab-v2-ui-plan/01–02`; plus a source-level audit of the maestro-server / maestro-cli execution code against the 04 inventory.
**Rule respected:** docs 00–06 are unmodified; every proposal lives here. Proposals are numbered **R1…** for traceability into the implementation plan.

---

## 0. Verdict summary

| # | Area | Verdict |
|---|---|---|
| 1 | Vision & new-repo strategy (00, T-D1) | **SOUND** |
| 2 | Law coherence (T-L1…T-L12) | **SOUND-WITH-CHANGES** (R1–R3) |
| 3 | Node / gateway / identity (02, T-D6/7/9) | **SOUND-WITH-CHANGES** (R1, R4–R6) |
| 4 | Entity-graph deltas (03) | **SOUND-WITH-CHANGES** (R7–R10) |
| 5 | Bridge protocol (T-L6, 02 §5) | **SOUND-WITH-CHANGES** (R3, R11–R12) |
| 6 | Single-homed spaces (T-L5, T-D4) | **SOUND** (statements R13) |
| 7 | Auth & storage deltas (T-D3, T-D13, 03 §5–6) | **SOUND-WITH-CHANGES** (R2, R14–R15) |
| 8 | Execution transplant & seam (04, T-D14) | **SOUND-WITH-CHANGES** (R16–R20, R27–R29) — PTY/terminal/prompt-composition claims verified portable; the spawn/manifest "one seam" claim is **understated** (it is a bounded re-authoring, not a lift) |
| 9 | Sequencing & v1 scope (06 §1, T-D14/18) | **SOUND-WITH-CHANGES** (R21) |
| 10 | Completeness | Holes enumerated in §11 (R22–R26) — none foundation-breaking; all need homes before the implementation plan freezes scope |

**Final recommendation: GO** — proceed to implementation planning once the R-changes are accepted into the doc set (an afternoon of edits, not a redesign). Argument in §13.

The bar applied throughout: *would I bet the product on this law as written?* Where the answer is "yes as intended, no as written," the verdict is SOUND-WITH-CHANGES and the change makes the writing match the intent.

---

## 1. Vision & new-repo strategy — SOUND

The three-part argument for a new repo (00 §2) survives adversarial reading:

1. **"The blueprint lives in documents, not legacy code"** is verifiably true. The api-design corpus is a genuinely complete contract — operation catalog, DTOs, event taxonomy, error taxonomy, idempotency, auth flow, coverage matrix with per-family implementation status. I checked the coherence matrix (05 §1–2) against the UI brief's surfaces and the CLI tree: no surface lacks an operation mapping. This is the strongest asset tm8 has, and it is the thing most rewrites lack.
2. **The seed code was built liftable.** The in-flight UI build (ui-plan 01–02) enforces self-containment structurally (own tokens, own stores, facade seam, "screens import only downward," kind registry) and the orchestration plan enforces it in review. The transplant premise for the UI is credible *provided* the mock facade stays bound to DEV-1..13 (T-D18 already requires this).
3. **The old repo fights the vision** — accurate. File-JSON repos and 23 stores are not a foundation for an entity graph; converging in-place would mean maintaining two data models indefinitely, which is exactly the failure T-L3 exists to prevent.

One vision-level observation, not a defect: 00 §1's "the graph is the UI" and 04's "terminal latency at parity" pull in different directions during v1 (entity-component discipline vs. raw PTY throughput). The doc set already resolves this correctly — T-L10 keeps streams off the graph path — but the implementation plan should treat terminal surfaces as *explicitly exempt* from the entity-component contract at the frame level (the `work_session` panel is an entity component; the xterm canvas inside it is not). Worth one sentence in 01-LAWS to prevent a purist misreading. *(Folded into R16.)*

## 2. Law coherence (T-L1…T-L12) — SOUND-WITH-CHANGES

The twelve laws are mutually consistent in intent. Three places where the written form either contradicts a sibling doc or under-specifies enough to permit divergent implementations:

### 2.1 Where does the identity store live? (T-L1 vs T-L7 vs T-L8) — the one genuine contradiction

- T-L1's composition table gives the **local desktop no gateway block**.
- T-L7 says **every node** runs the full identity/membership/`can_act_as` machinery ("local is the degenerate case").
- T-L8 and 02 §4.1 say **the gateway owns the account/session store** ("the gateway's identity store holds accounts on this node").

These cannot all be true: a gateway-less local node must still hold its owner's account (T-L7), but the account store is defined as gateway property (T-L8), and the local composition has no gateway (T-L1). As written, an implementer can legitimately build identity into the gateway package (breaking local), into the server (breaking T-L8's ownership claim), or duplicate it (breaking T-L7's "no second code path").

**R1 — Split identity out of the gateway.** Redefine the blocks: **identity/accounts is a core server concern present in every composition** (the account store, sessions, `can_act_as`, node-admin role — this is what T-L7 already implies), and the **gateway is routing + relay + hosted-workspace spawner + the *remote-facing* auth surface** (login endpoints for other people's clients, token exchange for bridge callers). T-L8 becomes: "the gateway owns **routing and relay** only — never graph data *and never the primary account store*; it authenticates against the node's identity block." This is also truer to the maestro-gateway Design A code being recycled (auth fronting + process management, not an account database of its own). One-line consequential edit to T-L1's table: identity is inside `server`, all compositions.

### 2.2 "Server-minted JWTs" is Supabase residue (T-L11, T-D3, 03 §5)

The inherited D5 flow mints an HS256 JWT because **Supabase** sits between maestro-server and Postgres and needs a token to verify (api-design 04 §6.1a is explicit that the mechanism exists for Supabase's verifier). In tm8 there is no Supabase: tm8-server owns the Postgres connection. Minting a JWT to hand to *yourself* is ceremony — unless the design intends to keep PostgREST as an internal component, which no tm8 doc says (02 §2 of api-design mentions PostgREST reads, but that is the *maestro* implementation being described, not a tm8 commitment).

The law's intent — **RLS is the authorization source; the server adds no privileged shortcut** — is right and must survive. The mechanism should be stated in Postgres-native terms:

**R2 — Specify identity binding as per-transaction GUC claims, not token minting.** tm8-server executes every request on a pooled connection as a non-superuser role (`authenticated`), setting `request.jwt.claims` (or an equivalent `app.identity_id` GUC that the RLS helpers read) with `SET LOCAL` inside the transaction. RLS predicates and `can_act_as` resolve from that claim exactly as designed. JWTs reappear only where a *verifying boundary* exists: the bridge (node↔node calls carry a token the remote's identity block verifies) and any future PostgREST-style component. This keeps one enforcement model (RLS) with an honest local mechanism, and removes a per-request signing/verifying round-trip from the hot path. Rewrite the parenthetical in T-L11/T-D3/03 §5 accordingly ("the inherited D5 flow is kept" → "the inherited D5 *posture* is kept: server-established identity, RLS enforcement, no service-role bypass; the token step is replaced by transaction-scoped identity claims because tm8-server owns the connection").

Non-negotiable invariant to carry into the implementation plan: **the app role must not be table-owner/superuser** (RLS does not bind to owners without `FORCE ROW LEVEL SECURITY`; simplest is a dedicated low-privilege role), and every write path still goes through the SECURITY DEFINER RPC catalog per D8.

### 2.3 T-L6's "appends only" collides with "the bridge client is just another consumer surface" (02 §5)

Treated fully in §5 below; the law-level fix is **R3**.

Everything else coheres: T-L2 vs T-L10 (streams are not graph surfaces) is consistent; T-L3's entity test is crisp enough to adjudicate real cases (I tried it against manifests, read-marks, saved views, stream grants — all land correctly as side tables); T-L4's "no `if (kind===…)` outside the registry" matches the UI plan's enforcement; T-L9's policy-vs-architecture distinction is exactly right; T-L12 inherits a contract that demonstrably covers its surfaces.

## 3. Node / gateway / identity — SOUND-WITH-CHANGES

The composition model (T-L1, 02 §3) is the best part of this architecture: local, hub, hosted, browser-only are configurations of one binary, and the user-X flow proves the bridge's workspace↔workspace framing does real work (hosting locality genuinely becomes irrelevant). Three changes:

**R4 — Make the hub trust model explicit.** With node-local identity (T-D7), the hub's node admin *is* the identity provider for every account on that hub. Technically, a malicious hub admin can mint a session for any hub account and act as them in hub-homed spaces; the relay additionally sees (but per T-L10 does not store) stream bytes. This is inherent to "Trusted Hub" Design A and is an acceptable v1 stance — but it is currently implicit. Add to 02 §4: *"The hub operator is trusted: they administer the identity store and can technically act as any account homed on their node. Cross-node actions are attributed but not cryptographically non-repudiable until portable identity (Phase 4). Choose your hub like you choose your git host."* Without this sentence, someone will later discover it as a "vulnerability" instead of a documented trade.

**R5 — Gate hosted-workspace execution explicitly.** T-L1 marks execution "optional" on hosted workspaces and 04 §3 says the PTY host runs on the hub slot. That is **arbitrary code execution on the hub by any user who gets a hosted workspace**. Design A's process-per-user isolation is a start, not a sandbox. v1 policy should be: hosted workspaces ship with **execution disabled by default**, enabled per-workspace by the node admin (a node-admin capability, not a space role), with the resource limits from open question 1. This is one row in the gateway's routing/limits config and saves the hub story from being quietly unshippable.

**R6 — Specify account lifecycle minimums.** Node-local identity is right for v1 (T-D7 correctly defers the federation tarpit), but three lifecycle events need one-line answers in 02 §4 before implementation: **recovery** (v1: node admin resets credentials — acceptable for invite-scale; a hub is "accounts on a machine someone runs," not a public IdP), **revocation** (deleting/disabling an account kills gateway sessions and bridge tokens; the member entity and authored history remain, per the graph's actor-attribution model), and **rename/re-key compatibility** (the address shape carried per T-D7 — store `identity_id` as opaque and immutable, display names elsewhere, so `user@server` can layer on later without rekeying `user_profiles`). None of these are hard; all of them are the kind of thing that gets improvised inconsistently if unwritten.

## 4. Entity-graph deltas (03) — SOUND-WITH-CHANGES

`work_session` and `collection` as new core kinds pass the four-capabilities rent test cleanly (you genuinely discuss, link, parent, and react to both). The custom-kind mechanism is the right shape (registry-as-data + one shared jsonb detail table + envelope capabilities free). Four concrete findings:

**R7 — `entity_kinds` primary key is wrong as written.** 03 §2 has `kind text PRIMARY KEY` with a nullable `space_id` column. Custom kinds are space-scoped, so two spaces must both be able to define `c:design_asset` — the global PK forbids it and lets spaces squat names workspace-wide. Fix: `PRIMARY KEY` on `(kind, space_id)` is not directly possible with nullable `space_id`; use the standard pattern — `UNIQUE (space_id, kind)` plus a partial unique index `ON entity_kinds(kind) WHERE space_id IS NULL` for core kinds, surrogate id PK. Kind resolution for an entity then resolves `(entity.space_id, kind)` falling back to the core row; the envelope's kind-validation trigger must do this two-step lookup. Consequence to state: custom-kind entities cannot cross spaces (already true — everything is space-scoped), and a `c:` kind pulled across the bridge arrives as its rendered projection, never as a registry import.

**R8 — Decide `entity_ref` now: drop it from v1.** On the reviewer-flagged line in 03 §2: display-only refs **will** smuggle relations — the moment a jsonb field holds an entity id, someone will filter on it (it is GIN-indexed by design), and you have rebuilt `assigneeUids[]` inside the mechanism T-L3 exists to kill. The auto-materialized `x:field:<name>` edge alternative fixes queryability but imports edge-lifecycle complexity (field update = edge delete+create; who owns the edge; what happens on schema edit) into the one part of the system meant to be dumb. The clean v1 line: **custom-kind fields are scalars only** (`text|number|bool|date|enum`); if a relation matters, it is an edge, full stop — and the UI's custom-kind panel already has the Connections rail for exactly this. Revisit auto-materialization only if real usage demands ref-typed fields.

**R9 — Add a custom-kind schema-evolution rule.** `field_schema` is mutable data; the doc validates rows "against the schema on write" but says nothing about existing rows when the schema changes. Without a rule, an implementer will either rewrite all rows on schema edit (expensive, wrong) or leave validation drift unbounded (rows that can never be re-saved). State the rule: **schema edits are additive-or-relaxing by default** (add field, widen enum, make optional); reads must tolerate missing fields (render as empty); a *tightening* edit (new required field, narrowed enum) is refused unless the space admin runs it as an explicit backfill action. Validation always checks against the current schema **on write only** — old rows are grandfathered until touched. This is three sentences in 03 §2 and prevents a class of production incidents.

**R10 — `work_session` needs commands.** 03 §1.1 defines the kind and its detail table but the operation catalog gains no verbs for it. Treated in §8/R17 (execution operation family) — noted here because the delta doc is where the kind is defined and should point at its commands.

The convergence table (03 §3) is honest — including the brave and correct choice that Team = `team_member` hierarchy (leader = parent). One consequence worth a note: old maestro Teams allow a member in multiple teams and sub-team graphs; a strict tree cannot express membership in two teams. The mapping should say: primary org line = hierarchy; secondary affiliation = an edge (`x:member_of` or a registered `member_of`). Cheap now, confusing later if silent.

## 5. Bridge protocol — SOUND-WITH-CHANGES

The asymmetric core — pull = pinned projection, report-back = appends, never field sync — is the single best inheritance from the corpus: it is what permanently forecloses multi-master merge hell (T-D4 depends on it). The problems are in the verb enumeration and one overreach in the law's wording.

**R3 — Re-scope T-L6's "appends only" to the projection discipline, not the member's agency.** 02 §5 says the bridge client is "just another consumer surface" projecting "the inherited operation catalog" — but the verb list omits `create` and `patch` entirely. Run golden workflow 1 (author & stage) from a laptop node against the hub's shared space: the user cannot create a task, cannot edit its description, cannot check an acceptance criterion — the bridge only lets them message, edge, and status-command. As written, laptop members are second-class citizens of the shared space and the browser user (who acts directly) is first-class — inverted from the product's intent. The two ideas the law conflates:

- **(a) The bridge as remote consumer surface:** an authenticated remote member should be able to do, over the bridge, anything the operation catalog + RLS lets them do in that space — including `entities.create` and `entities.patch` of entities they may edit. This is safe: it is the same single-authority write path every local client uses; the space is still single-homed; there is no sync.
- **(b) The projection discipline:** for *pulled* entities specifically, the local rendered artifact is a build product; local edits to it never propagate; the only sanctioned flows back to the source are appends (messages, edges) and commands. **This** is what "never field-level sync" must bind.

Rewrite T-L6's forbids-clause: *"Forbids: two-way mirror sync; any **automated** write-back derived from a pulled projection; bridge mutations outside the operation catalog."* And extend 02 §5's verb list: `create`, `patch` (catalog ops, RLS-scoped, `expectedVersion` honored), with the note that pull/report-back remain the disciplined protocol for the projection relationship. The staleness model is unaffected — `version`/`activity_at` still drive re-pull.

**R11 — Add the missing infrastructure verbs.** Two flows the v1 verbs cannot carry:
1. **Blob fetch.** A pulled projection references attached files; file bytes live on the home node's storage (03 §6). The bridge needs `fetch-blob` (or the projection composer must inline/sign URLs that route via the gateway relay). Without it, golden workflow 1's "drags in a design doc" produces a projection with dead references on every remote node.
2. **Remote inbox/read-marks.** Per-member state for a remote space lives on the space's home node (read_marks, notifications are home-side tables keyed by the member). `subscribe` delivers events, but "what's unread for me in the hub space" is a home-side query. Covered automatically if R3's "full catalog over the bridge" lands (inbox.list/readMarks.upsert are catalog ops); called out so the implementation plan wires cross-space inbox aggregation (the UI's far-left Inbox is defined as cross-space).

**R12 — Answer open question 2 (subscription depth): remote-live with bounded ephemeral cache — confirmed, plus a resume rule.** Durable replication of remote events into the local store is multi-master by installments: the moment a mirrored row survives a disconnect, someone will read it stale, then write against it. The lean in 06 §4.2 is correct. Make it a rule with teeth: the local node holds remote data only in **memory-bounded caches keyed by event cursor**; reconnect = resume from cursor if within the remote's event-retention window (7 days inherited), else re-walk focused entities. Nothing remote is ever written to the local node's Postgres except pull artifacts (which are explicitly build products) and the operational bookkeeping of the bridge itself.

Does anything in pull/report-back secretly require field sync? I hunted for one and the closest is **acceptance-criteria check-off** by a remote agent (workflow 2/3): checking a box is a content patch on the source task. Under the current law it is forbidden; under R3 it is an ordinary RLS-scoped `entities.patch` with `expectedVersion`. That is the correct resolution — it is a *direct authorized edit of the source*, not a sync of a local copy. No true field-sync requirement found; the asymmetry survives.

## 6. Single-homed spaces — SOUND

I tried to break T-L5 and failed in a good way. The features it forecloses and my assessment of each:

- **Offline multi-writer** (two disconnected laptops writing one space, merged later): genuinely foreclosed, genuinely fine. The architecture's answer — everyone's own workspace is always-writable locally; *shared* spaces live somewhere well-connected (a hub); collaboration under partition degrades to "work in your workspace, report back when reachable" — matches how the product is actually used (agents work against pulled projections, which are partition-tolerant by construction). CRDT-grade merge for a task graph is a research project, not a feature; T-D4 rejecting it permanently is a strength.
- **Space migration between homes:** *not* foreclosed by single-homing itself — an exported space (Q7) can be imported to a new home — but the identity interaction must be stated: members are keyed to accounts on the old home node (T-D7), so **rehoming = data moves, membership re-establishes** (re-invite; authored history keeps its actor attribution as historical record). Acceptable for v1; portable identity (Phase 4) is what makes rehoming seamless later, and the address-shape compatibility note in 02 §4 already points there.
- **Availability:** a space homed on a laptop is down when the laptop sleeps. Inherent, and the hub composition exists precisely for spaces that need better uptime.

**R13 — State the trades in 01-LAWS.** Add to T-L5: *"Consequences accepted: a space is as available as its home; partition degrades to pull-side work + deferred report-back; rehoming a space re-establishes membership (identity is node-local until Phase 4). Backup/export (Q7) is the trust backstop."* Single-homing is load-bearing for everything else (bridge asymmetry, no consensus, RLS-as-authorization at one place) — it should carry its costs on its face.

## 7. Auth & storage deltas — SOUND-WITH-CHANGES

The identity delta (03 §5) is coherent once R2 lands (mechanism restated for self-owned Postgres). `user_profiles` keyed by opaque tm8 identity id — right, and consistent with the api-design's own migration note ("treat the existing text PK as opaque").

**R14 — Resolve the push-notification contradiction.** T-D3 says *no Firebase anywhere in tm8*. The inherited notification design (api-design 01 §S7, D9) revives `notification_outbox` explicitly as **the FCM dispatch queue** with a **trusted Firebase worker**. Both cannot hold. tm8 must pick: (a) carve a narrow exception (FCM as a dumb push transport, no identity, no data — defensible but dilutes a clean directive), or (b) go Firebase-free push: web-push/VAPID for browser + desktop, and for mobile accept that APNs/FCM are unavoidable *platform* channels and route them through a hub-side dispatcher in Phase 2+ (the outbox stays transport-agnostic: `channel` column, workers per transport). **Recommendation: (b)** — keep the outbox design, delete "FCM" from its definition, make push transports a gateway/hub concern (local nodes deliver in-app + OS-native desktop notifications, which need no third party). Either way, decide it now: it is the one place the inherited corpus directly contradicts T-D3.

**R15 — The sidecar's operational story is v1 scope, not an open question (answers Q5).** Position:
- **Pin the major version** and ship the binaries with the app (per-platform); data dir under the node data dir (`<data>/pg/<major>/`).
- **Migration-on-update:** app update never `pg_upgrade`s silently — on major-version change, run a dump/restore migration with an automatic pre-migration backup; refuse to start on failure with the backup path surfaced. Minor updates are in-place.
- **Backup = `pg_dump` on a schedule + on-demand export** (this is also 80% of Q7's space export).
- **Crash recovery:** Postgres already owns this (WAL); tm8-server's job is single-instance locking (staging/prod dual-stack must get distinct data dirs + ports, a lesson the old repo already learned) and health-check-then-start.
- **uuidv7:** require PG 18+ (native `uuidv7()`) or vendor the function; pin it in the contract so keyset cursors are uniform.
- **PGlite fallback trigger (Q5):** define it as *distribution* failure, not preference — adopt PGlite only if a target platform cannot ship the sidecar (signing/notarization/size). PGlite is single-connection and weaker on extensions; it must never fork the schema (T-L11's one-migration-sequence law applies). Until that trigger fires, PGlite stays watched, unbuilt.

## 8. Execution transplant & seam (04, T-D14) — SOUND-WITH-CHANGES

*Source audit basis:* file-level audit of `maestro-server/src` (spawn route, PTY host, WebSocket bridge, manifest generation) and `maestro-cli` (worker init, prompt composition, command surface) against 04 §1's inventory. Per-claim verdicts: **claim 1 (lifts-as-is) MOSTLY-HONEST; claim 2 (one-seam spawn/manifest) UNDERSTATED — the headline problem; claim 3 (CLI unchanged except verbs) MOSTLY-HONEST.**

**What genuinely lifts.** The PTY host is the cleanest asset in the audit: ~1,388 LOC (`PtyHostService` + `PtyWebSocketServer` + `OutputBuffer` + `TerminalStateMirror`) with **no** repository, event-bus, or filesystem coupling — it keys off an opaque sessionId and has exactly one write seam (a status update on exit). The 16ms coalescing is real; `MAESTRO_PTY_HOST=server` is the thin-client path as claimed (desktop PTY actually runs Tauri-side in Rust). The CLI prompt-composition core is equally portable: ~2,400 LOC that reads the manifest **file** only and emits the system prompt with zero REST calls — 04's claim 3 holds for it; only the command-catalog verb strings change. The terminal UI components and Tauri spawn plumbing lift, with one hard constraint: the Tauri handler consumes an exact `session:spawn` payload shape (session, command, cwd, envVars, manifest path, ids, spawn provenance) that must be preserved verbatim or desktop spawn breaks.

**What 04 understates — the "one seam" is the least portable part.** The audit found no spawn *service* to transplant:

- The spawn flow is an **~850-LOC inline Express handler** (in a 2,674-LOC route file) that reads **seven** entity types, not three (sessions, tasks, team members, model profiles, project, team, spells), performs git side effects (worktree creation), applies a ~5-level launch-config precedence chain and a permission-mode inheritance chain, resolves coordinator/sub-team re-rooting, and embeds a hardcoded 27-entry model-power ranking table.
- Manifest composition is not in-process: the server **shells out to the CLI** (`manifest generate` subprocess), and that subprocess reads tasks and projects **directly from the file data dir** (`~/.maestro/data/{tasks,projects}/*.json`) — the spawn route even calls `taskRepo.flush()` first so the files are fresh. The file model is load-bearing *inside* the spawn path, which a Postgres graph server contradicts by design. The model-power table and launch/permission logic are **duplicated verbatim** in this subprocess.
- `createSession` itself mutates every linked task and writes per-task timeline events; session status has **3+ independent writers** (route on create, PTY host on exit, stop route, and agent-side REST calls flipping running/idle/needs-input).
- The WS bridge's *engine* (50ms batching, coalesce-throttling, subscription filtering, backpressure) lifts cleanly behind its event-bus seam, but **~40% (~150–190 LOC) is policy hard-wired to the old entity taxonomy** — immediate-bypass lists, per-entity throttle tables, a ~60-name subscription list, and namespace-aware filtering across a ~62-event domain map — all of which must be re-mapped to the graph event vocabulary.
- The agent-facing runtime CLI is not thin: ~7,800 LOC across ~25 command files hitting **~54 distinct REST endpoints** in ~12 resource groups; `worker init` itself fires REST side effects (status auto-update, manifest-spell activation); and the old collab CLI talks Firestore directly (moot — it retires with Collab V1, but it is not "adapter-covered" either).

**R27 — Reclassify spawn + manifest as *re-authored with behavioral parity*, not transplanted.** 04 §1.2's "logic kept, persistence re-addressed" is not achievable as written: the logic is tangled with the file model, a subprocess boundary, and duplication. The honest tm8 plan: write a real `SpawnService` in the execution block implementing the *behavioral spec the old code constitutes* — the precedence chains, coordinator/sub-team resolution, worktree flow, spell injection — against graph reads through the contract, with manifest composition moved **in-process** (killing the CLI-subprocess + shared-disk pipeline and the `flush()` hack; the CLI keeps only manifest *reading*). Fold the model-power ranking into model-profile **data** (it is a ranking table pretending to be code, currently maintained in two places). This is bounded, well-specified work (~1,500–2,000 LOC of understood logic) — normal feature-writing, not archaeology — but it must be *planned as a build*, and 04 §1.2 should be corrected so the implementation plan doesn't budget it as a lift.

**R28 — Budget the WS-bridge policy re-map.** Engine lifts; the policy tables (immediate-class events, per-kind throttles, subscription families, filter predicates) are a deliberate rewrite against the WorkspaceEvent taxonomy + `work_session` kinds. Small (~200 LOC) but semantically load-bearing (spawn/modal immediacy is what makes the desktop feel right); name it in 04 §1.1 rather than implying zero-delta.

**R29 — Single-writer status lifecycle + preserved integration shapes.** In tm8, make the execution block the **sole writer** of `work_session.status` (PTY exit, stop, agent-hook idle/needs-input all funnel through one transition function → one command → one event), replacing today's 3+ writers. Preserve exactly: the `session:spawn` payload contract for the Tauri shell, and homes for the two session sub-resources agents write mid-run — docs (`doc` + `attached_to`, already mapped in 03 §3) and **modal** (operational side table + immediate-class event; it is in 03 §3's bookkeeping row but 04's inventory omits that agents write it over REST during runs — the compat adapter must carry `modal`).

Beyond the audit's findings, five additions 04 is silent on, found at the corpus level:

**R16 — The execution block needs an *operation-catalog family*, and the graph needs to admit terminal surfaces.** The inherited catalog (api-design 02 §4) has no execution verbs at all — no spawn, no session-input, no terminate, no transcript, no stream-attach. tm8 must extend the catalog with an `execution.*` family (`execution.spawn`, `execution.prompt` [PTY input injection], `execution.terminate`, `execution.streams.attach`, plus `work_session` command surface per R10) — designed *now* so the CLI/MCP/UI projections stay T-L12-clean, and so `capabilities`/`/actions` can honestly gate them (`501 not_implemented` on nodes with execution disabled — the T-L1 composition story depends on this). Also add the §1 exemption note: the xterm frame surface inside a `work_session` Z3/Z4 is stream UI, not an entity component.

**R17 — "session prompt" must be a delivery mechanism, not just a message.** 04 §1.3 maps `maestro session prompt <id> --message` to "message anchored to target work_session." Today that command *injects text into the target session's PTY* — it makes an agent act. An anchored message is inert unless something delivers it. Specify the mechanism: the execution block, for each live work_session it hosts, subscribes to messages anchored to that session (or to an explicit `execution.prompt` command) and injects into the PTY, marking delivery. If this is silently dropped, every coordinator/worker protocol in the existing prompt corpus breaks while appearing to work (messages land in the graph, agents never see them). This is the single most dangerous silent-failure seam in the transplant.

**R18 — The compat adapter's real surface is the coordinator loop, not just report verbs (answers Q4).** The 04 §1.3 table covers worker report-back; the audited runtime surface is ~54 REST endpoints across ~12 resource groups. The actual agent-facing CLI also carries: **`session spawn`** (coordinators spawn workers — this is the heart of orchestration and depends on R16's `execution.spawn`), `task create/edit/list/get/children/tree` (coordinators decompose work), `team-member` reads (spawn targeting), `spell` invocation, `modal`/`show` (UI interaction), and `master` cross-project queries (→ cross-space queries per 02 §1). Answer to Q4: freeze the v1 compat list as **{task report *, task create/edit/get/list, task docs add, session report *, session prompt, session siblings, session spawn, team-member list/get, whoami/status}** — i.e. the verbs that appear in the shipped identity/commands/spawner prompt sections — and let spell/modal/master verbs migrate natively to graph grammar (they are coordinator-facing and re-promptable). The implementation plan should still run the promised grep over seed skills/spells before freezing, but plan capacity for "adapter ≈ the worker+coordinator core loop," not six verbs.

**R19 — Skills and spells feed the manifest from the graph, and the spell *engine* needs a home.** Manifest composition today loads skills from filesystem scopes (global/project/task) and spells from repos. In tm8 skills/spells are graph entities; the spawn transaction must render `equips`-edged skill/skill-content into the manifest (and the hardened spell system — gating, ensembles, notify — is an application service that must be placed: it belongs in the **server block** as a graph consumer, triggered by WorkspaceEvents, per §11/R24). Also: the old session `timeline[]` retires into anchored messages/activity (already stated) — verify the UI session card needs nothing timeline-shaped beyond that.

**R20 — Status-lifecycle chattiness through the contract.** Session status (spawning→running→idle→exited) flips frequently (idle detection). Through the contract each flip is a command + WorkspaceEvent; per-entity throttling (transplanted WS bridge) must be re-keyed to `work_session` events, and idle-flapping should be debounced at the execution block before it touches the graph (status is graph state per T-L10; *keystroke-grade* liveness is not and must never become entity writes). One sentence in 04 §3.

**Verdict rationale:** the assets whose loss would be catastrophic — PTY host, WS engine, terminal components, Tauri plumbing, prompt composition (~5,000+ LOC of scar tissue) — audit as genuinely portable, which is what T-D14's "safe because it is a transplant" gamble actually rests on. What fails audit is the *framing* of spawn/manifest as a one-seam re-point (it is a bounded re-authoring, R27) plus silence on the catalog extension, prompt delivery, adapter breadth, and bridge policy re-map. Those corrections change the implementation plan's budget, not the architecture — hence SOUND-WITH-CHANGES, not UNSOUND. The seam *law* (04 §2, contract-only access) is unconditionally right and is precisely what kills the file/subprocess pipeline the audit flagged.

## 9. Sequencing & v1 scope — SOUND-WITH-CHANGES

T-D14's collapse of graph-first/execution-later into one v1 is defensible *because* the execution side is a transplant (§8 confirms) and the UI side is a transplant (in-flight build, contract-bound). But the doc's framing hides the load-bearing fact:

**R21 — Name the graph engine as v1's real build.** Per the coherence matrix (05 §4), the *reference branch* lacks: the read projection (`EntityDetail`, capabilities, badges, PullState), `walk`, delete/restore, message edit/delete, invites, saved views, leaderboard routes, versions-read, link-pr, the canonical event push path, and universal idempotency — and T-D18 rightly discards its migration history anyway. So tm8 v1's graph engine + facade is **a full implementation of the api-design contract, written fresh with the branch as a crib**. That is the right call (the contract is complete, the schema is proven in miniature), but "v1 = graph + execution transplant" reads as two transplants when it is one transplant + one from-contract build. The implementation plan should sequence accordingly — suggested internal milestones: **M1** graph engine passes a headless contract test-suite (the mock facade's contract tests, re-pointed, are the free acceptance suite — this is a real asset: the UI build's L0 tests become tm8-server's conformance gate); **M2** tm8-ui swaps MockFacade→real facade (adapter-only per T-D18); **M3** execution — the true lifts (PTY host, WS engine, terminal UI, Tauri shell, prompt composition) plus the R27 spawn/manifest re-authoring — to 04 §5 parity. Phases 2–4 sequencing is sound; Phase 2's hub depends on R5's execution gate.

In-flight disposition (T-D18): sound, one addition — the UI waves are binding DEV-1..13 onto the mock facade; R-changes here that touch DTOs (none do materially; R16 adds operations, R7–R9 are DB-side) should be relayed to the UI coordinator only if the contract module gains the `execution.*` family before W5 finishes, so `types/` is amended once, by its owner, per that plan's §7 protocol.

## 10. Open questions (06 §4) — positions

| Q | Position |
|---|---|
| 1. Hosted-workspace economics | Process-per-user holds to ~10–20 active; the constraint is memory (N × node process) + connections, not CPU. Prescribe: shared PG cluster with per-workspace **databases** (stronger isolation than schemas, same cluster; pick one and pin it — 02 §4 currently says "schemas/databases"), idle eviction (stop process after N idle minutes; cold start seconds is fine behind the gateway), per-workspace resource caps, and **execution off by default** (R5). At 50 users, process-per-user is still fine *if mostly idle*; if not, that hub should be split — say so rather than architecting for it. |
| 2. Bridge subscription depth | Remote-live + bounded ephemeral cache, cursor-resume, re-walk on window overflow (R12). No durable replication, ever. |
| 3. Custom-kind `entity_ref` | Drop from v1; scalars only; relations are edges (R8). |
| 4. Compat adapter surface | The worker+coordinator core loop, incl. `session spawn` — see R18's frozen list, confirmed by prompt-corpus grep during implementation planning. |
| 5. Sidecar Postgres | Full position in R15: pin major, backup-before-migrate, pg_dump export, PG18+/uuidv7 pinned, PGlite trigger = distribution failure only. |
| 6. Points economy | No law forecloses any option examined: scarcity/budgets = config side table + RPC guard; C8 agent→owner rollup = a leaderboard query variant (ledger already attributes earner and ownership chain). Confirmed non-blocking. Product design can proceed post-v1. |
| 7. Workspace/space export | Yes — needed for single-homed trust; commit in Phase 2. Nothing resists it: all durable state is space-scoped rows + `spaces/<id>/…` blobs + registry rows (include `entity_kinds` custom rows and side tables in the manifest). The one lossy edge is identity (export carries actor attribution as history; import remaps membership per R13). `pg_dump`-based node backup (R15) covers disaster; space export is the portability/trust artifact. |

## 11. Completeness — what has no home (R22–R26)

- **R22 — Push notifications / mobile reachability:** contradiction resolved per R14; the *dispatcher* is a hub-side worker (Phase 2), local nodes use OS notifications.
- **R23 — Mobile app:** maestro-mobile exists today (RN, server-hosted PTY mode) and the tm8 docs never mention it. It is architecturally covered — it is exactly a thin client of the contract + `MAESTRO_PTY_HOST=server` (whose preservation 04 §1.1 already mandates) — but it needs a phase assignment (suggest Phase 3, after the hub exists to reach) and a sentence in 00 §3 so the transplant of that surface isn't discovered mid-build.
- **R24 — Spell engine (automation):** the `spell` *kind* is inherited; the spell *system* (invocation, gating, ensembles, notify — the hardened engine) has no named home. Home it in the server block as a WorkspaceEvent-driven service over graph entities; its side tables are operational per T-L3. Without this, "spells" silently means "inert documents" in v1.
- **R25 — Workspace-level rollups:** the UI's Home/My-Work presets are space-scoped; old maestro's master view is cross-project. 02 §1 promises cross-space queries within a workspace but the catalog's queries all take a `spaceId`. Add a workspace-scope variant (`spaceId: '*'` or a `workspace.collections.query`) for Home-across-spaces and the far-left Inbox — small, but it is the one place the old product is broader than the new catalog.
- **R26 — Time-based automation:** reminders/due-date nudges (C9), spell schedules, retention jobs (command-ledger TTL, event pruning, soft-delete purge — all inherited with named policies). These need one scheduler in the server block; listing it prevents three ad-hoc cron implementations.

Checked and confirmed **already homed** (no action): search (reserved slot, D12), visibility (inert column + `visible_to` slot), approvals (registry rows), presence/typing (WS bridge), saved views, undo, tracking refresh worker, invites, modal/timeline/manifest bookkeeping (operational side tables per 03 §3/§4).

## 12. The UI-plan inheritance — reviewed for transplant fitness

Not a charter bullet, but the transplant target: the ui-plan's architecture laws (screens compose downward; kinds are registry data; facade seam) are *the same laws* as T-L2/T-L4 — the UI build is effectively already building tm8-ui. Two watch-items for the implementation plan: (1) the mock facade's contract tests become the server conformance suite (R21/M1) — treat them as a deliverable, not scaffolding; (2) the KindRegistry must accept **runtime-registered kinds** (custom kinds, T-L4) — the current plan's registry is compile-time per-kind entries; the transplant needs a generated-renderer path (03 §2 already sketches it). Neither blocks the UI waves; both belong in the tm8 implementation plan.

## 13. GO / NO-GO

**GO — proceed to implementation planning**, conditional on the R-changes being accepted into the doc set first (they are edits and additions, not redesign; nothing invalidates a law's intent).

Why GO despite eight SOUND-WITH-CHANGES verdicts:

1. **No law is wrong in intent.** Every finding is either a written-form contradiction (R1), inherited residue (R2, R14), an enumeration gap (R3, R11, R16–R18), a schema-level bug (R7), or an unstated operational rule (R9, R15). The load-bearing bets — one node binary, graph-core + side tables, single-homed spaces + asymmetric bridge, RLS as the one authorization source, contract-as-seam, transplant-not-rewrite — all survived adversarial pressure, and several (single-homing + asymmetry; the contract's completeness; the UI/laws convergence) are genuinely strong.
2. **The riskiest claim was audited, not assumed — and the correction is affordable.** The transplant inventory was checked file-by-file against the actual code. The assets that carry the operational scar tissue audit as genuinely portable; the one claim that failed (spawn/manifest as a one-seam lift) fails toward a **bounded re-authoring of ~1,500–2,000 LOC of well-understood logic** (R27), not toward an open-ended rewrite. T-D14's conclusion survives its weakened premise.
3. **The two would-be blockers have clean resolutions.** The identity-placement contradiction (R1) resolves by moving one responsibility between blocks, strengthening T-L7. The bridge under-specification (R3) resolves by letting the bridge be what 02 §5 already claims it is.

**Conditions (do before or at the start of implementation planning):**
- Accept/adjudicate R1–R3 (law text), R7 (schema), R14 (push story), R16–R18 (execution catalog + prompt delivery + adapter scope), and R27 (spawn/manifest reclassified as re-authoring; 04 §1.2 corrected) — these change what gets planned and budgeted.
- Fold R4–R6, R9, R13, R15, R19–R26, R28–R29 into the implementation plan as requirements; none alter the architecture.
- Re-run the Q4 prompt-corpus grep before freezing the adapter list (R18's list is the reviewer's read of the shipped prompt sections, not yet an exhaustive audit of user skills/spells).

**What would have made this NO-GO,** for the record: durable replication of remote events (multi-master creep), a second auth path for local, gateway-owned graph data, per-kind API routes, or an audit showing the PTY/WS/terminal/prompting stack itself concealed a rewrite. None are present — the one inventory overstatement found (spawn/manifest) is bounded and its correction strengthens the plan rather than undermining the laws.
