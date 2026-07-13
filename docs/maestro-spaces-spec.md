# Maestro Spaces — Design Spec (v1)

> **"Full Jira + Slack, on Maestro."** A **Space** is a shared collaboration workspace: Slack-style messaging + Jira-style issues + shared files/docs and reusable configs. Humans work in the Maestro UI; **agents read & write through the `maestro` CLI**. Multiple spaces are supported (multi-workspace).
>
> This spec is written from the locked decision record in [`maestro-spaces-DECISIONS.md`](./maestro-spaces-DECISIONS.md). Every decision below traces to a locked item (e.g. `[3.4]`). North-star: this is the **foundation for a future multi-user, multi-agent platform** — v1 must not paint us into a single-user corner.

---

## 1. Overview

### 1.1 The two layers

| Layer | What it is | Who uses it | Backing |
|---|---|---|---|
| **Space** (cloud) | The shared source of truth: channels/messages, issues, files/docs, shared configs, members. Rich, collaborative. | Humans (UI) + agents (CLI) | Firebase (Firestore + Storage) |
| **Local Maestro** | The lightweight execution layer: local projects, sessions, simple tasks. | Agents + the operator | maestro-server (`~/.maestro`) |

The two are bridged by **export/import** (snapshot + link). A Space Issue is a rich Jira record; when imported it becomes a *simple* local Maestro task that keeps a link back `[3.4]`.

### 1.2 Access topology (locked)

```
Humans (UI) ───────────────▶ Firestore + Storage   (direct client SDK, realtime onSnapshot)  [7.2, 7.4]
                                     ▲
                                     │ passthrough user token (rules enforced)  [7.1]
Agents / CLI ──▶ maestro-server ─────┘   (request/response; server holds the user's Firebase session)  [6.x, 7.3]
```

- The **UI keeps talking to Firestore directly** with the client SDK and `onSnapshot` realtime — unchanged from today `[7.2]`.
- The **CLI never touches Firebase.** It calls maestro-server, which acts **as the user** against Firestore using a stored **refresh token** (mints ID tokens per request), so **Firestore security rules stay the single source of authz** `[7.1]`.
- The CLI **inherits the server's session** — no separate CLI login. The user signs in once in the UI; that session is shared to the local server `[7.3]`.
- Agents **act fully as the human user** — no separate bot identity `[P2]`.

### 1.3 Relationship to the existing Collab Space

We **extend** the Firebase Collab Space already on branch `fix/auto-save-architecture` `[1.1]`: reuse `collabSpaces/{spaceId}`, `members`/roles, `channels` + `messages`, security rules, and the `SpaceShareClient` push model. We **add**: the server gateway, the rich **issue** model (extends `SpaceTask`), **files** (typed, Storage-backed), **git space**, and the **CLI**. We **relax** two things: `githubUrl` becomes optional `[1.2]` and a space may link **multiple repos** `[5.4]`.

---

## 2. Concepts & glossary

