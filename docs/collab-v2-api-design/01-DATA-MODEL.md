# 01 — Data Model Final: Table Catalog, Triggers, RPCs, RLS

**Part of:** `docs/collab-v2-api-design/` — see `00-OVERVIEW.md`.
**Answers:** the finalized SQL foundation — what exists on `feat/collab-v2-supabase-backend` (verified by direct migration audit, 2026-07-25), what changes, and the resolution of every open data-model item (search, read marks, activity, visibility, approvals, saved views, notification outbox).

Status legend: ✅ exists as final · 🔧 exists, changes required · ➕ new · ❌ exists, remove.

---

## 1. Verified current state (8 migrations, 23 tables, 29 RPCs)

The deployed schema already satisfies the core first principles: envelope + detail (class-table inheritance), homogeneous hierarchy with same-kind/same-space/cycle triggers, one edges table with a 14-type registry + `x:*` passthrough, unified anchor messages with threading and immutability triggers, reactions as unique edges with derived counters (+ rebuild/assert RPCs), append-only points ledger with idempotency, version/activity as separate signals, optimistic concurrency (`expected_version` → SQLSTATE 40001) on move/complete/doc/file updates, and a write posture of **SELECT-only RLS + all writes through SECURITY DEFINER RPCs** that internally re-assert `is_space_member` + `can_act_as`.

What the audit found beyond the known gaps:

- The UID-bypass migration ships **enabled by default** (`private.collab_runtime_flags('insecure_uid_bypass', true)`), redefines `firebase_uid()` to trust the client header `x-collab-firebase-uid`, and grants SELECT on all 21 tables + EXECUTE on 27 RPCs to `anon`. A live probe of the deployed project (2026-07-25) indicates this migration is **not applied there yet** — the danger is latent: any future `supabase db push` of the branch activates it. Hence removal is migration 1 in §11. Removal plan in §8.2.
- `notification_outbox` is a **dead table** (RLS on, no policies, no grants, no writers); the live inbox is `notifications`, fed by two fan-out triggers that broadcast to **every member** — no targeting, with real write amplification (1 update → 1 activity → N notifications → N workspace_events).
- `entity_versions` snapshots are manual and **task-only**; `update_document` bumps `version` without a snapshot.
- Four entity kinds permitted by the envelope have **no detail table and no creation path**: `pull_request`, `commit`, `spell`, `skill`.
- Nothing can create a `team_member` persona, delete any entity, or invite anyone (members exist only via `create_space` and `join_public_space`).
- No list/query RPC exists at all; every list is PostgREST offset/Range through the facade.
- `create_space` defaults `space_visibility='public'`, contradicting the `spaces.visibility` column default `'private'`.
- Migration 5 quietly dropped `file`/`spell`/`skill`/`commit` from `attached_to` destination kinds while widening its sources.

## 2. Envelope and container tables

