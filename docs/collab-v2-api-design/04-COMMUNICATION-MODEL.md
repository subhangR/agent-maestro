# 04 — Communication Model: Events, Pagination, Errors, Idempotency, Auth, Limits

**Part of:** `docs/collab-v2-api-design/` — see `00-OVERVIEW.md`.
**Answers:** the wire-level rules every operation obeys, and the resolution of the two implementation-audit hot spots: the realtime split and the auth bypass.

> Sections marked **[current state]** cite the audited branch implementation; everything else is normative.

---

## 1. Envelope conventions

- All responses: `{ data, requestId }`; list responses add `nextCursor` (nullable) inside `data.page`.
- All mutations: `CommandResult = { entity?, edge?, activity?, patches: EntitySummary[], undo?: UndoToken }` (UI contract §4, adopted).
- Timestamps ISO-8601 UTC; IDs opaque strings (uuidv7 underneath).
- Every mutation accepts `{ actorId?, clientMutationId }`; `actorId` defaults to the caller's member entity.

## 2. Realtime: one canonical event contract (D3)

### 2.1 [current state] The split being resolved

The branch has two competing models, verified in audit: (a) the UI's Supabase client can subscribe to `postgres_changes` rows directly (raw table shapes, client-side reassembly), and (b) the facade serves a durable **`workspace_events` table** via `GET /spaces/:spaceId/events` — poll-only, offset-paged, with an `eventPayload()` reshaper that already emits `entity.*`/`edge.*`/`message.*`/`counter.changed`/`activity.created`/`notification.*` types. There is no server push of any kind (no WebSocket, no SSE, no bridge to maestro-server's existing `WebSocketBridge`), and the polled events carry no `clientMutationId` for optimistic reconciliation.

In practice the split has already collapsed in one direction: the UI's direct Supabase client (`maestro-ui/src/supabase/client.ts`) is **dead code — zero importers** — and the live UI polls `GET /spaces/:id/events` every 5 s, dedupes by `eventId`, then reacts to any fresh event with a **full reload** (identity + navigation + a 100-item collection + one `getEntityContext` per entity ≈ N+4 requests per change). So the real decision is not "which of two working models" but: formalize the event-table path with push transports and incremental patches, or resurrect direct `postgres_changes`. Row-level `postgres_changes` cannot deliver the contract DTOs (no derived fields, no actor summaries), which settles it.

### 2.2 Decision

**`WorkspaceEvent` (UI contract §5) is the only event contract any consumer sees.** Supabase `postgres_changes` is demoted to an *internal feed*: an event mapper inside the service layer consumes row changes, re-projects them into contract DTOs (`EntitySummary`, `EdgeView`, `MessageView`, counters), stamps `eventId` (uuidv7) and optional `clientMutationId`, and publishes to subscribers.

Event taxonomy (adopted from UI contract §5, unchanged):

```
entity.upsert | entity.deleted        → EntitySummary
edge.upsert | edge.deleted            → EdgeView
message.created | .updated | .deleted → MessageView (+anchorId)
counter.changed                       → EntityCounters
activity.created                      → ActivityItem
notification.created | .read          → NotificationItem
presence.changed | typing.changed     → RTDB-sourced, ephemeral
```

Subscription scoping: by `spaceId`, plus optional focus sets (`entityIds`, `anchorIds`). De-duplication by `eventId`; optimistic reconciliation by `clientMutationId` (§5).

### 2.3 Transport strategy per deployment (D3 — **decided: maestro-server relay**)

| Deployment | Transport | Rationale |
|---|---|---|
| Local maestro-server (today) | **Existing WebSocket bridge**, new `collab:*` message family carrying `WorkspaceEvent` | one socket per client already exists (sessions/tasks use it); batching/throttling infra reused; UI drops its direct Supabase Realtime dependency |
| Cloud / no local server | Same `WorkspaceEvent` over SSE or WebSocket from wherever the service layer runs | contract unchanged; only the socket host moves |
| CLI (`collab events tail`) | SSE from the facade | curl-able, no WS client needed |
| Presence/typing | relayed by maestro-server over the same bridge (RTDB, if used, is server-side only) | ephemeral, never durable; client opens no Firebase connection (`§6`) |

**Decided (user-approved):** adopt the relay (server-side mapper). The alternative — UI keeps direct Supabase Realtime — is rejected because it forever forks the event shape per consumer, leaks table rows to clients (violates UI contract §1), makes the derived-field patches (`counter.changed`, badge updates) impossible without client-side recomputation, and would violate the single-boundary auth decision (`§6`: clients open no Supabase/Firebase connections). Consequence, now a requirement: maestro-server holds the one Supabase Realtime connection per active space (server-side, pooled), presence/typing relay through the same bridge, and server availability is a prerequisite for liveness (already true for everything else in Maestro).

