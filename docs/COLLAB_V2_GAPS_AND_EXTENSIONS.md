# Maestro Collab V2 — Gaps, Non-Goals & Extension Backlog

**Status:** Backlog / companion to `COLLAB_V2_ENTITY_GRAPH_DESIGN.md`
**Date:** 2026-07-23
**Purpose:** Everything identified in the coverage review that is *not* in the core
design doc — either because it needs its own design pass (Part A), is deliberately out
of scope (Part B), or is absorbable later without schema change (Part C). Pick items up
from here when planning phases.

The completeness test used throughout: *can X be expressed as an entity kind + edges +
anchored messages + a ledger entry?* If yes, the core model holds and X is backlog, not
redesign.

---

## Part A — Real v1 gaps (design before/during Phase 1; cheap now, expensive later)

### A1. Search
No search story exists in the core doc, and collaboration dies without find (chat
history, task descriptions, docs).

Sketch:
- `search_index(entity_id pk, space_id, kind, tsv tsvector, updated_at)` maintained by
  trigger from a small per-kind list of searchable fields (task title/description, doc
  title/content, message body, member/TM names).
- GIN index on `tsv`; `websearch_to_tsquery` for the query side; `pg_trgm` for
  fuzzy/substring on titles.
- One RPC: `search(space_id, query, kinds[], limit)` → ranked entity refs. CLI:
  `maestro collab search "…" [--kind task]` — agents need this as much as humans.
- **Phase 1.** Bolting on later means backfilling triggers across every table.

### A2. Read state / unread counts
Notifications have `readAt`, but chat UX needs per-member "what have I seen" for
badges — and because messages anchor to any entity, the same mechanism gives unread
badges on task threads and doc discussions, not just channels.

Sketch:
- `read_marks (member_id, anchor_id, last_read_at, PRIMARY KEY (member_id, anchor_id))`
- Unread count = messages on anchor with `entity_id > uuid_at(last_read_at)` (uuid_v7 is
  time-ordered, so this is an index range scan).
- Upsert on scroll/focus; RLS: members write only their own marks.
- **Phase 1** (chat ships with badges or feels broken).

### A3. Activity feed
"What happened in this space / on this task since I left." The audit substrate already
exists (edges, entity_versions, point_events, messages — all with actor + timestamp),
but there is no unified read model.

Sketch:
- `activity` table written by the same triggers that bump counters:
  `(id uuid_v7, space_id, entity_id, actor_id, verb, ref_id, summary jsonb, created_at)`
  with verbs like `created|updated|linked|reacted|awarded|completed|joined`.
- Space feed = `WHERE space_id`, entity feed = `WHERE entity_id` (+ subtree via
  `entity_tree`), member feed = `WHERE actor_id`.
- This is also the natural **notification source**: notification fan-out becomes
  "subscribe members to activity rows that concern them (mention, assignment, award)"
  instead of bespoke per-event triggers — simpler than v1's taxonomy.
- Agents use it too: "what changed since my pinned version" gets a narrative, not just
  a version delta.
- **Phase 1–2** (feed UI Phase 2; the table should exist from Phase 1 so history is
  complete).

### A4. Private channels / entity visibility
Core RLS is space-level: every member sees everything. Small teams are fine; private
channels get demanded early. This is the one gap that touches *every* RLS policy, which
is why the decision must be made **before Phase 0**, even if the decision is "defer."

Sketch (if adopted):
- Envelope gains `visibility text NOT NULL DEFAULT 'space'` (`'space' | 'restricted'`)
  and `restricted` entities get `visible_to` edges (`entity —visible_to→ member`).
- The `is_space_member()` SELECT policy becomes
  `is_space_member(space_id) AND (visibility = 'space' OR has_visible_to_edge(auth))`.
- Children inherit the root's visibility (hierarchy = context boundary); messages
  inherit their anchor's.
- **Recommendation:** ship v1 all-space-visible, but add the `visibility` column
  (constant `'space'`) and write RLS against it from day one, so turning it on is a
  policy change, not a migration.

### A5. Review / approval verdicts
`work_status = 'in_review'` exists but nothing captures who must approve and whether
they did — and the completed-by/points flow needs an answer to "who may press the
button."

Sketch:
- Edge types: `approval_requested_from` (task → member|team_member) and `approved_by`
  (task → member|team_member, props `{verdict: 'approved'|'changes_requested', note}`).
- `complete_task` RPC optionally enforces "all requested approvals are `approved`."
- Review conversation is just messages anchored to the task (or to the PR entity) — no
  new message machinery.
