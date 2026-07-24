# Maestro Collab V2 — Entity Graph Design

**Status:** Draft for review
**Date:** 2026-07-23
**Author:** Collab redesign session (`sess_1784823119446_cp6113b1l`, task `task_1784822835044_60h32sc6h`)
**Supersedes (conceptually):** `ENTITY_PUSH_PULL_PLAN.md`, parts of `COLLAB_SPACE_RULES_MODEL.md` — the current Firestore implementation stays running until migration (explicitly out of scope here).

---

## 1. Vision

Maestro Collab V2 stops being "chat + share/pull bolted onto Firebase" and becomes an
**entity graph**: a small set of first-class entities (Task, Member, TeamMember, Message,
Doc, File, Spell, Skill, PullRequest, Commit, Channel) that all share four universal
capabilities:

0. **Hierarchy.** Every entity can have same-kind children (tasks under tasks, docs
   under docs, team members under team members). Hierarchy is *homogeneous* and exists
   to **split context** — a subtree is a self-contained unit you can render, walk, or
   assign on its own. Cross-kind and same-kind *relations* are edges, not hierarchy.
1. **One message shape.** Chat messages, task comments, doc comments, and replies are all
   the same `Message` entity, anchored to any entity, threaded via a parent message.
   Different query paths, one shape.
2. **Reactions everywhere.** Likes, dislikes, stars on any entity — including messages —
   modeled as edges, with derived counters. Points are a multi-contribution ledger.
3. **Edges.** One uniform, graph-like link structure connecting entities
   (`task —assigned_to→ team_member`, `task —tracks→ pull_request`,
   `doc —attached_to→ task`), typed where it pays off, free-form where it doesn't.

Division of responsibility:

- **Collab is the structured, human-maintained source of truth** for collaborative work:
  hierarchical tasks with acceptance criteria, discussion, docs, tracked PRs, points.
- **Local Maestro stays simple** — the execution engine. LLMs care about context only, so
  the bridge *renders* collab entities into plain local maestro objects (projection), and
  work flows back up as appended events, not field-level sync.
- **Agents are first-class collab citizens.** A pulled task carries its collab IDs; the
  agent uses the collab CLI to walk the graph for deeper investigation, post progress
  messages, and link the PRs it creates.

## 2. Decisions already made (from design discussion)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Collab vs local relationship | Collab is source of truth for collab work; local is a **sync/projection layer**. Pull = render context; report-back = append events. |
| 2 | Storage | **Postgres (Supabase)** — SQL + realtime + auth + RLS in one. Not a graph DB (see §4). Graph-shaped data model, relational engine. |
| 3 | Edge typing | **Typed core set with validation, plus free-form types allowed** (open taxonomy). |
| 4 | Reactions | Modeled **as edges** (`member —likes→ entity`), counts derived/materialized. |
| 5 | Unified message entity name | **`Message`**. |
| 6 | Humans | **`User` is a separate global first-class entity**; users own TeamMembers (agent personas). Per-space presence is a `Member` entity. |
| 7 | Entity scoping | **All entities live inside a Space.** Users are global. Cross-space sharing = copy (with `copy_of` provenance edge). |
| 8 | PR tracking | v1: **agent links PRs manually** after creating them (PR becomes an entity, fetched-on-demand status). GitHub App/webhook automation is a later phase. |
| 9 | Points | Multi-contribution counter: any user can add points to an entity (ledger). Likes/stars/dislikes are single-per-user. **Completed-by** flow awards a task's points to the tagged completers (gamification). |
| 10 | Migration | Out of scope for this doc. Design is for the new plan; migration planned after buildout. |
| 11 | Hierarchy | **All entities are hierarchical** (homogeneous: parent and child are the same kind — tasks/tasks, docs/docs, team members/team members). Purpose: **splitting context** into self-contained subtrees. Relations (homo + hetero) are edges. |

## 3. What exists today (baseline)

Current implementation (~4,000 LOC, Firestore): `collabSpaces/{spaceId}` with
subcollections `channels/{id}/messages`, `tasks`, `teamMembers`, `spells`, `docs`,
`files`, `invites`; durable notification inbox + FCM; 702-line security rules; CLI with
loopback auth and direct Firestore access.

Key observations that motivated this redesign:

- **Proto-edges grew ad-hoc.** `pulledByUids[]`, `assigneeUids[]`,
  `parentTaskId/childrenIds`, `sourceTaskId`, `linkedLocalIdsByUid{}` are five different
  hand-rolled relationship encodings on entity documents. V2 replaces all of them with
  one `edges` table.
- **Messages are hard-wired to channels** (`spaceId + channelId`). V2 generalizes the
  anchor to any entity.
- **No reactions exist** — greenfield.
- **No `/users/{uid}` collection** — member profiles are denormalized maps on the space
  doc. V2 promotes users/members to real entities.
