# Collab V2 — Backend Context

**Branch:** `feat/collab-v2-supabase-backend`

## Purpose

This branch starts the backend-only implementation of Maestro Collab V2. It replaces
Firestore as the durable collaboration model with a Supabase/Postgres entity graph,
while preserving Firebase for identity, RTDB presence, Cloud Storage bytes, Functions,
and FCM.

## Architecture

| Concern | System |
| --- | --- |
| Human identity | Firebase Auth; Firebase UID is the canonical `text` identifier |
| Durable collaboration data and authorization | Supabase Postgres with RLS |
| Client graph access | Direct `supabase-js` calls carrying Firebase ID tokens |
| Agent identity | `team_member` entity, owned by a space `member` |
| Presence / typing | Firebase RTDB only; never durable graph data |
| File bytes | Firebase Storage, accessed through trusted signed-URL functions |
| Notifications | Postgres activity/outbox model, with Firebase Functions/FCM delivery |

Supabase Third-Party Auth trusts Firebase JWTs. Firebase blocking hooks add
`role: "authenticated"`; the client forces a Firebase token refresh before its first
Supabase request. Supabase does not own user accounts, so the schema deliberately does
not reference `auth.users`: `user_profiles.firebase_uid text` is the identity key.

## Data-model rules

- `entities` is the universal envelope; per-kind detail tables carry typed content.
- Same-kind `parent_id` hierarchy is containment/context splitting.
- Typed `edges` are horizontal, many-to-many relationships; `x:*` permits extensions.
- Every entity has `visibility`, `version`, and `activity_at`.
- Messages are entities anchored to any entity; replies use message hierarchy.
- Points are append-only ledger events; reactions are unique typed edges.
- Local Maestro receives rendered projections and reports work back as messages, edges,
  and status events. It is never a field-level mirror.

## Deployed database migrations

1. `20260723205849_collab_v2_phase0_foundation`
2. `20260723214340_fix_uuidv7_pgcrypto_schema`
3. `20260724024500_collab_v2_phase1_task_domain`
4. `20260724031500_collab_v2_messages_counters_activity`

These establish Firebase-compatible identity/RLS, UUIDv7, spaces/entities/members/
team-members, tasks and task axes (not globally seeded), messages, reactions, points,
counters, activity, outbox, version/activity behavior, secure RPCs, and graph
validation.

## Security boundaries

- Never expose Supabase service-role credentials to a client.
- Every security-definer write RPC must recheck space membership and `can_act_as`.
- `walk` stays security invoker so RLS filters graph reads.
- Storage Rules default-deny direct object access. The broker checks live Postgres
  membership, scopes objects to `spaces/{spaceId}/`, and returns short-lived URLs.
- RTDB presence requires Firebase auth and own-UID writes, but does not claim to
  duplicate Postgres membership authorization.

## Current backend-only scope

Implemented on this branch: schema/migrations, RLS/RPCs, Firebase auth hooks, browser
Supabase client, Storage broker, Storage rules, and backend tests/docs. No Collab V2 UI
is part of this branch.

## Next work

1. Complete and run the Phase 1 invariant test suite: hierarchy, typed edges and
   acyclicity, RPC negative authorization, counters/rebuild, version-vs-activity, and
   point idempotency.
2. Finish Storage broker deployment prerequisites (runtime IAM and bucket CORS), then
   verify signed upload/download against a real member/non-member pair.
3. Add server/CLI Supabase data clients and replace the V1 Firestore-only Collab path
   behind a feature flag.
4. Add notification outbox worker, docs/files metadata, PR tracking, and search.
5. Plan Firestore import and staged cutover only after backend parity.

## Source design documents

- `docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md`
- `docs/COLLAB_V2_GAPS_AND_EXTENSIONS.md`
- `docs/COLLAB_V2_UI_UX_BRIEF.md`
- `docs/COLLAB_V2_SUPABASE_FIREBASE_IMPLEMENTATION_PLAN.md`