Polling fallback: `GET /spaces/:id/events?since=<eventCursor>` returns the same events from a short retained buffer — used by constrained clients and as reconnect catch-up.

## 3. Pagination: honest keyset cursors (D4)

### 3.1 [current state]

Audited facade list endpoints return "cursors" that encode offsets (and the activity endpoint is openly offset-based). Offset pagination under concurrent writes skips/duplicates rows and gets slower with depth.

### 3.2 Normative rules

- Every list is ordered by a **keyset**: primarily `(uuidv7 id)` or `(sort key, id)` for non-time sorts (`position`, `dueDate`, `priority`, `activity_at DESC, id DESC`).
- `cursor` = opaque base64 of `{ v: 2, k: [lastSortValues…, lastId] }`. Version-tagged so old cursors are rejected cleanly (`400 invalid_cursor`), not misinterpreted.
- `nextCursor: null` ⇔ exhausted. No `total` unless the query can compute it cheaply (`Page.total` stays optional).
- `limit` default 50, max 200 (per-route overrides documented in the route table).
- Unread counts use the uuidv7 time-ordering trick from the gaps doc (`id > uuid_at(last_read_at)`), same mechanism family.
- Migration: offset forms are removed, not aliased — the UI is on a mock facade, so no deployed consumer breaks (see `05 §3`).

## 4. Error taxonomy

Closed set; every error body is:

```ts
{ error: { code: ErrorCode; message: string; details?: unknown; requestId: string; retryable: boolean } }
```

| HTTP | `code` | Semantics |
|---|---|---|
| 400 | `invalid_input` | Zod/shape failure; `details` = issue list |
| 400 | `invalid_cursor` | malformed/stale cursor |
| 401 | `unauthenticated` | missing/expired/invalid maestro-server session |
| 403 | `forbidden` | RLS/role/`can_act_as` denial |
| 404 | `not_found` | missing or tombstoned (tombstones readable only via detail-with-tombstone paths) |
| 409 | `version_conflict` | `expectedVersion` mismatch; `details.current: EntityDetail` |
| 409 | `invariant_violation` | e.g. second `complete` on a task, cycle in hierarchy/deps, edge-type endpoint mismatch |
| 413 | `payload_too_large` | size caps (§7) |
| 429 | `rate_limited` | `details.retryAfterMs` |
| 501 | `not_implemented` | contract op not yet built in this deployment (honest feature gate) |
| 502/503 | `upstream_unavailable` | Supabase/Firebase outage; `retryable: true` |

Postgres/PostgREST/RPC errors are mapped to this set in the service layer; raw SQLSTATE or Supabase error bodies never reach a consumer. RPCs raise structured errors (`ERRCODE` + JSON detail) so the mapping is mechanical, not regex-on-message.

## 5. Idempotency and optimistic reconciliation

### 5.0 [current state]

The facade threads `clientMutationId` into most write RPCs, and the UI generates one per mutation — but per the UI's own code comments (and pending SQL confirmation), only `post_message` (`client_msg_id`) and `grant_points` (`client_event_id`) actually enforce it in the database. For every other command the id is a local correlation key: retries of edge/move/complete/pull/work writes are **not** server-idempotent today. `react`, `create_task`, `update_task_content`, and `create_task_axis` accept no key at all. The rules below close that gap uniformly.

### 5.1 Normative rules

- Every mutation accepts `clientMutationId` (uuidv7 recommended). The service layer records `(clientMutationId, operation, result)` in a `command_ledger` table (retention ~24h) and replays the stored `CommandResult` on retry with the same id + same operation; a same-id/different-operation call is `409 invariant_violation`.
- Domain-level idempotency stays where it already is (points `client_event_id`, messages `client_msg_id`, unique edge index, single-award `complete_task`) — the ledger adds a uniform envelope on top so *every* command is safely retryable, not just those four.
- Events carry the originating `clientMutationId`; clients reconcile optimistic state by id, replacing pending entities/messages with server versions (`pending: false`).
- `undo`: commands that are cheaply invertible (placements, moves, edge adds) return an `UndoToken` (opaque, 5-min TTL) redeemable at `POST /undo` — implemented as the inverse command with the same actor.

## 6. Auth end-to-end (D5, D12 — **decided: maestro-server is the sole client-facing boundary**)