- **Copy-based push/pull with provenance is deliberate and works** — V2 keeps the
  copy-not-live-mirror philosophy but replaces symmetric copy with asymmetric
  projection + event report-back.
- Files are inline base64 (≤600 KiB) — V2 moves file bytes to object storage
  (Supabase Storage), keeping only metadata in the graph.

## 4. Storage: Postgres (Supabase), not a graph database

Our real queries are shallow: "messages under task X" (1 hop), "PRs tracking tasks
assigned to member Y" (2 hops), task subtrees (recursive but a few levels deep).
Dedicated graph DBs (Neo4j, Dgraph, ArangoDB) earn their complexity at deep
variable-length traversals, huge graphs, or graph algorithms — none of which we need —
and they give up the three things this product leans on:

- **Auth + Row-Level Security** — replaces the 702 lines of Firestore rules with
  declarative policies colocated with the schema.
- **Realtime subscriptions** — replaces Firestore listeners for chat, presence, and
  live entity updates.
- **Plain SQL** — indexes, transactions, recursive CTEs, aggregate counters.

Escape hatch: **Apache AGE** adds Cypher-style traversal on top of Postgres with no
migration, if we ever genuinely need it.

Deployment: Supabase hosted to start (fastest path: auth providers, Realtime, Storage,
PostgREST out of the box). The schema is vanilla Postgres, so self-hosting later (e.g.
on the EC2/Tailscale box, or behind maestro-gateway) is a lift-and-shift, not a rewrite.

## 5. Entity model

### 5.1 The envelope + detail pattern (class-table inheritance)

Every entity has a row in a single **`entities`** registry table (the envelope) and a
row in a per-kind **detail table**. This gives us:

- One FK target for edges, messages, reactions, counters, versions → real referential
  integrity across the whole graph.
- Uniform envelope semantics (id, space, kind, provenance, version, soft-delete).
- Full SQL typing and constraints per kind in the detail tables (no jsonb blob soup).

### 5.2 Entity catalog

| Kind | Detail table | Notes |
|------|--------------|-------|
| `channel` | `channels` | Chat containers. Chat = messages anchored to a channel. |
| `task` | `tasks` | Hierarchical, typed, acceptance criteria, points. §8. |
| `message` | `messages` | Unified message/comment/reply. §6. An entity itself, so it can be reacted to and linked. |
| `member` | `members` | A user's presence in a space (profile snapshot + role). The subject of reactions, points, assignments. §9. |
| `team_member` | `team_members` | Agent persona: role, identity, memories, model, tool. Owned by a member. §9. |
| `doc` | `docs` | Markdown / diagram (mermaid, excalidraw). Versioned. |
| `file` | `files` | Metadata + Supabase Storage path (no inline base64). |
| `spell` | `spells` | Portable v2 rule shape (trigger/action), lossless. |
| `skill` | `skills` | Markdown skill content, portable. |
| `pull_request` | `pull_requests` | Tracking entity. §10. |
| `commit` | `commits` | Tracking entity. §10. |

Not entities: **Space** (the container — top-level table), **User** (global, maps to
Supabase `auth.users` — represented inside a space by its `member` entity).

Everything in `entities` is space-scoped (`space_id NOT NULL`), per decision #7.

### 5.3 Envelope

```sql
CREATE TABLE entities (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(), -- time-ordered
  space_id    uuid NOT NULL REFERENCES spaces(id),
  kind        text NOT NULL,          -- 'task' | 'message' | 'doc' | ...
  parent_id   uuid REFERENCES entities(id),  -- homogeneous hierarchy (same kind), null = root
  position    double precision NOT NULL DEFAULT 0,  -- ordering among siblings
  created_by  uuid NOT NULL REFERENCES entities(id),  -- member or team_member entity
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer NOT NULL DEFAULT 1,  -- bumped on every CONTENT write
  activity_at timestamptz NOT NULL DEFAULT now(), -- bumped by anchored messages / touching edges
  deleted_at  timestamptz               -- soft delete (uniform across kinds)
);
CREATE INDEX ON entities (space_id, kind, created_at);
CREATE INDEX ON entities (parent_id);
```

`version` and `activity_at` are deliberately separate signals: `version` = the entity's
*content* changed (projection staleness, §12.2); `activity_at` = its *neighborhood*
moved (new comment, new edge, PR linked) — feeds sorting, "active tasks" views, and an
agent's "has discussion moved since I pulled?" check.

The `spaces` container table (not an entity):