- **Phase 2–3.**

---

## Part B — Explicit non-goals (declared so nobody accidentally attempts them)

- **B1. Live co-editing of docs (CRDT/OT).** Collab docs are versioned artifacts with
  discussion, not Google Docs. Realtime says *that* a doc changed; it does not merge
  concurrent keystrokes. Last-write-wins + version history + "N is editing" presence
  hint is the ceiling for v1/v2.
- **B2. Per-entity fine-grained ACLs** beyond A4's visibility flag. Space membership
  remains the trust boundary. No per-field permissions, no role matrices per entity.

---

## Part C — Absorbable later (no schema change; new kinds / edge types / RPCs only)

| Item | How it lands in the model |
|------|---------------------------|
| C1. Collections / sprints / milestones / boards | New kind `collection` + `contains` edges (any entity). Ordering via edge `props.position`. Task lists, sprint scopes, curated doc sets — one mechanism. |
| C2. Polls & decision records | Poll = message + reactions (already works). Formal decisions = kind `decision` with `decides_for` edges; discussion anchors to it. |
| C3. Task / entity templates | Kind `template` holding a snapshot; `instantiate(template)` RPC copies subtree + edges (same machinery as cross-space copy). |
| C4. Live agent session visibility | Kind `work_session` mirroring a local maestro session (status, current step), `working_in` edge to the task. Report-back messages already cover the narrative; this adds live state if wanted. |
| C5. GitHub App / webhooks | Same `pull_request`/`commit` tables; the webhook becomes another writer keeping `state` live + auto-suggesting transitions. Planned Phase 4 in core doc. |
| C6. Headless agent credentials | Today agents authenticate via their owner's token (fine for agents on the user's machines). CI/server-side agents need scoped API keys (Supabase JWT with a `team_member` claim). Add when a headless deployment actually exists. |
| C7. Cross-space copy tooling | `copy_of` edge exists in core; the actual `copy_entity(subtree, target_space)` RPC (strip actors, re-anchor, re-link) is backlog. |
| C8. Points rollup policy | Do a team_member's earned points roll up to its owner member on leaderboards? Ledger already attributes both (`entity_id` = earner, ownership resolvable) — this is a query/product decision, not schema. |
| C9. Reminders / due-date nudges | Scheduled function scanning `tasks.due_date` → activity rows → notification pipeline. |
| C10. External integrations beyond GitHub (Linear, Slack import…) | New provider values on `pull_request`-like tracking kinds, or new kinds; writers are adapters. |

---

## Part D — Architecture-pass findings (fixed in the core doc, recorded here)

Findings from the critical pass over `COLLAB_V2_ENTITY_GRAPH_DESIGN.md`; each was
applied to the core doc on 2026-07-23:

1. **Member uniqueness was unenforceable as written** — `members` detail table needed a
   denormalized `space_id` to enforce `UNIQUE (space_id, user_id)`. Fixed in §9.
2. **Point grants were not idempotent** — agent/CLI retries could double-grant. Added
   `client_event_id` (unique, nullable) to `point_events`, matching messages'
   `client_msg_id` pattern. Fixed in §11.2.
3. **`?mentions=` query path had no index** — mentions are jsonb; added GIN index note
   (alternative: promote mentions to edges later). Fixed in §6.
4. **Version ≠ activity.** `entities.version` only tracks *content* writes, so
   projection staleness missed new comments/edges/PRs. Added `activity_at` to the
   envelope (bumped by anchored messages and touching edges) so "content-stale" and
   "discussion-moved" are distinct, cheap signals. Fixed in §5.3/§12.2.
5. **Deletion semantics were undefined** — what happens to children, anchored messages,
   and edges when an entity is deleted. Policy added: soft-delete cascades down the
   subtree at the API layer (RPC), edges/messages retained but hidden with their
   entity; hard purge is a later maintenance job. Fixed in §5.4.
6. **`entity_versions` growth unbounded** for large docs (200k-char snapshots per
   write). Mitigation noted: debounced snapshots (one per actor per N minutes) +
   retention cap per entity. Fixed in §12.2.
7. **Supabase Storage RLS** must mirror space membership for file objects (bucket
   policy keyed by space path) — one line, but security-critical. Noted in §14.
8. **`spaces` table** was referenced but never sketched; minimal definition added
   (id, name, github refs, visibility, created_by user, timestamps). Noted in §5.3.

Re-verify each of these when Phase 0 DDL is actually written.