**User directive (2026-07-25):** *"no firebase or supabase, everything maestro server."* Clients — UI, CLI, agents, and the future MCP server — authenticate to **maestro-server only**. They never hold a Supabase key, never hold a Supabase/Firebase token, and never open a connection to Supabase or Firebase. maestro-server establishes identity itself and brokers Postgres with **server-held credentials**. This supersedes the earlier "facade forwards a client Firebase token" flow and the Firebase-emulator dev-auth recommendation.

### 6.1 The flow (single boundary)

```
client (UI / CLI / agent / MCP)
  → authenticates to maestro-server        [maestro-native session: its existing login / device-loopback / web-password]
  → maestro-server resolves the caller to a maestro identity  (user_profiles row, keyed by a maestro identity id)
  → maestro-server MINTS a short-lived Postgres access token   (JWT it signs; carries sub = identity id, role = authenticated)
  → maestro-server calls Postgres with that token              [Supabase Third-Party Auth trusts maestro-server as the JWT issuer]
  → RLS resolves auth.uid() (= identity id) → member / owned team_member
  → RPCs re-assert membership + can_act_as
```

Why this keeps **RLS as the authorization source** (principle #3) while making maestro-server the only boundary: maestro-server holds the **signing key**, not a service-role key. It mints a per-request (or short-TTL, per-identity) JWT whose `sub` is the caller's identity id and whose claims say `role: authenticated` — exactly the token shape Supabase third-party auth already expects, except the trusted issuer is now **maestro-server** instead of Firebase. Postgres still enforces every read and write through the same RLS predicates and `can_act_as`; maestro-server cannot escalate past them because it is not using service-role. The server holds one secret (the JWT signing key); clients hold none.

### 6.1a Signing mechanism — **HS256 symmetric, not JWKS/asymmetric** (infra constraint)

The minted Postgres token must be signed with the project's **symmetric HS256 secret** (`SUPABASE_JWT_SECRET`), **not** an asymmetric key pair advertised over a JWKS URL. Reason (from the infra/HLD pass): Supabase verifies an asymmetric third-party issuer by **fetching the issuer's public keys from a JWKS URL over the internet**. maestro-server is local-first — `localhost:4569`, or a Tailscale-private host — and is **not inbound-reachable** from Supabase's servers, so JWKS-based issuance cannot work in the local topology. A shared symmetric secret needs no inbound reachability: maestro-server signs, Supabase verifies with the same secret it already holds. This also means **Supabase Third-Party-Auth (Firebase issuer) registration is no longer required** — maestro-server *is* the trusted issuer, via the shared HS256 secret. (`SUPABASE_JWT_SECRET` is a user-supplied critical-path secret, held server-side only.)

**Trade-off, stated honestly:** symmetric signing means every instance that can *verify* a token can also *mint* one. That is acceptable while all instances are operator-run (the operator already trusts their own maestro-server). If a hosted hub ever runs instances the operator does not control, minting authority must move to **asymmetric** keys — which in turn *requires a publicly reachable issuer*, i.e. a cloud deployment (topology T3). So the crypto choice and the deployment topology are coupled: local-first ⇒ HS256; multi-tenant-hosted ⇒ asymmetric + public issuer. Nobody should spec a JWKS endpoint for the local deployment — it cannot be reached.

Consequences that fall out of this:

- The client headers `X-Collab-Firebase-Token` / `X-Collab-Firebase-Uid` and the publishable key **disappear from the client contract**. Clients send a maestro session credential (the same one they already use for every other maestro-server call); the collab surface stops being special.
- `user_profiles` is keyed by a **maestro identity id**, not intrinsically a Firebase UID. The column can keep its `firebase_uid` name during transition, but its meaning is "the identity id maestro-server signs into the token." (Migration note: no schema change required if we treat the existing text PK as opaque; a later rename is cosmetic.)
- No Supabase SDK, no Supabase Realtime socket, and no Firebase RTDB connection in any client. Presence/typing (previously RTDB) is relayed through maestro-server's WebSocket bridge alongside the canonical event stream (`04 §2`) — consistent with "clients talk only to maestro-server." RTDB, if kept at all, becomes a server-side implementation detail behind the bridge, not a client dependency.
- The only service-role holders remain trusted server-side workers (storage broker, notification/FCM dispatcher, webhook ingestors) — internal to the deployment, never on the client path.

### 6.2 Dev auth (maestro-native, no emulator)

Dev mode uses the **same** boundary, no Firebase emulator and no Supabase auth machinery:

- maestro-server issues **dev identities** behind its existing dev auth (the local web-password / no-auth-localhost posture it already has), each mapped to a `user_profiles` row, and mints Postgres tokens for them exactly as in prod. One code path, dev and prod — the only difference is how the *upstream* identity is established (dev: server-issued dev user; prod: see §6.4).
- There is **no** `MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS`, no client-supplied uid header, and no anon grants — dev identity is established by the server, never asserted by the client.
- Test suites obtain a dev identity from maestro-server and let it mint tokens; tests never craft Supabase/Firebase tokens.

### 6.3 [current state] The UID bypass, and its removal (D1 — **decided: kill-now, never-shippable**)

The branch deploys `…insecure_uid_test_bypass.sql` whose flag ships **enabled**: it redefines `firebase_uid()` to fall back to the client-supplied `x-collab-firebase-uid` header, accepts any well-formed UID with no token, and grants SELECT on all tables + EXECUTE on 27 RPCs to `anon` — full identity spoofing with only the publishable key. A live probe of the hosted project (2026-07-25, infra session) shows spoofed-header requests failing RLS, so the migration appears **not applied to the deployed database** — the exposure is latent (in-repo, activated by the next `db push`), not live today (definitive confirmation via `supabase migration list` pending an access token).

Resolution (user-approved kill-now):

- **The bypass path is removed from the migration sequence entirely** — not "shipped disabled." The reversal is migration 1 of `01 §11`: it drops `private.collab_runtime_flags`, restores the original `firebase_uid()` / `is_valid_firebase_identity()` (now: token-issuer-only, where the trusted issuer is maestro-server), and revokes every `anon` grant. No future `db push` can activate it because the flag, the header fallback, and the anon grants no longer exist in any migration on the forward path.
- **Kill-switch as remediation, not as design:** *if* deployed-state verification (Bedrock, sess_1784929957658_ovt5kgbf9) ever finds the bypass migration applied, the immediate one-row remediation is `UPDATE private.collab_runtime_flags SET enabled=false WHERE key='insecure_uid_bypass';` — documented purely as the break-glass step before the reversal migration lands, never as a shippable state.
- Coordinated with Bedrock, who owns deployed-state verification.

### 6.4 Prod identity source — **DECIDED: Reading B (user-confirmed 2026-07-25)**

The client boundary is settled (clients ↔ maestro-server only). The upstream-of-maestro-server prod question — what establishes a human's identity before maestro-server mints the Postgres token — is **resolved to Reading B**:

**Firebase remains the production human sign-in, verified strictly server-to-server by maestro-server and invisible to clients.** maestro-server verifies the Firebase sign-in on the server side (the client never receives or handles a Firebase token), maps the verified Firebase identity to a `user_profiles` row, then mints the short-lived Postgres JWT exactly as in §6.1. This preserves Firebase's account machinery (sign-up, recovery, federation) while keeping maestro-server the sole client-facing boundary and the sole Postgres-token issuer.

Consequences already consistent with this doc set: the client contract is unchanged (clients only ever see maestro-server — §6.1); `user_profiles` keys on the Firebase-derived identity id maestro-server signs into the token; dev mode still uses server-issued dev identities (§6.2) — the only difference between dev and prod is how maestro-server *learns* the human identity (dev: server-issued; prod: Firebase server-to-server), never how clients authenticate. The rejected alternative (Reading A — fully maestro-native identity, Firebase dropped, maestro-server owning account lifecycle) is recorded here as the deferred option should account ownership ever move in-house; switching to it would touch only maestro-server's upstream identity step, not the API surface.

## 7. Rate and size limits

| Limit | Value (initial) | Enforcement |
|---|---|---|
| Message body | 10,000 chars | DB CHECK (exists) + Zod |
| Doc body | 200,000 chars | DB CHECK + Zod |
| Mutation rate | 60/min per identity, burst 20 | maestro-server, keyed on the resolved identity id; `429` |
| Read rate | 600/min per identity | maestro-server |
| `walk` payload | depth ≤ 3; ≤ 100 neighbors, ≤ 50 messages per call; response hard cap ~256 KiB with per-section truncation markers | service layer |
| `collections.query` limit | ≤ 200 items/page | service layer |
| Events buffer | ~5 min / 1,000 events per space (reconnect window) | event mapper |
| File upload | broker-issued signed URL, ≤ 25 MiB v1 | storage broker |

Truncation is always explicit (`truncated: true` + a cursor/`walk` refinement hint) — an agent must be able to tell "small neighborhood" from "clipped payload".
