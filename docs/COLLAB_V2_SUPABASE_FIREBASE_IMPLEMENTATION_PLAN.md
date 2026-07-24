# Collab V2 — Supabase + Firebase Implementation Plan

**Status:** Approved implementation direction; database credentials pending

**Last updated:** 2026-07-24

## 1. Architecture decision

Collab V2 keeps Firebase for identity and client-facing Firebase capabilities, while
moving all durable collaborative/relational data to Supabase Postgres.

| Concern | Owner | Notes |
| --- | --- | --- |
| Sign-in and user identity | Firebase Auth | Firebase UID is the canonical human identity. |
| Entity graph and business data | Supabase Postgres | The only durable source of truth for Collab V2. |
| Authorization | Supabase RLS + Firebase ID token | Supabase trusts the registered Firebase JWT issuer; membership and permissions are read from Postgres. |
| Files | Firebase Storage via trusted signed URLs | Postgres stores metadata/path; clients never receive broad direct bucket access. |
| Presence, typing, transient live state | Firebase RTDB | Never mirror durable entities, messages, or edges here. |
| Push delivery | Firebase Cloud Messaging | Delivery only; notification intent and inbox rows live in Postgres. |
| Trusted asynchronous/admin work | Firebase Cloud Functions / Cloud Run | Signed upload/download URLs, FCM dispatch, GitHub webhooks, scheduled jobs, migration. |

Normal application and CLI graph reads/writes go directly to Supabase using its public
publishable key and the signed-in user's Firebase ID token. No service-role key may
ever ship to a client. Cloud Functions are reserved for trusted or asynchronous work.

Firebase Storage cannot query Postgres RLS, so it is explicitly **not** directly
client-readable or client-writable for space data. A trusted Firebase worker verifies
Postgres membership, then returns short-lived signed upload/download URLs for objects
under `spaces/{spaceId}/…`; Storage Rules deny general client access. This keeps graph
and blob authorization consistent.

## 2. Identity and authorization model

Supabase Third-Party Auth is configured to trust the existing Firebase project. All
Firebase users receive a `role: "authenticated"` custom claim. The browser client
provides `currentUser.getIdToken()` as the Supabase access token. After the custom
claim rollout, clients force one token refresh with `getIdToken(true)` so already
signed-in users receive the claim promptly.

The V2 schema must not reference `auth.users`, because Firebase—not Supabase—is the
identity source. Instead:

- `user_profiles.firebase_uid text primary key` stores the Firebase UID and display
  profile.
- `members` gives a Firebase user one entity per space.
- `team_members` are agent personas owned by a member.
- RLS helpers resolve `auth.uid()` (Firebase UID) to the caller's member and owned
  team-member entities.
- `current_identity()` is the first authenticated call; it validates the Firebase
  issuer/audience and non-anonymous identity, then upserts `user_profiles` from safe
  token claims before any profile FK can be needed.

RLS is deliberately database-backed, not claim-backed: joining/leaving a space,
assignment changes, and role changes take effect immediately. The policy helpers are:

- `is_space_member(space_id)` — read access to an ordinary private space.
- `is_space_admin(space_id)` — settings, invite, and membership operations.
- `can_act_as(actor_entity_id)` — caller owns the member or agent persona named as
  the actor.
- `is_task_assignee(task_entity_id)` — task-specific workflow permission where
  appropriate.

Simple access is enforced in RLS. Compound, invariant-bearing operations use narrowly
scoped security-definer RPCs: `create_space`, `redeem_invite`, `post_message`,
`pull_entity`, `complete_task`, `react`, and `link_pr`. Every such RPC must re-assert
membership and `can_act_as` before a read or write and has a negative authorization
test. `walk` is security invoker and read-only, so table RLS remains its authorization
source instead of duplicating access logic inside a privileged function.

## 3. Repository integration decisions

The active application is `maestro-ui`, a Vite/React/Tauri application, not a Next.js
app. Therefore the generic Next.js `page.tsx`, cookies, SSR client, and middleware
snippets are not introduced here: they are for Supabase Auth cookie sessions and would
conflict with the Firebase Auth architecture.

