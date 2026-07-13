# Maestro Spaces — Design Decisions Log

> Living log. We lock decisions one dimension at a time. Nothing here is documented as a spec yet — this is the decision record the spec will be written from.
> Status legend: 🔒 locked · 🟡 proposed/tentative · ❓ open

North-star (user): **this Spaces system is the foundation for a future multi-user, multi-agent platform.** Design choices should not paint us into a single-user corner.

Vision (user's words): **"Full Jira + Slack" — the core of Jira + the core of Slack, on Maestro.**
A **Space** is a shared collaboration workspace (Slack-style messaging + Jira-style issues + shared files/docs/context/tasks/team-members/teams/spells). Humans work in the UI; **agents read & write via the maestro CLI**. Multiple spaces (multi-workspace) supported in the CLI.

---

## Pre-locked (from earlier answers)

| # | Decision | Status |
|---|----------|--------|
| P1 | **Deliverable** (eventually): one design spec `docs/maestro-spaces-spec.md` = Space model + CLI command surface. First we lock decisions here. | 🔒 |
| P2 | **Agent identity in a space:** agents act **fully as the human user** (no separate bot/agent identity). Reads & writes are attributed to the signed-in user. | 🔒 |
| P3 | **Import model:** **one-time copy (snapshot)** of the entity into local Maestro, **plus a persistent link** back to the space item (not live-synced; re-import to refresh). | 🔒 |
| P4 | **Export + Import are bidirectional:** users/agents can **export** local items into a space and **import** space items locally. | 🔒 |
| P5 | **Two task models:** a Space **Issue** is rich (Jira-like: estimates, assignees, tracking…); when imported it becomes a **simple local Maestro task** that keeps a **link** to the space issue. | 🔒 |
| P6 | **Auth/backend direction:** user signs into Firebase in the **Maestro UI**; that session is **shared to the local maestro-server**; the **CLI goes through the server** (server holds the Firebase auth and proxies all Space reads/writes). CLI never talks to Firebase directly. | 🟡 (sub-decisions open: server access mode, UI-direct-vs-proxy, token handling) |

---

## Round 1 — Foundation & Space model

| # | Decision | Status |
|---|----------|--------|
| 1.1 | **Reuse vs fresh (my recommendation, locked):** **Extend the existing Firebase Collab Space** as the foundation — reuse the working Firestore schema, `CollabSpaceClient`/`MessagingClient`, members/roles, and security rules; model the rich Jira issue as an **extension of the existing `SpaceTask`**. **But** change the access topology: agents/CLI go through **maestro-server as a gateway** (per P6) instead of hitting Firestore directly. Rationale: messaging + membership + roles + realtime already work and are Slack-shaped; a rewrite throws away working realtime for no gain. The real gap is the server gateway + rich issues + import/export + git, which are all additive. | 🔒 |
| 1.2 | **Space ↔ repo:** **repo is OPTIONAL.** A **core space is standalone** (pure collaboration). Linking a GitHub repo upgrades it to a **git space**. (Note: existing Collab Space is always repo-scoped — this relaxes that; `githubUrl` becomes optional.) | 🔒 |
| 1.3 | **Space types supported by the model:** `core` (base), `git` (extends core + linked repo), `personal` (private single-owner). **Org/team space is OUT** (not modeled for now). | 🔒 |
| 1.4 | **v1 scope = ALL FOUR pillars:** (a) Slack messaging + CLI read/write, (b) Jira issues + local task linking, (c) sharing of files/docs/context/team-members/teams/spells, (d) git space (PRs/branches). Ambitious v1; phasing within will be defined in Round-later. | 🔒 |

## Round 2 — Messaging (Slack core)

| # | Decision | Status |
|---|----------|--------|
| 2.1 | **Chat surfaces:** public channels, private channels, **threads**, **DMs (1:1)**, and **group DMs** — all included. | 🔒 |
| 2.2 | **Message features (lean v1):** **edit / soft-delete** + **file attachments** only. **OUT of v1:** reactions, @mentions, full-text search, read/unread state, presence, typing. (Deferred — revisit later.) | 🔒 |
| 2.3 | **Chat does NOT trigger agents.** Chat is human-facing; agents do not get auto-invoked from messages. Agents only read/write via the CLI on their own schedule. (The "@mention → session prompt" idea is dropped.) | 🔒 |
| 2.4 | **Agent message consumption = on-demand read only** (history + later search). **No live streaming/watch** in the CLI. Simpler server + CLI. | 🔒 |

> Note: 2.2 drops search from v1, but agents still read via history (2.4). Search is a later phase.

## Round 3 — Issues / Tasks (Jira core) + local linking

| # | Decision | Status |
|---|----------|--------|
| 3.1 | **Jira depth:** **Issues + Kanban board** (columns by status, drag to move). **No sprints/backlog** in v1. | 🔒 |
| 3.2 | **Space Issue fields:** basics (title, description, status, priority) **plus all of:** issue **type** (story/bug/task/epic), **estimate/story-points**, **labels**, **assignees** (multi), **reporter**, **due date**, **comments + activity log**, **sub-issue hierarchy** (parent/children), **attachments**. This extends the existing `SpaceTask` schema. | 🔒 |
| 3.3 | **Workflow:** **fixed default status set** for all spaces: `todo → in_progress → in_review → completed | cancelled | blocked` (matches current `SpaceTask`). Not per-space configurable. | 🔒 |
| 3.4 | **Local task ↔ Space Issue link:** **manual two-way pull + push**, snapshot each time, never automatic. **Export** creates *or updates* the linked space issue (push local up); **import/pull** refreshes the local task from the space. Local task stays a *simple* Maestro task carrying a link `{ spaceId, spaceIssueId }`; rich Jira-only fields live in the space and are dropped locally. | 🔒 |

## Round 4 — Sharing & entity taxonomy

| # | Decision | Status |
|---|----------|--------|
| 4.1 | **"Context" is NOT a separate entity.** Per user: *"tasks, team members, docs, messages — all these are context."* The **space itself is the shared context**; "context" = the collective of all its entities. Nothing called `context` in the schema. | 🔒 |
| 4.2 | **Unified, TYPED file/doc entity.** Per user: *"we have different types of files."* One file/document concept with a `type` discriminator — authored docs (**markdown**, **excalidraw**) and uploaded blobs (**image, pdf, binary, …**) are all "files" distinguished by type. (Aligns with Maestro's existing docs = markdown + excalidraw.) | 🔒 |
| 4.3 | **File storage:** **Firebase Storage** for blobs; **metadata in Firestore**; the **CLI uploads/downloads via the maestro-server** (never touches Firebase directly, per P6). | 🔒 |
| 4.4 | **Reusable configs (team-members, teams, spells):** **publish (export) → install (import copy)**, one-time snapshot, **no ongoing sync**. Matches the existing adopt/install design. | 🔒 |

**Resulting space entity list:** channels + messages (with file attachments) · issues (Jira) · files/docs (typed) · team-members · teams · spells · members. "Context" = all of the above, collectively.

## Round 5 — Git space

| # | Decision | Status |
|---|----------|--------|
| 5.1 | **Git features (read + linking, v1):** view **PRs** (list/detail/state/reviews/checks), view **branches + commits**, and **link Space Issues ↔ PRs/branches** (issue shows its PR + status). **OUT of v1:** PR write actions (create/comment/merge) — later phase. | 🔒 |
| 5.2 | **GitHub auth:** reuse the user's **local `gh` CLI / PAT**, with the **maestro-server shelling out to `gh`/`git`**. Simplest start; no GitHub App/OAuth setup for v1. | 🔒 |
| 5.3 | **Repo linking (my recommendation, locked):** **support both** flows — (a) *verify + bind*: space stores the repo URL, linking a local project checks `project remote == space repo` then binds; (b) *clone + link*: from the space, clone the repo and auto-create/link a local project. GitHub hosts the code; the space only references it. | 🔒 |
| 5.4 | **A git space can link MULTIPLE repos** (`repos[]`, not a single `githubUrl`). Relaxes the current single-repo Collab Space. | 🔒 |

## Round 6 — Maestro CLI command surface

| # | Decision | Status |
|---|----------|--------|
| 6.1 | **Space selection:** **current space + `--space` override.** `maestro space use <id>` sets a persistent current space; commands default to it; `--space <id>` overrides per-command. (Slack-CLI-like.) | 🔒 |
| 6.2 | **Write safety:** **full read/write by default** for agents (they act as the user, P2). No extra gating in v1. | 🔒 |
| 6.3 | **Surface:** **CLI in v1**, designed so a thin **MCP wrapper can expose the same commands later**. No MCP server in v1. | 🔒 |
| 6.4 | **Local vs space = separate namespaces.** `maestro task …` = local Maestro tasks (unchanged). `maestro space issue|message|file|member|... ` = space entities. Import/export commands bridge the two. | 🔒 |

## Round 7 — Auth & backend internals

| # | Decision | Status |
|---|----------|--------|
| 7.1 | **Server → Firestore = passthrough user token.** UI login hands the user's Firebase **refresh token** to the server; the server mints ID tokens and calls Firestore **as the user**, so **Firestore security rules remain the single source of authz**. (Confirms/completes P6.) Multi-user-future friendly: each request acts under its own user. | 🔒 |
| 7.2 | **UI stays direct-to-Firestore** (client SDK + `onSnapshot` realtime), as the existing Collab Space does. **Only the CLI/agents go through the server.** Dual path, least rework. | 🔒 |
| 7.3 | **CLI inherits the server session** — no separate CLI login. Server holds the user's Firebase session from UI login; CLI uses it automatically; `maestro auth status` reflects the user. | 🔒 |
| 7.4 | **Realtime in the UI only** (Firestore `onSnapshot`). Server/CLI are **request/response**; CLI is pull-only (2.4). No server-side Firestore subscriptions in v1. | 🔒 |

> P6 is now fully resolved (🔒). Note: v1 assumes a **local server holding one user's session**; the shared multi-user server is the future north-star and the passthrough model (7.1) extends to it.

## Round 8 — Discovery, UI scope, build order, non-goals

| # | Decision | Status |
|---|----------|--------|
| 8.1 | **Discovery/join:** standalone (core) spaces joined by **invite link / space ID**; **git spaces additionally discoverable by their linked repo** (as today). Keep **public/private** visibility. | 🔒 |
| 8.2 | **UI in spec = structural.** List the UI surfaces (space view, channels/threads/DMs, Kanban board, issue detail, members, files, git panel) and map them onto the existing `SpaceWindow` sections. No pixel mockups. | 🔒 |
| 8.3 | **Build order:** (1) **foundation** — server gateway + auth handshake + space/entity model; (2) **messaging** + CLI; (3) **issues** + local task linking; (4) **sharing** — files/docs/configs; (5) **git space**. De-risk plumbing first. | 🔒 |
| 8.4 | **Confirmed non-goals for v1:** reactions, @mentions, message search, presence, unread state · sprints/backlog · PR write actions (create/comment/merge) · external MCP server · CLI live streaming/watch · notifications · shared multi-user cloud server. | 🔒 |

---

## Minor defaults I'll assume in the spec (unless you object)

- **Roles/RBAC:** reuse the existing `owner` / `admin` / `member` model + Firestore rules (no new roles).
- **Issue keys:** space issues get a human key like `SPACE-123` (Jira-style) in addition to the Firestore ID.
- **Channels:** each space auto-creates a default `#general`; private channels carry an explicit member list.
- **DMs/group DMs:** modeled as channels with a `kind` discriminator (`channel` | `dm` | `group_dm`) + canonical member key — one conversation model (Slack's trick).
- **Data store:** everything under the existing `collabSpaces/{spaceId}/…` Firestore tree; new subcollections `issues`, `files` added; `SpaceTask` extended into the rich issue.
- **Deliverable:** one spec `docs/maestro-spaces-spec.md` + a refreshed architecture diagram reflecting the passthrough-auth / UI-direct / CLI-via-server topology.

## Status: ALL 8 DIMENSIONS LOCKED ✅ — ready to write the spec.