- **Space** — a collaboration workspace. Has a `type` and holds all entities below. "Context" = the whole of a space's contents, not a separate entity `[4.1]`.
- **Space types** `[1.3]`: `core` (base), `git` (core + linked repo(s)), `personal` (private, single-owner).
- **Member** — a person in a space with a role (`owner` / `admin` / `member`) `[minor: RBAC reuse]`.
- **Channel** — a conversation surface: `kind` ∈ `channel` (public/private) | `dm` | `group_dm` `[2.1, minor]`.
- **Message** — text in a channel, with edit/soft-delete and file attachments `[2.2]`. Supports **threads**.
- **Issue** — a rich Jira-style record (the space's "task") `[3.1–3.3]`.
- **File** — a typed document/blob: `markdown` | `excalidraw` | `image` | `pdf` | `binary` … `[4.2]`. Blob in Storage, metadata in Firestore `[4.3]`.
- **Shared config** — a published **team-member**, **team**, or **spell** `[4.4]`.
- **Local task** — an ordinary Maestro task that may carry a `spaceLink` back to a Space Issue `[3.4]`.

---

## 3. Space model & data layout

All data lives under the existing Firestore tree `collabSpaces/{spaceId}/…`. New subcollections are `issues` and `files`; `SpaceTask` is superseded by the richer `issues` (see §5).

```
collabSpaces/{spaceId}                     ← space root (extended)
  ├── channels/{channelId}                 ← existing; + kind, memberIds
  │     └── messages/{messageId}           ← existing; + attachments[], threadId(existing)
  ├── issues/{issueId}                     ← NEW (rich Jira issue; supersedes tasks/)
  │     └── comments/{commentId}           ← NEW (issue comments + activity)
  ├── files/{fileId}                       ← NEW (typed file/doc metadata; blob in Storage)
  ├── teamMembers/{id}                     ← existing (publish/install)
  ├── teams/{id}                           ← NEW (publish/install)
  ├── spells/{id}                          ← existing (publish/install)
  └── invites/{inviteId}                   ← invite links / join tokens
Storage: spaces/{spaceId}/files/{fileId}/{filename}   ← NEW (blobs)  [4.3]
```

### 3.1 Space root document

```ts
interface Space {
  id: string;
  type: 'core' | 'git' | 'personal';          // [1.3]
  name: string;
  description: string;
  visibility: 'public' | 'private';            // [8.1]
  ownerId: string;
  memberIds: string[];                          // for array-contains queries
  members: Record<string, SpaceMember>;         // denormalized profiles
  repos: SpaceRepo[];                           // [5.4] empty for core/personal; >=1 for git
  issueCounter: number;                         // for SPACE-123 keys  [minor]
  issueKeyPrefix: string;                       // e.g. "ACME"           [minor]
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface SpaceMember {                          // reuse existing CollabSpaceMember
  uid: string; displayName: string | null; email: string | null;
  photoUrl: string | null; role: 'owner' | 'admin' | 'member'; joinedAt: Timestamp;
}

interface SpaceRepo {                            // [5.x] git space
  githubUrl: string; host: string; owner: string; repo: string;
  addedBy: string; addedAt: Timestamp;
}
```

- `type` drives **capabilities** (§10). A `core`/`personal` space has `repos: []`; attaching a repo does not by itself change `type` — but a space with `repos.length > 0` is treated as a git space for capability purposes.
- **Discovery** `[8.1]`: `private` → joinable only via invite link / space ID; `public` → also listed. Git spaces are **additionally** discoverable by any of their `repos[].githubUrl` (reusing the existing repo-scoped index).

### 3.2 Channels & messages (extend existing)

```ts
interface Channel {                              // extends existing Channel
  id: string; spaceId: string;
  kind: 'channel' | 'dm' | 'group_dm';           // [2.1, minor: one conversation model]
  name: string;                                  // channels only; dm/group_dm derive a label
  isPrivate: boolean;                            // private channel
  memberIds: string[] | null;                    // null=all members (public); else explicit
  dmKey: string | null;                          // canonical sorted-uid key for dm/group_dm dedupe
  description: string; createdBy: string;
  isDefault: boolean;                            // #general
  position: number; lastMessageAt: Timestamp | null;
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface Message {                              // extends existing Message
  id: string; spaceId: string; channelId: string;
  authorUid: string; authorDisplayName: string; authorPhotoUrl: string | null;  // author = the user [P2]
  content: string;
  attachments: FileRef[];                        // [2.2] references into files/
  threadId: string | null;                       // thread root id (existing reserved field)  [2.1]
  replyCount: number;
  createdAt: Timestamp; editedAt: Timestamp | null; deletedAt: Timestamp | null;  // [2.2]
}

interface FileRef { fileId: string; name: string; type: string; }
```

- **DMs / group DMs** are channels with `kind` + `dmKey` (sorted member uids) so re-opening a DM finds the existing one — Slack's single-conversation-model trick `[minor]`.
- **Threads**: a reply sets `threadId = rootMessageId`; the root tracks `replyCount` `[2.1]`.
- **Deferred** `[2.2]`: reactions, @mentions, search, presence, unread. Fields are not added for these in v1.

### 3.3 Issue (rich Jira record) — supersedes `SpaceTask`

```ts
interface Issue {
  id: string; spaceId: string;
  key: string;                                   // "ACME-42"  [minor]
  type: 'story' | 'bug' | 'task' | 'epic';        // [3.2]
  title: string; description: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled' | 'blocked';  // fixed [3.3]
  priority: 'high' | 'medium' | 'low';
  estimate: number | null;                       // story points / hours [3.2]
  labels: string[];                              // [3.2]
  assigneeUids: string[];                        // [3.2]
  reporterUid: string;                           // [3.2]
  dueDate: Timestamp | null;                     // [3.2]
  parentIssueId: string | null;                  // sub-issue hierarchy [3.2]
  childrenIds: string[];
  attachments: FileRef[];                        // [3.2]
  linkedRefs: GitRef[];                          // linked PRs/branches [5.1]
  boardPosition: number;                         // Kanban ordering within a status column [3.1]
  // provenance / linking (snapshot + link, both ways) [3.4]
  createdFromLocal: { projectId: string; taskId: string; userId: string } | null;
  linkedLocalIdsByUid: Record<string, string>;   // uid -> their local task id
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
}

interface GitRef { kind: 'pr' | 'branch'; repo: string; number?: number; name?: string; url: string; state?: string; }

// issues/{id}/comments/{id}
interface IssueComment {
  id: string; issueId: string; authorUid: string; authorDisplayName: string;
  kind: 'comment' | 'activity';                  // activity = status/assignee change log [3.2]
  content: string;                               // comment text OR rendered activity line
  createdAt: Timestamp; editedAt: Timestamp | null;
}
```

The Kanban board (§9) is a view over `issues` grouped by `status`, ordered by `boardPosition` `[3.1]`.

### 3.4 File / doc (typed, Storage-backed)

```ts
interface SpaceFile {
  id: string; spaceId: string;
  type: 'markdown' | 'excalidraw' | 'image' | 'pdf' | 'binary' | string;  // [4.2]
  name: string; mimeType: string; size: number;
  storagePath: string;                           // spaces/{spaceId}/files/{id}/{name} in Storage [4.3]
  // authored docs (markdown/excalidraw) may also inline small content for fast render:
  inlineContent: string | null;
  folder: string | null;                         // optional grouping
  createdBy: string; createdAt: Timestamp; updatedAt: Timestamp;
}
```

Blobs live in **Firebase Storage**; metadata in Firestore; the **CLI uploads/downloads via the server** (server streams to/from Storage using the user's token) `[4.3]`.

### 3.5 Shared configs (publish → install)

Reuse the existing shape for `teamMembers` and `spells`, add `teams`. Each carries provenance (`sourceUserId`, `source*Id`) and install counters (`installedByUids`, `installCount`). **One-time copy, no sync** `[4.4]`.

---

## 4. Auth & session flow (locked)

1. **UI login** — user signs into Firebase (Google / email) in the Maestro UI (existing `auth.ts`).
2. **Session share** — the UI/desktop app hands the Firebase **refresh token** (+ uid/profile) to the **local maestro-server** via `POST /api/auth/session`. The server persists it under `~/.maestro` (or `~/.maestro-staging`).
3. **Server acts as user** — for any Space request, the server mints a fresh **ID token** from the refresh token and calls the **Firestore/Storage REST API as the user**; **security rules enforce membership** `[7.1]`.
4. **CLI inherits** — the CLI calls the local server; it needs no Firebase creds and no separate login. `maestro auth status` shows the signed-in user; if the server has no session, commands return a clear "sign in via the Maestro UI" error `[7.3]`.
5. **Agents = the user** — every read/write is attributed to that user `[P2]`.

> Multi-user future `[north-star]`: the passthrough model generalizes — a shared server holds a session **per user** and each request acts under its own token. v1 assumes **one user per local server**.

---

## 5. Local Maestro task ↔ Space Issue

Two models, deliberately different weights:

| | **Space Issue** (rich) | **Local Maestro task** (simple) |
|---|---|---|
| Fields | type, status, priority, estimate, labels, assignees, reporter, due date, comments/activity, sub-issues, attachments, git refs | title, description, status, priority, hierarchy, sessionIds, teamMember |
| Store | Firestore `issues/` | maestro-server `~/.maestro` |
| Link | `linkedLocalIdsByUid[uid]` | `spaceLink: { spaceId, issueId, issueKey }` |

**Linking is manual, two-way, snapshot each time** `[3.4]`:

- **Export (`push`)** — create *or update* a Space Issue from a local task; sets both link fields. Rich fields the local task lacks are left at defaults / preserved on update.
- **Import (`pull`)** — create *or refresh* a local task from a Space Issue; **drops** Jira-only fields locally but keeps the `spaceLink`. Space remains the source of truth for the rich record.
- No automatic sync; re-run `push`/`pull` to reconcile.

---

## 6. maestro-server API (what the CLI calls)

New REST surface on maestro-server (all requests act as the session user via §4). Illustrative:

```
POST   /api/auth/session                 # UI -> server: hand over refresh token
GET    /api/auth/status                  # who am I

GET    /api/spaces                        # list my spaces (+ ?repo= for git discovery)
POST   /api/spaces                        # create
GET    /api/spaces/:id                    # space detail
POST   /api/spaces/:id/join               # via invite token / id
GET    /api/spaces/:id/members

GET    /api/spaces/:id/channels           # ?kind=channel|dm|group_dm
POST   /api/spaces/:id/channels           # create channel / open dm
GET    /api/spaces/:id/channels/:cid/messages      # history (?limit&before&thread=)
POST   /api/spaces/:id/channels/:cid/messages      # post (?thread=rootId)
PATCH  /api/spaces/:id/channels/:cid/messages/:mid # edit
DELETE /api/spaces/:id/channels/:cid/messages/:mid # soft-delete

GET    /api/spaces/:id/issues             # list/filter (status,assignee,label,type,q)
POST   /api/spaces/:id/issues             # create
GET    /api/spaces/:id/issues/:iid        # detail (+comments)
PATCH  /api/spaces/:id/issues/:iid        # update (status/assignee/estimate/...)
POST   /api/spaces/:id/issues/:iid/comments
POST   /api/spaces/:id/issues/:iid/link   # attach PR/branch ref
POST   /api/spaces/:id/issues/:iid/push   # export from local task  (body: {projectId,taskId})
POST   /api/spaces/:id/issues/:iid/pull   # import to local task

GET    /api/spaces/:id/files              # list
POST   /api/spaces/:id/files              # upload (multipart -> Storage)
GET    /api/spaces/:id/files/:fid         # download / content

GET    /api/spaces/:id/team-members|teams|spells      # list shared configs
POST   /api/spaces/:id/team-members/:x/install        # install locally
POST   /api/spaces/:id/team-members/publish           # publish local -> space

GET    /api/spaces/:id/git/repos          # linked repos
POST   /api/spaces/:id/git/repos          # link a repo (verify remote or clone+link)
GET    /api/spaces/:id/git/prs            # via gh  [5.2]
GET    /api/spaces/:id/git/branches       # via git/gh
```

Server implements this as a `SpaceService` + `IFirestoreGateway` (mints tokens, calls Firestore/Storage REST). Git endpoints **shell out to `gh`/`git`** `[5.2]`.

---

## 7. The `maestro` CLI command surface

Design: **current-space + `--space` override** `[6.1]`; **full read/write as the user** `[6.2]`; **separate namespaces** — `maestro task …` stays local, `maestro space …` targets a space `[6.4]`. All commands take `--json` for agents. Modeled on the Slack CLI/MCP verb set.

### 7.1 Auth & space selection
```
maestro auth status                       # signed-in user (inherited from server) [7.3]
maestro space list [--repo <url>] [--mine|--public]
maestro space use <spaceId|name>          # set current space (persisted)          [6.1]
maestro space current
maestro space info [--space <id>]
maestro space create <name> [--type core|git|personal] [--private] [--repo <url>]
maestro space join <inviteTokenOrId>
maestro space members [--space <id>]
```

### 7.2 Messaging (Slack core)  [2.x]
```
maestro space channel list [--kind channel|dm|group_dm]
maestro space channel create <name> [--private] [--member <uid> ...]
maestro space dm open <uid> [<uid> ...]           # 1:1 or group dm
maestro space message list <channel> [--limit N] [--before <id>] [--thread <rootId>]
maestro space message post <channel> --text "..." [--thread <rootId>] [--file <path> ...]
maestro space message reply <rootMessageId> --text "..."
maestro space message edit <messageId> --text "..."
maestro space message delete <messageId>
```
- `<channel>` accepts `#name`, a channel id, or `@uid` (opens/uses the DM).
- **On-demand read only** — no `watch`/stream in v1 `[2.4]`. No `react`/`search` `[2.2]`.

### 7.3 Issues (Jira core)  [3.x]
```
maestro space issue list [--status ...] [--assignee <uid>] [--label ...] [--type ...] [-q <text>]
maestro space issue get <key|id>
maestro space issue create --title "..." [--type story|bug|task|epic] [--desc ...]
                           [--priority high|medium|low] [--estimate N] [--label ...]
                           [--assignee <uid> ...] [--due <date>] [--parent <key>]
maestro space issue update <key> [--status ...] [--assignee ...] [--estimate N] [--label ...]
maestro space issue comment <key> --text "..."
maestro space issue link <key> --pr <url> | --branch <name>          # [5.1]
maestro space issue board [--status ...]                              # Kanban view (grouped)
# local <-> space linking  [3.4]
maestro space issue push --project <id> --task <taskId> [--issue <key>]   # export/update
maestro space issue pull <key> [--project <id>]                          # import/refresh local
maestro task list --linked                                               # local tasks w/ spaceLink
```

### 7.4 Files / docs  [4.x]
```
maestro space file list [--type markdown|excalidraw|image|pdf|...] [--folder <f>]
maestro space file get <fileId> [--out <path>]
maestro space file upload <path> [--type <t>] [--folder <f>]
maestro space file open <fileId>                 # print markdown / metadata
```

### 7.5 Shared configs (publish → install)  [4.4]
```
maestro space team-member list        | publish <localId> | install <id>
maestro space team list               | publish <localId> | install <id>
maestro space spell list              | publish <localId> | install <id>
```

### 7.6 Git space  [5.x]
```
maestro space git repos                          # linked repos
maestro space git link <githubUrl>               # verify project remote OR clone+link  [5.3]
maestro space git clone <githubUrl> [--into <dir>]
maestro space git pr list [--repo <r>] [--state open|closed]
maestro space git pr view <number> [--repo <r>]
maestro space git branch list [--repo <r>]
```

> Every write verb above works with no extra gating (agents act as the user) `[6.2]`. A later, thin **MCP wrapper** can expose these same commands to external clients `[6.3]`.

---

## 8. Export / import semantics (summary)

| Entity | Export (local → space) | Import (space → local) | Sync |
|---|---|---|---|
| Issue ↔ task | `issue push` create/update | `issue pull` create/refresh | manual both-way snapshot `[3.4]` |
| Team-member / team / spell | `publish` | `install` (copy) | one-time, none `[4.4]` |
| File | `file upload` | `file get` | n/a (download) |

All imports keep a **link** to the source; only issues↔tasks support push-back `[3.4]`.

---

## 9. UI surfaces (structural)  [8.2]

Extend the existing `SpaceWindow` sections (`maestro-ui/src/components/space-window/`). Map:

| Surface | Existing section | Change |
|---|---|---|
| **Chat** (channels, threads, DMs, group DMs) | `MessagesSection` | wire real `MessagingClient`; add DM/group-DM + thread panes; attachments |
| **Board** (Kanban of issues by status) | `TasksSection` → **Issues/Board** | new board view + issue detail modal (rich fields, comments, git refs) |
| **Files** | (new `FilesSection`) | typed list + upload/preview (markdown/excalidraw/image/pdf) |
| **Team-members / Spells / Teams** | `TeamMembersSection`, `SpellsSection`, (+Teams) | publish/install actions |
| **Members** | `MembersSection` | roster + invite link |
| **Git** | (new `GitSection`, git spaces only) | repos, PR list/detail, branches, issue links |
| **Settings** | `SettingsSection` | type, visibility, repos, issue key prefix |

UI stays on the **direct Firestore** path with realtime `[7.2]`; no server round-trips for reads.

---

## 10. Space types & capabilities

A space's `type` (and `repos`) gate which surfaces/commands are available:

| Capability | core | personal | git |
|---|:--:|:--:|:--:|
| channels/messages, issues, files, configs, members | ✓ | ✓ (private, single-owner default) | ✓ |
| repo linking, PRs, branches, issue↔PR links | — | — | ✓ (`repos.length ≥ 1`) `[5.x]` |
| discovery by repo | — | — | ✓ `[8.1]` |

Capabilities are computed from `type`/`repos`; the type registry is extensible for future space types.

---

## 11. Permissions (reuse existing RBAC)

Roles `owner` / `admin` / `member` with the existing Firestore rules `[minor]`. Members create/read all core entities; owners/admins manage members, settings, and destructive ops. Since the server acts **as the user** with a passthrough token, **the same rules apply to CLI/agent writes** — no separate server-side authz to maintain `[7.1]`.

---

## 12. Phased build plan  [8.3]

1. **Foundation** — server↔Firestore gateway (passthrough token, §4), `POST /api/auth/session`, `Space`/entity model + rules updates (optional repo, `repos[]`, `issues`, `files`), CLI auth/space-selection (`auth status`, `space list/use/create/join`).
2. **Messaging** — channels/threads/DMs/group-DMs, attachments; `space channel/message/dm` CLI; wire real `MessagesSection`.
3. **Issues + linking** — `issues` model, Kanban board + detail UI, `space issue …` CLI incl. `push`/`pull` and `spaceLink` on local tasks.
4. **Sharing** — files (Storage), publish/install for team-members/teams/spells; Files/config UI + CLI.
5. **Git space** — repo linking (verify + clone), PR/branch views via `gh`, issue↔PR linking; Git UI + `space git` CLI.

## 13. Non-goals (v1)  [8.4]

Reactions · @mentions · message search · presence · unread state · sprints/backlog (Kanban only) · PR write actions (create/comment/merge) · external MCP server · CLI live streaming/`watch` · notifications · shared multi-user cloud server (local server only; multi-user is the north-star).

## 14. Minor defaults applied

RBAC reuse `owner/admin/member`; issue keys `PREFIX-N` via `space.issueCounter`; auto `#general`; DMs/group-DMs as channels-with-`kind`+`dmKey`; all data under `collabSpaces/{spaceId}/…` (+ Storage `spaces/{id}/files/…`); `SpaceTask` extended into `issues`.

## 15. Appendix — reuse map (branch `fix/auto-save-architecture`)

| Reuse | For |
|---|---|
| `CollabSpaceClient`, `collabSpaceTypes.ts` | Space root, members, roles, discovery |
| `MessagingClient`, `messagingTypes.ts` | channels + messages (extend with `kind`, `attachments`) |
| `SpaceShareClient`, `spaceShareTypes.ts` | publish/install; `SpaceTask` → extend into `Issue` |
| `firestore.rules`, `firestore.indexes.json` | RBAC + repo/member indexes (add issues/files, optional repo) |
| `SpaceWindow` + sections, `useCollabSpaceStore` | UI surfaces (§9) |
| `auth.ts` | UI Firebase login → server session (§4) |
| **New**: `SpaceService` + `IFirestoreGateway` (server), `maestro space …` CLI (§7) | the agent/CLI path |