```sql
CREATE TABLE spaces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  name text NOT NULL, description text NOT NULL DEFAULT '',
  github_repo text,                       -- 'owner/name', discovery hook
  visibility text NOT NULL DEFAULT 'private',   -- 'private' | 'public'
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`created_by` points at an **actor entity** (a `member` for humans, a `team_member` for
agents) — attribution is uniform and queryable. Bootstrap note: the first `member`
entity in a space is created with `created_by = itself` inside the space-creation
transaction.

### 5.4 Hierarchy is in the envelope, not in edges (decision #11)

Every entity carries `parent_id` — **hierarchy is a universal capability**, like
messages and reactions. Every entity therefore lives on **two axes at once**:

```
        HIERARCHY axis (vertical)          EDGE axis (horizontal)
        parent / children, same kind       typed relations, same or cross kind
        = containment, context splitting   = meaning, linkage

                 parent task
                     │
   doc ──attached_to─┤──assigned_to──▶ team_member
                     │──tracks───────▶ pull_request
                 (this task)
                     │
              child tasks (subtree = pullable context unit)
```

The two axes never mix: the vertical axis answers *"what is this part of / what does it
contain"* (and defines the context boundary), the horizontal axis answers *"what does
this relate to and how."* Details:

- **Homogeneous by rule:** a trigger enforces `parent.kind = child.kind` and
  `parent.space_id = child.space_id`. Task trees, doc trees (sections/chapters),
  team-member trees (a lead persona with sub-personas), channel groups, even message
  hierarchies are all the same mechanism. Cross-kind containment ("doc attached to
  task") is deliberately *not* hierarchy — that's an `attached_to` edge.
- **Why the envelope and not a `child_of` edge:** hierarchy is a *tree* — exactly one
  parent — and a nullable FK column states that in the schema itself (an edge would
  need a uniqueness hack to fake it). It also makes subtree queries a one-table
  recursive CTE and keeps sibling ordering (`position`) in one place. The edge table
  stays reserved for genuine graph relations (homo + hetero), which can be many-to-many.
- **Why hierarchy at all — context splitting.** A subtree is the unit of context: the
  projection composer can render a task *with its subtree* (or a single subtree node)
  as one self-contained context; `collab walk --subtree` scopes an agent's reading to
  a branch; a large doc splits into child docs so agents pull only the chapter they
  need; a team-member tree splits an org's personas into delegable sub-groups. Deep
  hierarchy is cheap; wide flat entities are what bloat LLM context.
- Cycle prevention: the same trigger rejects a `parent_id` whose ancestor chain
  contains the entity itself (bounded walk; trees stay shallow in practice).
- Standard views: `entity_tree(root_id)` — recursive CTE returning the subtree with
  depth and path, used by boards, doc navigation, and the composer alike.
- **Deletion policy:** delete is soft and subtree-scoped — the `delete_entity` RPC
  stamps `deleted_at` down the subtree in one transaction. Edges and anchored messages
  are *retained* but hidden with their entity (they disappear from queries because the
  entity does); nothing hard-deletes in the request path. A later maintenance job hard-
  purges long-soft-deleted subtrees (FKs are `ON DELETE CASCADE` where safe to support
  it). Restoring = clearing `deleted_at` up-tree.

## 6. Messages — one shape for chat, comments, replies

A `Message` is an entity (kind `message`) whose detail row carries:

```sql
CREATE TABLE messages (
  entity_id         uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  anchor_id         uuid NOT NULL REFERENCES entities(id),   -- ANY entity: channel, task, doc, pr, member, spell…
  root_message_id   uuid REFERENCES messages(entity_id),     -- thread root, denormalized (null = top-level)
  author_id         uuid NOT NULL REFERENCES entities(id),   -- member or team_member
  body              text NOT NULL CHECK (char_length(body) <= 10000),
  mentions          jsonb NOT NULL DEFAULT '[]',   -- [{entityId, kind: 'member'|'team_member', display}]
  attachments       jsonb NOT NULL DEFAULT '[]',   -- [{fileEntityId, name, mime}]
  client_msg_id     text,                          -- idempotent reconciliation (kept from v1)
  edited_at         timestamptz
);
CREATE INDEX ON messages (anchor_id, entity_id);        -- "messages for entity X" — the workhorse
CREATE INDEX ON messages (root_message_id);
CREATE INDEX ON messages USING gin (mentions jsonb_path_ops);  -- "?mentions=me" query path
```

Design points:

- **`anchor_id` is the unifying move.** "Chat in #general" = messages anchored to that
  channel entity. "Comments on task T" = messages anchored to T. "Doc review notes" =
  messages anchored to the doc. Same table, same APIs, same UI component, same
  notification pipeline. (Chosen anchor-name: `anchor`.)
- **Threading is just entity hierarchy.** The exact reply target is the envelope's
  `parent_id` (messages are entities; message→message is a homogeneous tree, §5.4) —
  no message-specific parent column needed.
- **Replies denormalize the anchor and the root.** A reply carries the same `anchor_id`
  as its root, so "all discussion under task T, including reply threads" is a single
  indexed query — no tree walk. `root_message_id` groups the thread for flat thread
  views.
- **Messages are entities**, so they can be liked/starred, linked
  (`message —relates_to→ task`), and version-bumped on edit. Soft-delete via the
  envelope's `deleted_at` (body redacted on delete, consistent with v1's tombstones).
- Terminology: we say **Message** everywhere. "Comment" is just a message whose anchor
  isn't a channel — a UI label, not a schema concept.

**Query paths** (all the same shape): `GET messages?anchor=<entityId>` |
`?author=<memberId>` | `?mentions=<memberId>` | `?root=<messageId>`.

## 7. Edges — the graph

### 7.1 One table

```sql
CREATE TABLE edges (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  space_id    uuid NOT NULL REFERENCES spaces(id),
  src_id      uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  dst_id      uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type        text NOT NULL,
  props       jsonb NOT NULL DEFAULT '{}',   -- per-type metadata, see registry
  created_by  uuid NOT NULL REFERENCES entities(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- one edge of a given type between a given pair (points use the ledger, not edges)
CREATE UNIQUE INDEX ON edges (src_id, dst_id, type);
CREATE INDEX ON edges (src_id, type);   -- outgoing:  "what does X link to?"
CREATE INDEX ON edges (dst_id, type);   -- incoming:  "what links to X?"
```

Edges are queried in both directions — "tasks assigned to M" is just the incoming side
of `assigned_to`. There are no reverse-edge duplicates.

### 7.2 Typed core + free-form (decision #3)

A registry table validates the core taxonomy; unregistered types are allowed but
namespaced, so the graph stays open without polluting the core vocabulary:

```sql
CREATE TABLE edge_types (
  type         text PRIMARY KEY,
  src_kinds    text[] NOT NULL,   -- allowed source entity kinds
  dst_kinds    text[] NOT NULL,   -- allowed destination entity kinds
  description  text NOT NULL,
  props_schema jsonb              -- optional JSON-schema for props
);
```

A trigger on `edges` enforces: if `type` exists in `edge_types`, the endpoint kinds must
match; if it doesn't exist, the type must start with **`x:`** (e.g. `x:inspired_by`).
Promoting a proven `x:` type into the registry is a data migration, not a schema change.

### 7.3 Core edge taxonomy (v1 registry)

Hierarchy is **not** an edge type — it lives on the envelope (`entities.parent_id`,
§5.4). Edges cover relations, homogeneous and heterogeneous:

| Type | Src → Dst | Props | Replaces (v1 Firestore) |
|------|-----------|-------|--------------------------|
| `depends_on` | **any → any** | `{hard, note}` | (new — proper dependency semantics, §7.4) |
| `assigned_to` | task → member \| team_member | — | `assigneeUids[]` |
| `pulled` | member \| team_member → **any** | `{localId, pinnedVersion, workStatus}` | `pulledByUids`, `adoptedByUids`, `installedByUids`, `downloadedByUids`, `linkedLocalIdsByUid` |
| `working_on` | member \| team_member → task | `{startedAt, note}` | (new) |
| `completed_by` | task → member \| team_member | `{awardedPoints}` | (new — gamification, §11) |
| `tracks` | task → pull_request \| commit | — | (new) |
| `attached_to` | doc \| file \| spell \| skill → **any** | — | (new — "linked entities") |
| `equips` | task \| team_member → spell \| skill | — | task/TM ↔ spells/skills lists |
| `copy_of` | any → any | `{sourceSpaceId}` | `sourceTaskId` etc. (cross-space copy provenance) |
| `likes` / `dislikes` / `stars` | member → **any** | — | (new — reactions, §11) |
| `relates_to` | any → any | `{note}` | (new — generic free link) |

Note how **`pulled` generalizes across all entities** (decision: pulled-by/working are
not task-only). Pulling a doc, adopting a team member, installing a spell, downloading a
file are all the same edge with the same props shape — the v1 fan-out arrays disappear.

### 7.4 Proper `depends_on` (entity-level dependencies)

`depends_on` is a first-class dependency mechanism for **any entity**, not just
task→task: a task can depend on another task, on a doc being finalized, on a PR being
merged; a doc can depend on a task that produces its content.

- **Resolution is kind-aware.** A dependency is *resolved* when its target reaches its
  kind's terminal state: task → `work_status = 'done'`, pull_request → `state =
  'merged'`, doc/spell/skill/file → exists and not deleted (i.e. resolved at link time,
  useful as "requires" documentation), commit → exists. One SQL function:
  `is_resolved(entity_id)`.
- **Blocking semantics.** `props.hard` (default `true`): a task with an unresolved hard
  dependency is effectively blocked — the UI rolls this up (badge + auto-suggest
  `work_status = 'blocked'`), and the **ready-to-work query** ("open tasks with no
  unresolved hard deps") is the default board filter and the agent's "what can I pull?"
  query. Soft deps (`hard: false`) are informational ordering.
- **Unblock events.** When a target resolves (task completed, PR merged), a trigger
  writes activity/notification rows for the sources of its incoming `depends_on` edges
  — dependents hear about it, humans and agents alike.
- **Cycle prevention** across `depends_on` edges (same bounded-walk trigger approach as
  hierarchy, applied per edge type that declares `acyclic: true` in `edge_types`).
- **Interaction with hierarchy:** depending on a parent entity means depending on its
  whole subtree resolving (composer and ready-query interpret it that way) — hierarchy
  splits context, `depends_on` sequences it.
- Projection: the composer renders unresolved dependencies prominently ("do not start
  before: …") so a pulled task carries its ordering constraints into local context.

## 8. Tasks

```sql
CREATE TABLE tasks (
  entity_id           uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  axes                jsonb NOT NULL DEFAULT '{}',   -- {axisName: value}, see "multi-axis" below
  work_status         text NOT NULL DEFAULT 'open',
      -- 'open' | 'pulled' | 'working' | 'in_review' | 'done' | 'blocked' | 'cancelled'
  priority            text NOT NULL DEFAULT 'medium',
  acceptance_criteria jsonb NOT NULL DEFAULT '[]',  -- [{id, text, done, doneBy, doneAt}]
  points_estimate     integer,                      -- optional seed for the points pool
  due_date            date
);
```

- **Multi-axis classification** (decision: "multiple axes — default and manual"):
  axes are a first-class system, not a label soup. Each axis is a named dimension with
  values; a task holds at most one value per axis in `axes` (GIN-indexed for filtering).

  ```sql
  CREATE TABLE task_axes (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
    space_id   uuid NOT NULL REFERENCES spaces(id),
    name       text NOT NULL,            -- 'type', 'platform', 'milestone', …
    axis_values text[] NOT NULL,         -- allowed values (open axes: empty = free text)
    kind       text NOT NULL DEFAULT 'manual',  -- 'default' (seeded) | 'manual' (team-defined)
    position   integer NOT NULL DEFAULT 0,
    UNIQUE (space_id, name)
  );
  CREATE INDEX ON tasks USING gin (axes jsonb_path_ops);
  ```

  Every space is seeded with the **default axis** `type: [default, code, design,
  review, test]`. Teams add **manual axes** freely (platform, area, milestone…).
  Boards, filters, and collection views can group/slice by *any* axis
  (`axes->>'type'`, `axes->>'platform'`) — the UI treats all axes uniformly, so a
  default axis and a manual axis are indistinguishable in use. Axis definitions are
  space-scoped config, not entities.
- **Hierarchy** comes from the envelope (`parent_id` + `position`, §5.4) — replaces
  v1's `parentTaskId`/`childrenIds`. A subtree is the natural unit for pulling: pull a
  parent task and the composer can fold in (or link out to) its children.
- **Assignment, pulls, PRs, docs, spells, skills, team members** are all
  edges (§7.3) — the task row holds only intrinsic content. "Everything about task T"
  is: detail row + incoming/outgoing edges + messages anchored to T + counters. That
  neighborhood is exactly what the projection composer renders (§12) and what
  `collab walk` returns (§13).
- **`work_status` vs pull edges:** `work_status` is the human-facing rollup on the task;
  `pulled`/`working_on` edges carry the per-actor granularity (who, which local copy,
  which pinned version). Multiple members can pull the same task; status transitions to
  `pulled`/`working` when the first edge appears (API-level rule, not a trigger
  guessing intent).
- **Versioning:** every content write bumps `entities.version` and snapshots into
  `entity_versions` (§12.2) — this is what projections pin against.

## 9. Users, Members, TeamMembers

Three layers, per decisions #6/#7:

```
User (global, auth.users + profile)          — the human, one per account
  └─ Member (per-space entity)               — that human's presence in a space
       └─ TeamMember (per-space entity, N)   — agent personas owned by the member
```

```sql
-- global; id = Supabase auth uid
CREATE TABLE user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name text,
  photo_url    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  entity_id    uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  space_id     uuid NOT NULL REFERENCES spaces(id),  -- denormalized from envelope (trigger-checked)
  user_id      uuid NOT NULL REFERENCES user_profiles(user_id),
  role         text NOT NULL DEFAULT 'member',   -- 'owner'|'admin'|'member'
  display_name text,                             -- space-local override
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, user_id)                     -- one member entity per user per space
);