| Table | Status | Final shape / required change |
|---|---|---|
| `spaces` | 🔧 | As deployed. **Change:** `create_space` default visibility → `'private'` (align with column default and design decision #7). |
| `entities` | ✅ | As deployed — `visibility` (`space|restricted`), `version`, `activity_at`, `deleted_at` all present. No column changes for v1. |
| `user_profiles` | ✅ | `firebase_uid text PK` per hybrid plan. |
| `members` | ✅ | Unique `(space_id, firebase_uid)`. |
| `team_members` | 🔧 | Table fine; **add** `created_at/updated_at` timestamps and a creation/update path (§6). |
| `space_invites` | ➕ | `(id uuidv7 PK, space_id FK, code text unique, created_by member FK, max_uses int, use_count int, expires_at, revoked_at, created_at)`. RPCs: `create_invite` (admin), `revoke_invite` (admin), `redeem_invite` (creates member entity+row+counter, idempotent per user). |

## 3. Detail tables

| Table | Status | Notes |
|---|---|---|
| `tasks` | ✅ | Constraints, GIN(axes), status/priority checks as deployed. |
| `task_axes` | ✅ | Plus `update_task_axis`/`delete_task_axis` RPCs (§6). |
| `messages` | ✅ | Unique `(author_id, client_msg_id)`; immutability trigger. Needs edit/delete RPCs (§6), not schema change. |
| `channels` | ✅ | Name-pattern check, unique per space. |
| `documents` | 🔧 | Keep the table name (`docs` in the design doc was a sketch). **Change:** version snapshots (§5.1). |
| `files` | ✅ | `storage_path LIKE 'spaces/<space_id>/%'` enforced; pairs with the (not yet built) signed-URL broker. |
| `pull_requests` | ➕ | `(entity_id PK FK cascade, provider text default 'github', url text, repo text, number int, title text default '', state text check (open|merged|closed|draft), head_sha text, fetched_at timestamptz)`; unique `(repo, number, provider)` per space via space-scoped unique index. Written by `link_pr` (§6) and the tracking worker. |
| `commits` | ➕ | `(entity_id PK, provider, url, repo, sha, message, author, committed_at, fetched_at)`; unique `(repo, sha)` per space. |
| `spells` | ➕ | `(entity_id PK, name, description default '', rule jsonb)` — portable v2 rule shape, lossless. |
| `skills` | ➕ | `(entity_id PK, name, description default '', content text)` — markdown body. |

All four new kinds get create/update RPCs following the `create_document` pattern (actor, space, parent, position, client_mutation_id) and join the version-snapshot set where content-bearing (spell, skill; PR/commit are tracking mirrors — no snapshots, no version bumps beyond metadata refresh).

## 4. Read-model tables (open items resolved)

### S1. Search (gaps A1) — ⏸ DEFERRED for v1 (reserved slot)

**Decision (user, 2026-07-25): no search in v1.** FTS-only was rejected; the command palette operates on recent/known entities only (`02 §3`, `03 §3.1`). The design below is the **reserved slot** — documented so that adding search later is a single additive migration (new table + triggers + one RPC), not a redesign. Nothing else in the model depends on it. Do **not** build `search_index`, its triggers, or the `search` RPC in v1.

```sql
CREATE TABLE search_index (
  entity_id  uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  space_id   uuid NOT NULL,
  kind       text NOT NULL,
  title      text NOT NULL DEFAULT '',
  tsv        tsvector NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON search_index USING gin (tsv);
CREATE INDEX ON search_index USING gin (title gin_trgm_ops);  -- pg_trgm fuzzy titles
```

When built (post-v1): maintained by per-detail-table triggers over a small searchable-field list (task title+description, document title+body, message body, channel name+topic, member/TM names, spell/skill name+description); the enabling migration ships a one-time backfill for all pre-existing entities. RPC `search(p_space_id, p_query, p_kinds text[] default null, p_limit int default 20, p_cursor …)` — security invoker, `websearch_to_tsquery` + trgm fallback, ranked, keyset-paged.

### S2. Read marks / unread counts (A2) — 🔧

`read_marks` + `mark_read` exist. **Add** the missing read side: `unread_counts(p_space_id)` — security invoker, returns `(anchor_id, unread int)` for the caller's member using the uuidv7 time-order range trick (`messages.entity_id > uuid_at(last_read_at)`), powering channel badges and `spaces.navigation` totals in one call.

### S3. Activity feed (A3) — 🔧

Table exists; coverage is partial (task create/update, edge upsert only). **Final verb set** written by triggers/RPCs: `created, updated, moved, deleted, restored, linked, unlinked, reacted, awarded, completed, joined, pulled, work.changed, pr.linked, unblocked`. Plain `message.created` deliberately writes **no** activity row — threads are their own record; mentions notify directly (§5.3). Reactions/points gain activity writes (currently missing).

### S4. Visibility (A4) — ✅ posture confirmed

Column + RLS predicates already exist and are inert (`'restricted'` unreachable). Keep exactly that for v1 — per the gaps-doc recommendation, activation later is a policy change (`visible_to` edges + `has_visible_to_edge()` OR-branch), not a migration. Register `visible_to` in `edge_types` now (data row, unused) so activation touches zero schema.

### S5. Approval verdicts (A5) — ➕ registry rows only

Register `approval_requested_from` and `approved_by` (task → member|team_member, props `{verdict, note}`) in `edge_types` now; `complete_task` gains an optional enforcement flag (`p_require_approvals boolean default false`) in Phase 2–3. No new tables.

### S6. Saved views — ➕ `saved_views`

```sql
CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  owner_member_id uuid NOT NULL REFERENCES members(entity_id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  share_mode text NOT NULL DEFAULT 'private' CHECK (share_mode IN ('private','space')),
  query jsonb NOT NULL,              -- CollectionQuery | GraphQuery
  graph_layout jsonb,                -- {entityId: {x,y}}
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Deliberately **not** an entity: a saved view is a lens on the graph, not a node in it (no hierarchy/edges/messages/reactions apply). CRUD via RPCs; RLS: owner or (`share_mode='space'` AND member).

### S7. Notifications + outbox — 🔧 rewrite fan-out, revive outbox for push only

Two-table split, each doing one job:

- `notifications` (exists) stays the **durable inbox**, but the broadcast triggers are replaced by **targeted** fan-out: mentions (from message `mentions`), assignment (`assigned_to` dst), award (`completed_by`/award ledger), unblock (`depends_on` source when target resolves), invite/join, approval requests. A member's inbox is things that concern them, not everything.
- `notification_outbox` (currently dead) becomes the **FCM dispatch queue** per the implementation plan: rows written only for push-eligible notifications (offline/opted-in recipients); the trusted Firebase worker claims via `FOR UPDATE SKIP LOCKED`, records attempts/last_error/dead_lettered_at. If the push worker is deferred, this table ships empty but alive (policies + writer in place) rather than dead.

### S8. Command ledger (new, from `04 §5`) — ➕ `command_ledger`

`(client_mutation_id text PK, firebase_uid text, operation text, result jsonb, created_at)` — uniform idempotency envelope for every mutating RPC; retention ~24 h (cron purge). RPCs check-and-record inside their transaction; replay returns the stored result. Supersedes today's per-domain-only idempotency (messages, points) without removing those keys.

## 5. Triggers and functions: required changes

### 5.1 Version snapshots become a trigger (design §12.2)

Replace manual task-only snapshotting with one AFTER UPDATE trigger on the versioned detail tables (`tasks`, `documents`, `spells`, `skills`, `team_members`): bump `entities.version`, insert `entity_versions` snapshot. Debounce (skip snapshot if same actor within 5 min — update the latest row instead) and retention cap (keep last 50 per entity; nightly prune) per gaps-doc finding D6. Fixes the audited hole where docs bump version with no snapshot.

### 5.2 Dependency resolution (design §7.4) — ➕

- `is_resolved(entity_id)` — kind-aware terminal-state check (task→done, PR→merged, doc/spell/skill/file→exists∧¬deleted, commit→exists).
- Unblock trigger: when a target resolves (task status→done, PR state→merged), write `unblocked` activity rows targeted at sources of incoming hard `depends_on` edges → notification targeting picks them up.
- `ready_to_work(p_space_id)` view/function: open tasks with no unresolved hard deps — backs the `readyToPull` home preset and the agent's "what can I pull" query.

### 5.3 Notification fan-out rewrite

Drop `fan_out_activity_notification` / `fan_out_message_notification` (all-members broadcast). Replace with one targeted function invoked by the activity/message writers computing recipient sets from the rules in §S7. This also collapses the write-amplification chain (notifications no longer generate per-member workspace_events; a single `notification.created` event per recipient is delivered on their personal event feed, not the space feed).

### 5.4 Misc confirmed keepers

`validate_entity_parent`, `validate_edge`, `prevent_acyclic_edge_cycle`, `validate_task_axes`, message validators, counter maintainers, `capture_workspace_event` (now the canonical event source, `04 §2`), counter rebuild/assert admin RPCs — all as deployed. `ensure_entity_counter` stays message-only (RPCs create counters for other kinds; bootstrap fix migration 8 confirmed).

## 6. RPC catalog — final

**Existing, kept as-is (22):** `current_identity`, `current_space_identity`, `join_public_space`, `create_task`, `create_task_axis`, `post_message`, `write_edge`, `update_edge`, `delete_edge`, `react`, `grant_points`, `place_entity`, `move_entity`, `complete_task` (+approval flag later), `set_pull_state`, `set_work_state`, `create_document`, `create_file_metadata`, `update_document` (+snapshot via §5.1), `update_file_metadata`, `create_channel`, `queue_tracking_refresh`, `mark_read`, `mark_notification_read`, `rebuild_entity_counters`, `assert_entity_counters`.

**Existing, changed (3):**
- `create_space` — default visibility `'private'`.
- `discover_public_spaces` — add keyset pagination (`p_limit`, `p_cursor`); currently unbounded.
- `update_task_content` — keep full-snapshot semantics (deliberate), but snapshots move to the §5.1 trigger.

**New (grouped):**

| RPC | Semantics |
|---|---|
| `delete_entity(id, actor, client_mutation_id)` / `restore_entity` | soft-delete/restore stamped down the subtree in one txn (design §5.4); the **only** writer of `deleted_at` |
| `create_team_member(...)` / `update_team_member(...)` | persona lifecycle; owner = acting member; update versions via §5.1 |
| `create_spell` / `update_spell` / `create_skill` / `update_skill` | per-kind pattern |
| `link_pr(task_id, actor, url, client_mutation_id)` | parse provider/repo/number; upsert `pull_request` entity (unique repo+number) + `tracks` edge, one txn; `link_commit` analogous |
| `edit_message(id, actor, body, mentions, attachments, expected_version)` / `redact_message(id, actor)` | edit bumps version via existing touch trigger; redact = soft-delete + body tombstone |
| `create_invite` / `revoke_invite` / `redeem_invite` | §2 |
| `update_task_axis` / `delete_task_axis` | admin |
| `unread_counts(space_id)` | §S2 |
| `walk(entity_id, depth default 1, opts)` | **security invoker**, read-only (per implementation-plan rule): envelope+content+edge groups(+resolved/hard)+counters+last N messages+children page, RLS-guarded, payload caps from `04 §7` |
| `saved_view_create/update/delete` | §S6 |

Layer rule (with `02 §2`): SQL keeps **per-kind typed RPCs**; the service layer presents the uniform `entities.create/patch` operation and dispatches on `kind`. Uniformity is an API property; the database stays fully typed.

**Views:** ➕ `entity_tree(root_id)` (recursive CTE: subtree + depth + path — boards, doc nav, composer, `delete_entity` all reuse it); ➕ `leaderboard(space_id)` (ledger `GROUP BY` member with rank); `ready_to_work` (§5.2).

## 7. Pagination substrate

No schema blockers: uuidv7 PKs everywhere plus the audited keyset-ready indexes (`workspace_events(space_id, created_at, id)`, `notifications(recipient, created_at desc, id desc)`, `messages(anchor_id, created_at, entity_id)`, `activity(space_id, created_at desc)` — add `id` tiebreaker to the activity index). New list RPCs (`search`, `discover_public_spaces`, `walk` children) take keyset cursors from day one; PostgREST offset/Range reads survive only *inside* the service layer where result sets are bounded, never as public pagination (`04 §3`).

## 8. RLS — posture affirmed, bypass removed

### 8.1 Posture (keep)

SELECT-only policies + all writes via SECURITY DEFINER RPCs is **affirmed as the final design** — it matches "compound, invariant-bearing operations use narrowly scoped RPCs" and makes the write surface enumerable. New tables follow suit: `space_invites` (member SELECT, admin RPCs), `search_index` (member SELECT), `saved_views` (owner/shared SELECT), `command_ledger` (no client SELECT), outbox (no client access, worker only). One deviation to fix: `spaces` SELECT blocks public-space rows even for discovery — fine, since `discover_public_spaces` covers it, but document that PostgREST can never list public spaces directly.

### 8.2 Bypass removal (D11; with `04 §6`)

Removed at the **sequence level**, not shipped-disabled: the reversal migration drops `collab_runtime_flags`, deletes the client-header fallback in `firebase_uid()` and the flag branch in `is_valid_firebase_identity()`, and revokes every `anon` grant (21 table SELECTs, 27 RPC EXECUTEs, schema usage). Because the flag, the header path, and the anon grants no longer exist on any forward migration, no later `db push` can re-activate the bypass. In the same change set the identity helpers are repointed at the **maestro-server JWT issuer** (04 §6.1) so `auth.uid()` resolves the identity id maestro-server signs. Precondition: Supabase Third-Party Auth is configured to trust maestro-server as issuer in the target project, else all access breaks. **Break-glass only** (if a probe ever finds the bypass migration applied before the reversal lands): `UPDATE private.collab_runtime_flags SET enabled=false WHERE key='insecure_uid_bypass';` — remediation, never a shippable state. The facade's `X-Collab-Firebase-Uid` header path and `MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS` env var are deleted with it; clients stop sending Supabase/Firebase tokens entirely (04 §6.1).

## 9. Registry corrections

`edge_types` final: the deployed 14 types, with (a) `attached_to` **dst_kinds restored to all 11 kinds** (migration 5 silently dropped `file/spell/skill/commit` as destinations; attachment targets should not be narrower than the design's "any"), (b) ➕ `visible_to` (S4), (c) ➕ `approval_requested_from`, `approved_by` (S5). `props_schema` stays nullable and **unenforced in v1** [trade-off: JSON-schema validation in a trigger is cost without a current consumer; revisit when `x:` promotion first happens].

## 10. Retention and maintenance jobs

| Data | Policy |
|---|---|
| `entity_versions` | debounce on write; keep last 50/entity; nightly prune |
| `workspace_events` | retain 7 days (reconnect/poll window is minutes; 7d covers debugging), daily prune |
| `command_ledger` | 24 h TTL |
| soft-deleted subtrees | hard purge after 30 days (maintenance job, honors FK cascades) |
| `tracking_refresh_requests` | completed/failed rows pruned after 7 days |

## 11. Migration sequence from the branch state

1. `collab_v2_revert_uid_bypass` — §8.2. First and unconditional: drops the flag table, header fallback, and all `anon` grants so no later `db push` can re-activate the bypass (D11). Also repoints the identity helpers at the maestro-server JWT issuer (04 §6.1).
2. `collab_v2_detail_kinds` — `pull_requests`, `commits`, `spells`, `skills` + create/update RPCs + `link_pr`/`link_commit`.
3. `collab_v2_lifecycle` — `delete_entity`/`restore_entity`, `create/update_team_member`, `edit_message`/`redact_message`, `space_invites` + invite RPCs, `create_space` default fix.
4. `collab_v2_read_model` — `unread_counts`, `entity_tree`/`leaderboard`/`ready_to_work`, activity verb completion, `discover_public_spaces` pagination. (Search deferred — `search_index`/`search` are a later additive migration per §S1.)
5. `collab_v2_versioning_deps` — snapshot trigger + debounce/retention, `is_resolved` + unblock trigger.
6. `collab_v2_notifications` — targeted fan-out rewrite, outbox revival, registry corrections (§9).
7. `collab_v2_idempotency` — `command_ledger` + RPC integration, `saved_views`.

Each migration lands with the Phase-1 invariant gate extended to its surface (the implementation plan's test gate remains unconfirmed on the branch — re-run it as migration 1's precondition).
