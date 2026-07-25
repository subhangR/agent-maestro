# tm8 — Entity Graph: Inherited Model + Deltas

**Status:** FINAL (2026-07-25) — amended per `07-ARCHITECTURE-REVIEW.md` (R2, R7, R8, R9, R10, R29 + team-affiliation note); verified per `08-AMENDMENT-VERIFICATION.md`. The Collab V2 entity-graph design is inherited as ground truth; this doc records only what tm8 **adds or changes**. Anything not mentioned here is adopted unchanged (envelope+detail pattern, homogeneous hierarchy, edges table + registry + `x:*`, unified messages, reactions as edges, points ledger, counters, version/activity, soft-delete subtree semantics, RLS posture, multi-axis tasks, acceptance criteria, completed-by award flow, asymmetric bridge, `depends_on` resolution, DEV-1..13).

Inherited normative docs: `COLLAB_V2_ENTITY_GRAPH_DESIGN.md`, `COLLAB_V2_GAPS_AND_EXTENSIONS.md`, `docs/collab-v2-api-design/01-DATA-MODEL.md` (final table catalog + migration sequence).

---

## 1. New core kinds (promoted from the gaps-doc backlog)

### 1.1 `work_session` (from C4) — the execution shadow

Detail: `(entity_id PK, node_id/home text, project_ref text, status text check (spawning|running|idle|exited|failed), agent_tool text, model text, started_at, exited_at, share_mode text default 'none' check (none|space|explicit), transcript_doc_id uuid null)`.

- Created by the execution block's spawn transaction; edges: `working_on → task`, spawned-by attribution via `created_by` (a `team_member` or `member`).
- Commands: the `execution.*` operation-catalog family — `execution.spawn`, `execution.prompt` (PTY delivery, see 04 §6), `execution.terminate`, `execution.streams.attach` [R10/R16]. `work_session.status` has a **single writer**: the execution block's transition function [R29].
- Timeline = messages + activity anchored to the entity (no bespoke timeline table).
- Live terminal per T-L10: `share_mode` is the graph-side announce/authorize state; bytes never touch the DB.
- Transcript on exit = a document entity `attached_to` the work_session (reviewable history without byte recording).

### 1.2 `collection` (from C1) — curated sets

Detail: `(entity_id PK, name, description, collection_type text default 'manual')` + `contains` edges (any entity, `props.position` for ordering). Absorbs old maestro's TaskList; also sprints/milestones/curated doc sets. Registered edge type: `contains (collection → any)`.

## 2. Custom entity kinds (T-L4) — new mechanism

```sql
CREATE TABLE entity_kinds (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),          -- surrogate PK [R7]
  kind        text NOT NULL,              -- namespaced for custom: 'c:design_asset'
  origin      text NOT NULL DEFAULT 'custom' CHECK (origin IN ('core','custom')),
  space_id    uuid REFERENCES spaces(id), -- custom kinds are space-scoped; core = NULL/global
  icon        text,
  field_schema jsonb NOT NULL DEFAULT '[]',  -- [{name, type: text|number|bool|date|enum, required, values[]}] — scalars ONLY [R8]
  capabilities jsonb NOT NULL DEFAULT '{}',  -- which universal caps are surfaced (all default on)
  created_by  uuid, created_at timestamptz DEFAULT now(),
  UNIQUE (space_id, kind)                                  -- two spaces may both define 'c:design_asset' [R7]
);
CREATE UNIQUE INDEX entity_kinds_core ON entity_kinds(kind) WHERE space_id IS NULL;  -- core kinds global-unique [R7]

CREATE TABLE custom_entities (
  entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  fields    jsonb NOT NULL DEFAULT '{}'   -- validated against entity_kinds.field_schema on write (trigger)
);
```