Instead, `maestro-ui` receives a browser-only Supabase client that obtains a refreshed
Firebase ID token for each Supabase request. `@supabase/ssr` may remain installed for
future Next.js/server surfaces, but is not used by the Vite client. A future server
surface must verify Firebase tokens before it uses privileged credentials; it must not
attempt to create a Supabase cookie session.

## 4. Delivery phases

**Current implementation scope:** backend only. Until explicitly expanded, this work
covers database migrations, RLS/RPCs, Firebase trusted functions/rules, Maestro
CLI/client data access, and automated tests. It excludes all Collab V2 UI components,
screens, visual design, and interaction implementation.

### Phase 0 — Connectivity and security foundation

1. Add the Supabase client dependency and public Vite environment variables.
2. Configure Supabase Dashboard → Authentication → Third-Party Auth → Firebase with
   the existing Firebase project ID.
3. Deploy a Firebase Auth lifecycle function that adds `role: "authenticated"` to new
   users, and run a one-time Admin SDK backfill for existing users.
4. Create local Supabase CLI configuration, SQL migrations, seed data, and a test
   harness against the local Supabase stack. The first migration supplies the required
   portable `uuidv7()` implementation; Supabase Postgres does not provide
   `uuid_generate_v7()` by default.
5. Create the Firebase-compatible identity model, RLS helpers, restrictive issuer and
   non-anonymous-identity guard, profile-bootstrap RPC, and RLS tests before exposing
   tables to clients.

**Exit criteria:** a Firebase-signed-in, non-anonymous user can call a protected
`current_identity` RPC; an unrelated or anonymous user cannot read a private space;
no service-role credential exists in a client build.

### Phase 1 — Entity graph foundation

Create migrations for `spaces`, `entities`, `edge_types`, `edges`, `user_profiles`,
`members`, `team_members`, `entity_counters`, `entity_versions`, `point_events`,
`activity`, `notification_outbox`, and `read_marks`.

Implement:

- UUIDv7 IDs, timestamps, soft deletion, version/activity semantics.
- `entities.visibility text NOT NULL DEFAULT 'space'`; RLS policies include it from
  day one even though V1 keeps all entities space-visible.
- homogeneous hierarchy and cycle prevention.
- typed core edges plus namespaced `x:*` extensions.
- counter/activity triggers and rebuild scripts.
- security-definer RPCs plus pgTAP/vitest RLS tests, including one denied-case test
  per RPC and Postgres Realtime/`postgres_changes` authorization coverage.

**Exit criteria:** a local test can create a space, create a member, and enforce
member-only reads while rejecting cross-space entities and invalid edges.

### Phase 2 — First usable vertical slice

Implement `channels`, `tasks`, `messages`, and `task_axes`, plus the data layer in
`maestro-ui` and `maestro-cli`.

Deliver:

- create/join space and member bootstrap
- task hierarchy, axes, acceptance criteria, assignment, and dependencies; `tasks.axes`
  is one JSONB value per named axis with a GIN index, and each space is seeded with
  `type: [default, code, design, review, test]`
- channel/task anchored message threads
- task list/board, detail panel, and realtime refresh/subscription
- Firebase RTDB presence and typing only

**Exit criteria:** two Firebase users can join a space, collaborate on a task and
thread, and see only the rows and `postgres_changes` events their membership permits.

### Phase 1 invariant-test gate

Phase 1 is not deployable until the following database tests pass:

1. **Hierarchy:** same-kind and same-space parent enforcement, cycle rejection,
   and valid subtree reparenting.
2. **Edge types:** registered endpoint-kind enforcement, `x:*` passthrough,
   rejection of unregistered non-namespaced types, and acyclic dependency rejection.
3. **Privileged RPCs:** every security-definer RPC has a negative test proving a
   non-member or non-owner is rejected, including a `post_message` attempt using a
   team-member actor owned by another member.
4. **Counters:** reaction add/remove, mutually exclusive like/dislike swaps, message
   counts including replies, and a rebuild assertion that stored counters equal the
   recomputed edge/message/ledger truth.