CREATE TABLE team_members (
  entity_id           uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  owner_member_id     uuid NOT NULL REFERENCES members(entity_id),
  name                text NOT NULL,
  role                text NOT NULL DEFAULT '',
  identity            text NOT NULL DEFAULT '',   -- persona prompt
  memories            jsonb NOT NULL DEFAULT '[]',
  model               text,
  agent_tool          text,                       -- 'claude' | 'codex' | 'gemini' | ...
  mode                text,
  permission_mode     text,
  capabilities        jsonb NOT NULL DEFAULT '{}',
  command_permissions jsonb NOT NULL DEFAULT '{}',
  avatar              text
);
```

- **Members are entities**, so humans get the full first-class treatment: they can be
  assigned, mentioned, messaged-about (messages anchored to a member = their wall/
  feedback thread), reacted to, and awarded points. This is "humans as first-class
  entities".
- **Agents act as themselves.** A message or edge created by an agent has
  `created_by`/`author_id` = the `team_member` entity; authorization resolves through
  `owner_member_id → user_id` = the authenticated uid (RLS, §14). Attribution is honest
  (you can see which persona did what) while auth stays anchored to the human account.
- Space **membership itself** is the existence of the `member` entity (created on
  join/invite-redeem via an RPC). Invites carry over from v1 conceptually
  (`space_invites` table: link/code, maxUses, expiry, revocation).

## 10. Related work: PRs and commits

```sql
CREATE TABLE pull_requests (
  entity_id  uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  provider   text NOT NULL DEFAULT 'github',
  url        text NOT NULL,
  repo       text NOT NULL,           -- 'owner/name'
  number     integer NOT NULL,
  title      text NOT NULL DEFAULT '',
  state      text NOT NULL DEFAULT 'open',  -- 'open'|'merged'|'closed'|'draft'
  head_sha   text,
  fetched_at timestamptz              -- last on-demand refresh
);
-- commits: analogous (repo, sha, message, author, url, fetched_at)
```

**v1 flow (decision #8):** linking is manual in the sense of *no webhooks* — but both
humans and agents create links, and both paths produce the same thing (a
`pull_request` entity + a `task —tracks→ pr` edge):

- **Agent:** finishes work, opens a PR with `gh`, then runs
  `maestro collab pr link <taskId> <prUrl>` — the CLI creates/updates the
  `pull_request` entity (fetching title/state via the GitHub API on demand) and adds
  the edge. This is the default report-back step in the agent workflow (§16).
- **Human:** pastes a PR/commit URL on the task in the UI — same entity + edge.

Status refresh is on-demand (`collab pr refresh`) or lazy-on-view. **Later phase:** a GitHub App + webhooks keep `state` live and
auto-transition tasks (e.g. merged PR → suggest `done`); the schema above doesn't change,
only the writer does.

## 11. Reactions, points, gamification

### 11.1 Reactions (single-per-user) — edges

`likes` / `dislikes` / `stars` are ordinary edges `member → any entity`
(decision #4). The unique index `(src_id, dst_id, type)` enforces one-per-user for
free. `likes` and `dislikes` are mutually exclusive — the reaction RPC swaps rather than
stacks. Unreact = delete the edge.

### 11.2 Points (multi-contribution) — ledger

Points differ from reactions: **any user can add points repeatedly, amounts accumulate**
(decision #9). That's a ledger, not an edge:

```sql
CREATE TABLE point_events (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  space_id   uuid NOT NULL REFERENCES spaces(id),
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE, -- what the points are on
  actor_id   uuid NOT NULL REFERENCES entities(id),  -- who gave them (member/team_member)
  amount     integer NOT NULL CHECK (amount != 0),
  reason     text NOT NULL DEFAULT 'grant',  -- 'grant' | 'award' | 'seed'
  ref_id     uuid,                           -- e.g. the task that generated an award
  client_event_id text UNIQUE,               -- idempotency for agent/CLI retries (nullable)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON point_events (entity_id);
```

An entity's points = `SUM(amount)` (materialized in counters, §11.4). Conceptually it's
still an edge-with-amount — we just give it its own table because it's append-only and
non-unique.

### 11.3 Completed-by award flow (gamification)

The "special button": marking a task done with completers tagged.

1. UI/CLI calls `complete_task(taskId, completerIds[])` (one RPC, transactional).
2. Creates `task —completed_by→ member/team_member` edges; sets `work_status = 'done'`.
3. Computes the task's point pool (ledger sum on the task, or `points_estimate` if the
   pool is empty) and appends `point_events` rows with `reason='award'`,
   `ref_id=taskId`, `entity_id = each completer's member entity`.
4. A member's score (per space) = ledger sum over their member entity → leaderboards are
   one GROUP BY.

Idempotency: the RPC refuses a second award for the same `(taskId)` (checked via
existing `completed_by` edges / `reason='award' AND ref_id=taskId` rows).

### 11.4 Counters

Reads must be cheap, so triggers on `edges` / `point_events` / `messages` maintain:

```sql
CREATE TABLE entity_counters (
  entity_id      uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  likes          integer NOT NULL DEFAULT 0,
  dislikes       integer NOT NULL DEFAULT 0,
  stars          integer NOT NULL DEFAULT 0,
  points         integer NOT NULL DEFAULT 0,
  messages       integer NOT NULL DEFAULT 0,   -- discussion size, incl. replies
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

This keeps v1's "derived, not hand-incremented" spirit (the ledger/edges remain the
source of truth; counters are rebuildable with one SQL statement).

## 12. Versioning and the local↔collab bridge

### 12.1 Bridge model: projection down, events up

The bridge is **asymmetric** (decision #1):

**Pull = projection.** A deterministic *context composer* walks the entity's
neighborhood — for a task: description, acceptance criteria, message thread, attached
docs, tracked PRs, assigned team-member identity, equipped spells/skills — and renders
one self-contained markdown context. That becomes a plain local maestro task via the
existing local API. The rendered header always includes the collab coordinates:

```markdown
<!-- collab-ref
space: spc_9f2…   task: ent_a41…   version: 7
walk: maestro collab walk ent_a41…
-->
```

The local task is a **build artifact, not a replica** — you never edit it to edit the
truth. Re-pull re-renders. Server-side, the pull records a
`member/team_member —pulled→ entity` edge with `{localId, pinnedVersion, workStatus}`.

**The projection is a starting point, not a wall** (decision from discussion): the agent
holds collab IDs and can go deeper live via the CLI — walk the graph, read full threads,
open linked docs — whenever the rendered context isn't enough.

**Report-back = appends.** Progress, questions, completion, PR links flow up as new
Messages anchored to the collab task, edge writes (`tracks`, `completed_by`), and
`work_status` updates. Nothing syncs field-by-field, so the v1 conflict surface
disappears.

### 12.2 Versioning

```sql
CREATE TABLE entity_versions (
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  snapshot   jsonb NOT NULL,        -- full detail-row snapshot at that version
  changed_by uuid NOT NULL REFERENCES entities(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, version)
);
```

- Content writes to versioned kinds (task, doc, spell, skill, team_member) bump
  `entities.version` and insert a snapshot (single trigger).
- Staleness is a cheap join: `pulled` edge's `pinnedVersion < entities.version` →
  "your local copy is N versions behind", surfaced in UI and `collab status`. The
  envelope's `activity_at` gives the second, softer signal: content unchanged but
  discussion/links moved since the pull.
- Messages don't snapshot (they get `edited_at`); edges don't version.
- **Growth control:** snapshots are debounced (at most one per actor per few minutes of
  continuous editing — matters for 200k-char docs) with a per-entity retention cap;
  the latest state always lives in the detail row, so history is prunable.

## 13. API surface, query paths, CLI

### 13.1 Access layers

- **UI / mobile:** Supabase client — PostgREST for CRUD, RPC functions for compound
  transactional ops, Realtime for subscriptions.
- **CLI (`maestro collab …`):** same Supabase client under the hood (device-code or
  loopback OAuth like today, token in `~/.maestro/token-store.json`).
- **RPCs (transactional compound ops):** `create_space`, `redeem_invite`, `pull_entity`,
  `complete_task`, `react`, `link_pr`, `post_message`, `walk(entity_id, depth)`.

### 13.2 The agent's CLI (the "walk the graph" requirement)

```
maestro collab walk <entityId> [--depth 1] [--subtree] [--json]  # entity + edges + counters + recent messages (+ children)
maestro collab tree <entityId>                        # homogeneous subtree (tasks, docs, team members, …)
maestro collab entity get|list --kind task --status open --type code
maestro collab messages list --anchor <entityId> [--thread <rootId>]
maestro collab message send --anchor <entityId> "…"    # progress reports, questions, comments
maestro collab edge add <srcId> <type> <dstId> [--props '{…}']
maestro collab pull <entityId>                         # projection → local object + pulled edge
maestro collab task status <taskId> working|in_review|done
maestro collab task complete <taskId> --by <memberId,…> # completed-by + award
maestro collab pr link <taskId> <prUrl>
maestro collab react <entityId> like|star|dislike ; maestro collab points add <entityId> <n>
```

`walk` is the workhorse for agents: one call returns the typed neighborhood
(JSON), letting an LLM navigate hop-by-hop without N queries.

### 13.3 Canonical query paths (all backed by the two edge indexes + anchor index)

- Comments for a task/doc/PR: `messages WHERE anchor_id = ?`
- Everything assigned to me: `edges WHERE dst_id = myMemberId AND type='assigned_to'`
- All PRs tracking tasks assigned to M: 2-hop join on `edges`
- Any subtree (task tree, doc chapters, persona org): recursive CTE over
  `entities.parent_id` (`entity_tree(root_id)` view)
- Who pulled this spell / is it stale: `pulled` edges + version compare
- Leaderboard: `point_events` GROUP BY entity (member), ORDER BY sum

## 14. AuthZ: Row-Level Security

Replaces `firestore.rules`. Sketch:

- `is_space_member(space_id)` — SECURITY DEFINER helper: does a `member` entity exist in
  this space whose `user_id = auth.uid()`?
- **SELECT** on all space-scoped tables: `is_space_member(space_id)` (public spaces:
  read-only discovery policy).
- **INSERT/UPDATE** on entities/edges/messages/point_events: member of the space AND the
  acting entity (`created_by`/`author_id`/`actor_id`) resolves to `auth.uid()` — either
  your own `member` entity or a `team_member` whose `owner_member_id` is yours. This is
  the agent-attribution rule from §9.
- **Immutability:** provenance columns (`created_by`, `created_at`, `copy_of` props) and
  `point_events` rows are insert-only (no UPDATE policy; award idempotency in RPCs).
- **Role gates:** space settings, invite management, member removal → `owner`/`admin`
  role on the member row.
- Size caps (message length, doc length, file size) as CHECK constraints — cheaper and
  more honest than rule-side length checks.
- **Supabase Storage policies mirror space membership:** file objects live under
  `spaces/{spaceId}/…` and the bucket policy calls the same `is_space_member()` —
  the graph's RLS and the blob store's RLS must never disagree.

Tests: pgTAP or a vitest harness against a local Supabase stack (replaces
`firestore-rules-tests/`).

## 15. Realtime

- One Realtime subscription per open space, on `postgres_changes` filtered by
  `space_id`, fanned out client-side by table + anchor/kind to the open panels (same
  role the WebSocket bridge plays locally).
- Presence (who's viewing which channel/entity) via Supabase Realtime presence channels
  — replaces the RTDB focus hack.
- Notifications: an `notification_items` table written by DB triggers/edge functions on
  message/edge events (mentions, assignments, awards), consumed by the existing
  inbox/FCM pipeline. The v1 notification taxonomy (`task.shared`, `member.joined`, …)
  maps 1:1 onto entity-kind + edge-type events — it gets *simpler*, because every event
  is now "entity created/updated" or "edge added".

## 16. UX flows (how work actually moves)

1. **Author** (human, in Collab UI): create task, set type/axis + acceptance criteria,
   attach design doc, assign a team member, seed points. All structure, all in the graph.
2. **Pull** (human or agent): `collab pull` → projection lands as a local maestro task;
   `pulled` edge appears; task shows "pulled by S (v7)" in the UI.
3. **Work** (agent): reads rendered context; when it needs more, `collab walk` /
   `messages list`; posts progress as messages anchored to the task (these are the same
   messages humans see as the task's comment thread — no separate reporting channel).
4. **Ship** (agent): opens PR with `gh`, `collab pr link` → PR entity + `tracks` edge;
   sets `work_status in_review`.
5. **Review** (human): sees PR on the task, discusses in the same thread, reacts/stars
   good work, then `complete --by …` → done + points awarded.
6. **Track** (everyone): boards by `work_status`/`task_type`, staleness indicators from
   version pins, leaderboards from the ledger.

## 17. Phasing

- **Phase 0 — Foundation:** Supabase project; `spaces`, `entities`, `edges` (+ registry
  & validation trigger), `messages`, `user_profiles`/`members`/`team_members`,
  `entity_counters`, `entity_versions`, `point_events`; RLS + policy tests; auth in CLI
  + UI.
- **Phase 1 — Core collab:** spaces/invites UI, channels + unified messaging (chat and
  entity comment threads from the same component), tasks (hierarchy, axes, acceptance
  criteria), docs/files (Storage), reactions + points UI.
- **Phase 2 — Bridge & agents:** projection composer, `collab pull` + pulled edges +
  staleness, full agent CLI (`walk`, `message send`, `edge add`, `pr link`,
  `task status/complete`), report-back flows.
- **Phase 3 — Depth:** completed-by awards + leaderboards, version history UI,
  spells/skills sharing, notification inbox + FCM parity, cross-space copy.
- **Phase 4 — Automation & migration:** GitHub App/webhooks (live PR state,
  auto-transitions), Firestore→Postgres migration (planned separately, decision #10).

## 18. Companion doc

Coverage review, v1 gaps to design (search, read marks, activity feed, visibility,
approval verdicts), explicit non-goals (CRDT co-editing, fine ACLs), the absorbable
extension backlog (collections/sprints, templates, session visibility, headless agent
credentials, …), and the architecture-pass findings log live in
**`COLLAB_V2_GAPS_AND_EXTENSIONS.md`** — pick up from there when planning phases.

## 19. Open questions (deferred, non-blocking)

- Public-space discovery model on Postgres (v1 has repo-scoped discovery) — needs a
  discovery index/policy design in Phase 1.
- Whether `walk` depth-2+ should be capped/paginated for very chatty entities.
- Attachment of messages to *edges* (e.g. discuss a dependency link) — punt; anchor to
  either endpoint for now.
- Self-hosting timeline (Supabase → EC2/gateway) — schema is portable by design.