- Envelope capabilities (hierarchy, edges, messages, reactions/points, collection views, panel tabs) work with zero additional wiring.
- Kind resolution is a two-step lookup: `(entity.space_id, kind)` falling back to the core row (`space_id IS NULL`); the envelope's kind-validation trigger does the same [R7]. Custom-kind entities never cross spaces; a `c:` kind pulled across the bridge arrives as its rendered projection, never as a registry import [R7].
- UI: the KindRegistry consumes `entity_kinds` rows and generates default renderers (Z2 = top schema fields; Z3 Content = field list; filters/group-by over jsonb, GIN-indexed). The registry must accept **runtime-registered kinds** (generated-renderer path) — a compile-time-only registry is insufficient (review §12).
- Guardrails: custom kinds are namespaced (`c:` prefix, mirroring `x:` edges); **no custom commands, no custom triggers**; promotion to a core kind (typed detail table, bespoke commands) is a migration.
- **Fields are scalars only in v1 [R8]** (`text|number|bool|date|enum`). There is no `entity_ref` field type: display-only refs would smuggle relations into jsonb (rebuild `assigneeUids[]` inside the mechanism T-L3 exists to kill), and auto-materialized edges import edge-lifecycle complexity into the part of the system meant to be dumb. **If a relation matters, it is an edge, full stop** — the custom-kind panel has the Connections rail for exactly this. Revisit only on demonstrated need.
- **Schema evolution [R9]:** edits are additive-or-relaxing by default (add field, widen enum, make optional); reads tolerate missing fields (render empty); a *tightening* edit (new required field, narrowed enum) is refused unless the space admin runs it as an explicit backfill action. Validation checks the current schema **on write only** — old rows are grandfathered until touched.

## 3. Old-maestro entity mapping (convergence table)

| agent-maestro | tm8 | Notes |
|---|---|---|
| Project | linked project resource on a space | many-to-many; project = repo/workingDir ref, not a container |
| Task (+TaskList order) | `task` (+`collection`) | hierarchy from envelope; assignment/deps as edges |
| Session | `work_session` + execution side tables | §1.1; timeline → anchored messages/activity |
| TeamMember | `team_member` | fields already mirrored in the collab schema |
| Team (leader + members, sub-teams) | `team_member` hierarchy | org-tree = the homogeneous parent mechanism; leader = parent. A strict tree cannot express membership in two teams: primary org line = hierarchy; secondary affiliation = a registered `member_of` (or `x:member_of`) edge (review §4) |
| Spell | `spell` | portable rule shape, lossless (inherited) |
| Skill | `skill` | markdown content (inherited) |
| Docs on sessions/tasks | `doc` + `attached_to` edges | |
| Modal/timeline/manifest bookkeeping | operational side tables | never entities (T-L3) |

## 4. Execution side tables (operational, T-L3)

- `session_manifests (work_session_id PK, manifest jsonb, created_at)` — the spawn manifest (prompt context, skills, permissions) as handed to the terminal; auditable, not graph data.
- `stream_grants (work_session_id, subject_identity, mode view|drive, granted_by, expires_at)` — explicit-share bookkeeping for T-L10 (only if `share_mode='explicit'` needs per-person grants; else omitted).
- `session_modals` — agents raise interactive modals mid-run over the runtime surface; operational side table + immediate-class WorkspaceEvent, never an entity; the compat adapter must carry the `modal` verbs [R29].

## 5. Auth-model delta

`user_profiles` is keyed by a **tm8 identity id** (opaque, immutable text; issued by the node's identity block [R1/R6]). The inherited D5 *posture* is kept — server-established identity, RLS as the sole authorization source, no service-role bypass — but the token step is replaced: tm8-server owns the Postgres connection, so identity binds per-transaction via `SET LOCAL` claims read by the RLS helpers; JWTs exist only at verifying boundaries (the bridge) [R2]. tm8-native accounts, no Firebase anywhere (supersedes Reading B within tm8; see `05-DECISIONS.md` T-D3). Presence/typing ride the WS bridge (no RTDB).

## 6. Storage delta

File blobs: local disk under the node's data dir (laptop) / object storage or disk on hubs, brokered by tm8-server signed routes; path convention `spaces/<spaceId>/…` with the same membership checks as the graph (inherited invariant: graph RLS and blob authz must never disagree). No Supabase Storage, no Firebase Storage.