5. **Version versus activity:** content writes bump `version` and add a snapshot;
   anchored messages and edges bump only `activity_at`.
6. **Points idempotency:** duplicate `client_event_id` grants are rejected without
   changing the points total.

`task_axes` is introduced with task detail tables in Phase 2, not globally seeded in
Phase 1. Each space then receives the default `type` axis with values `default`,
`code`, `design`, `review`, and `test`.

### Phase 3 — Agent bridge

Replace Firestore-only Collab CLI data access with a V2 Supabase client, while keeping
the v1 path available behind an explicit feature flag.

Deliver `collab walk`, `tree`, `entity get/list`, `message send`, `edge add`, `pull`,
`task status`, `task complete`, and `pr link`. Pull renders a deterministic Markdown
projection; report-back appends messages/edges/status and never field-syncs a local
task.

**Exit criteria:** an agent can pull a task, investigate its graph, report progress,
link a PR, and expose content/activity staleness through the pinned pull edge.

### Phase 4 — Collaboration depth

Add docs/files (Firebase Storage metadata plus trusted signed-URL broker), PR/commit
tracking, reactions, points, awards, versions, search, activity, read marks, and the
notification inbox. The search migration includes a backfill for all pre-existing
searchable entities.

Use a transactional outbox: Postgres RPC/trigger writes durable activity and only
actionable notification rows; a protected Firebase worker with the service-role key in
trusted Functions configuration claims rows using `FOR UPDATE SKIP LOCKED` and sends
FCM for eligible, offline/opted-in recipients. The outbox stores attempts, last error,
processed timestamp, and dead-letter status. Batch and deduplicate notifications.

### Phase 5 — UI composition and automation

Build the entity component contract, panel stack, universal connections/thread
components, saved collection views, channel hubs, and graph canvas. Add GitHub
webhooks/refresh and scheduled reminders through trusted workers.

### Phase 6 — Firestore migration and cutover

Write an idempotent importer from Firestore to V2 entities/edges. Verify counts,
membership, provenance, messages, and attachment metadata. Use a feature flag,
dual-read verification, and a staged cutover; do not mutate or remove Firestore until
V2 parity is verified and rollback is no longer required.

## 5. Notification and cost posture

Postgres triggers/RPCs use normal database compute; they are not a per-trigger product
charge. Supabase database webhooks have no separately listed per-call price, though
database work and outbound network consumption still exist. Firebase Cloud Functions
may incur invocation/compute/network costs above their free allowances; FCM is no-cost.

To keep both noise and cost bounded:

- write activity for all meaningful changes, but enqueue pushes only for mentions,
  assignments, review requests, unblocks, and awards;
- batch/deduplicate per recipient and entity;
- prefer live in-app state for active users and push only when it is useful;
- expose notification-outbox retry/failure state to operators.

Firebase RTDB presence is intentionally lower-sensitivity: paths are scoped by space,
require `auth != null`, and permit writes only at the caller's own UID. It must contain
no durable collaboration state and does not claim to enforce Postgres space membership.

## 6. Credentials and manual inputs still required

Before schema deployment, the project owner supplies credentials through an approved
secret channel or enters them locally—never in source control or chat logs:

- Supabase database password / CLI login access;
- Supabase project ref and migration deployment authorization;
- Firebase project ID (for Supabase Third-Party Auth registration);
- Firebase Admin/Functions deployment authorization for role-claim setup and FCM;
- a decision on the initial Supabase environment layout: one development project plus
  one production project is recommended.

The existing supplied Supabase URL and publishable key are public client configuration;
they are stored only in ignored local environment files.

## 7. Immediate implementation checklist

- [x] Record the hybrid architecture and migration sequence.
- [x] Install the client dependency in `maestro-ui` and add a Firebase-token Supabase
  client helper.
- [x] Add ignored local environment values for the supplied Supabase project.
- [x] Create the Supabase CLI project structure and Firebase Third-Party Auth local
  configuration; the Phase 0 migration/test skeleton follows remote linking.
- [ ] Configure Firebase Third-Party Auth in the Supabase Dashboard.
- [ ] Provide database credentials, then link the CLI and apply the first migration.
