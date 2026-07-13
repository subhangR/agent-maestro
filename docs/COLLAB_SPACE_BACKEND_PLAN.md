# Collab Space — end-to-end backend & functionality plan

This document is the design contract for implementing the full backend and
feature wiring of a Collab Space. The UI shell (top tabs, Messages,
Tasks, Team Members, Spells, Members, Settings) is already built against
mock data (see `task_1777449719485_sunttpp4d`). Everything in this doc
replaces those mocks with real Firestore data and end-to-end functionality.

The companion task in Maestro is `task_1777451944260_5frbagq89` ("Collab
Space — end-to-end implementation"). Subtasks track per-entity delivery.

---

## 1. Current state — what already exists

The plumbing for spaces and messaging is already in place. We are *adding*
to a working substrate, not greenfielding.

- `firebase/CollabSpaceClient.ts` — full CRUD for spaces (create, get,
  list, subscribe, join, leave). `create()` provisions a default
  `# general` channel atomically.
- `firebase/MessagingClient.ts` — full CRUD for channels and messages
  (subscribe with pagination cursor, send, edit, soft-delete, hard-delete).
- `firebase/SpaceShareClient.ts` — *write-only* push for tasks /
  teamMembers / spells. No subscribe / pull yet.
- `firestore.rules` — rules for spaces, channels, messages, tasks,
  teamMembers, spells. Owner / member tiers; no admin tier yet.
- `firestore.indexes.json`, `firebase.json`, `.firebaserc` — committed.

What's missing:
- Read/subscribe clients for shared tasks / teamMembers / spells.
- Pull-to-local adapters that materialize space items into local Maestro
  state.
- Settings ops beyond create/leave (rename, visibility flip, delete).
- Membership ops beyond join/leave (invite link, role change, kick,
  admin tier).
- UI sections wired to the above; today they render mock data.

---

## 2. Data model (Firestore)

Top-level collection: `collabSpaces/{spaceId}`. All space-scoped data
lives under that doc as subcollections.

```
collabSpaces/{spaceId}                                     ← space root
├── (doc fields: ownership, members, visibility, github*)
├── channels/{channelId}                                   ← messaging
│   └── messages/{messageId}
├── tasks/{taskId}                                         ← shared tasks
├── teamMembers/{teamMemberId}                             ← shared agents
├── spells/{spellId}                                       ← shared spells
└── invites/{inviteId}                                     ← (NEW) email/link invites
```

### 2.1 Space root doc

Already shipped. No schema changes for v1.

```ts
interface CollabSpace {
  id: string;
  name: string;
  description: string;
  githubUrl: string; githubHost: string; githubOwner: string; githubRepo: string;
  visibility: 'public' | 'private';
  ownerId: string;
  memberIds: string[];                       // for array-contains queries
  members: Record<string, CollabSpaceMember>; // denormalized profile per member
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface CollabSpaceMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
  role: 'owner' | 'admin' | 'member';        // ← admin is new (currently only owner / member exist)
  joinedAt: Timestamp;
}
```

**Schema additions:**
- `members[uid].role` already supports values; we activate the `'admin'`
  value behaviorally (rules + UI). No structural change.

### 2.2 Channels — `channels/{channelId}`

Already shipped. v1 keeps a single channel per space (`# general`,
auto-created). The schema accepts more, but UI does not expose multi-
channel until a later task.

```ts
interface Channel {
  id: string; spaceId: string;
  name: string;                              // unique within space (validated client-side)
  description: string;
  createdBy: string;
  createdAt: Timestamp; updatedAt: Timestamp;
  lastMessageAt: Timestamp | null;           // for "active recently"
  position: number;
  isDefault: boolean;                        // true for the auto-created #general
}
```

### 2.3 Messages — `channels/{channelId}/messages/{messageId}`

Already shipped.

```ts
interface Message {
  id: string; spaceId: string; channelId: string;
  authorUid: string; authorDisplayName: string; authorPhotoUrl: string | null;
  content: string;                           // <= 10 KB enforced by rules
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deletedAt: Timestamp | null;               // soft-delete sentinel
  threadId: string | null;                   // reserved
  replyCount: number;                        // reserved
}
```

### 2.4 Shared tasks — `tasks/{taskId}`

Storage shape is shipped via `SpaceShareClient.shareTask`. The
read/subscribe path is not yet implemented.

```ts
interface SpaceTask {
  id: string; spaceId: string;
  title: string;                             // <= 200 chars enforced by rules
  description: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed';
  priority: 'low' | 'medium' | 'high';
  assigneeUids: string[];                    // optional; may be empty
  parentTaskId: string | null;               // reserved (future hierarchy)
  childrenIds: string[];                     // reserved
  position: number;                          // sortable
  // Provenance
  sourceTaskId: string | null;               // local MaestroTask id if pushed
  sourceProjectId: string | null;            // local project id if pushed
  sourceUserId: string;                      // who pushed it
  // Pull fan-out (for showing "x members pulled this")
  linkedLocalIdsByUid: Record<string, string>; // (NEW) uid → local MaestroTask.id
  pulledByUids: string[];                    // (NEW) for array-contains queries
  // Author / time
  createdBy: string;
  createdAt: Timestamp; updatedAt: Timestamp;
}
```

**Schema additions:**
- `linkedLocalIdsByUid` and `pulledByUids` are new fields on shared task
  docs. Pull-to-local writes one entry per user.

### 2.5 Shared team members — `teamMembers/{teamMemberId}`

Storage shape is shipped. Read/subscribe + adopt are not.

```ts
interface SpaceTeamMember {
  id: string; spaceId: string;
  name: string;                              // display name (e.g. "Reviewer")
  role: string;                              // free-form short label
  identity: string;                          // full prompt
  avatar: string | null;                     // reserved
  model: string | null;                      // model id
  agentTool: string | null;
  mode: 'worker' | 'coordinator' | 'coordinated-worker' | 'coordinated-coordinator' | null;
  skillIds: string[];                        // skills bundled with this persona
  commandPermissions: { groups?: Record<string, boolean>; commands?: Record<string, boolean> };
  // Provenance
  sourceTeamMemberId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string;
  // Adoption fan-out
  adoptedByUids: string[];                   // (NEW)
  adoptionCount: number;                     // (NEW) cached size of adoptedByUids
  // Author / time
  createdBy: string;
  createdAt: Timestamp; updatedAt: Timestamp;
}
```

### 2.6 Shared spells — `spells/{spellId}`

```ts
interface SpaceSpell {
  id: string; spaceId: string;
  name: string;                              // unique-per-space (rules-enforced via tx)
  description: string;
  body: string;                              // <= 50 KB
  entityType: 'session' | 'task' | 'team-member' | 'skill' | 'spell' | string;
  icon: string | null;
  // Provenance
  sourceSpellId: string | null;
  sourceUserId: string;
  // Install fan-out
  installedByUids: string[];                 // (NEW)
  installCount: number;                      // (NEW)
  // Author / time
  createdBy: string;
  createdAt: Timestamp; updatedAt: Timestamp;
}
```

### 2.7 Invites — `invites/{inviteId}` *(new collection)*

For email invites against private spaces and time-bounded link tokens.

```ts
interface SpaceInvite {
  id: string; spaceId: string;
  kind: 'link' | 'email';
  // For 'email' invites:
  email: string | null;
  // For 'link' invites:
  token: string;                             // random; embedded in URL
  // Optional limits
  maxUses: number | null;                    // null = unlimited
  uses: number;                              // server-incremented on accept
  expiresAt: Timestamp | null;
  // Audit
  createdBy: string;
  createdAt: Timestamp;
  revokedAt: Timestamp | null;
}
```

A v1 implementation can stub the `invites` collection if we keep invite
links derived from `spaceId` only (no token). That trades security for
shipping speed; recommended only for *public* spaces in v1.

---

## 3. Membership & roles

Three tiers:

| Role | Can read | Can write entities | Can manage members | Can settings |
|---|---|---|---|---|
| `owner` | yes | yes (and force-edit any) | yes (incl. transfer ownership) | yes (incl. delete) |
| `admin` | yes | yes (and force-edit other members') | yes (cannot demote owner) | yes (cannot delete) |
| `member` | yes | yes (own entities only) | no | no (rename name, etc.) |

Invariants (enforced by Firestore rules):
- `members[uid].role` is mutable only by an owner or admin.
- An owner cannot be demoted or removed except by a transfer-ownership
  flow (deferred to v2 — for v1 we block the operation).
- When the last admin/owner leaves, the space goes into "orphaned" state
  (allowed in v1; cleanup is a future task).

---

## 4. Per-entity work

Each subsection lists: client API to add, UI swap, rules touchups, and
acceptance criteria.

### 4.1 Messages

**Status:** client (`MessagingClient`) + rules already shipped. Only UI
wiring remains.

**UI swap** — `sections/MessagesSection.tsx`:
- Replace `MOCK_MESSAGES` and the local `useState` array with
  `MessagingClient.subscribeToMessages(spaceId, channelId, ...)`.
- Resolve `channelId` by listing channels and picking the first
  (or `where isDefault == true`).
- Wire composer to `MessagingClient.sendMessage`.
- Wire bubble edit/delete affordances (already on `MessageBubble.tsx` —
  reuse it instead of the mock bubble in `MessagesSection`).
- Pagination: implement scroll-to-top → `loadOlderMessages` (already
  exposed by the client).
- Pending/optimistic state: reuse `useMessagingStore` (already exists)
  rather than the mock array.

**Rules:** none.

**Indexes:** `messages` ordered by `createdAt DESC` is already an
auto-built single-field index — no composite needed.

**Acceptance:**
- Two browsers open the same space → typing in one shows up in the other
  in <500ms.
- Edit, soft-delete, hard-delete each round-trip.
- Pagination loads older messages without duplicates.

### 4.2 Tasks

**Status:** push exists (`shareTask`). Subscribe + pull are missing.

**Client additions** — `firebase/SpaceTasksClient.ts` *(new)*:
```ts
export const SpaceTasksClient = {
  subscribe(spaceId: string, cb: (tasks: SpaceTask[]) => void): Unsubscribe;
  update(spaceId: string, taskId: string, patch: Partial<SpaceTask>): Promise<void>;
  delete(spaceId: string, taskId: string): Promise<void>;
  recordPull(spaceId: string, taskId: string, uid: string, localTaskId: string): Promise<void>;
};
```

**Pull adapter** — `firebase/SpaceTaskAdapter.ts` *(new)*:
```ts
materializeToLocal(spaceTask: SpaceTask, projectId: string): Promise<MaestroTask>
```
- Calls the local Maestro server's `POST /api/tasks` to create a
  `MaestroTask` with title/description/status/priority copied over.
- Stamps `metadata.spaceTaskId = spaceTask.id` so the local task can be
  shown with an "Adopted from space" badge.
- After success, calls `SpaceTasksClient.recordPull(...)` to update the
  shared doc's `linkedLocalIdsByUid[user.uid]` and `pulledByUids`.

**UI swap** — `sections/TasksSection.tsx`:
- Replace `MOCK_TASKS` with `SpaceTasksClient.subscribe`.
- "+ Push from local": query the local Maestro server for tasks in the
  active project, render in the existing `PushTaskModal`, on submit call
  `SpaceShareClient.shareTask` for each selected.
- Per-row "Pull to local": resolve active project, call the adapter,
  show a toast on completion.
- "Pulled by you" / "Pulled" badge derived from
  `linkedLocalIdsByUid[user.uid]`.
- Delete / edit gated by `createdBy === user.uid || space.role in {owner,admin}`.

**Rules touchups:**
- Add a check on `update` so non-creators can only modify a whitelist of
  fields (currently they can modify anything if owner). Specifically:
  members may bump `linkedLocalIdsByUid[user.uid]` and append themselves
  to `pulledByUids`, nothing else.
  ```
  // rough sketch
  allow update: if isSpaceMember(spaceId)
    && (request.auth.uid == resource.data.createdBy
        || isSpaceOwnerOrAdmin(spaceId)
        || onlyTouchedFields(['linkedLocalIdsByUid', 'pulledByUids', 'updatedAt']));
  ```

**Indexes:**
- Composite: `tasks` `(spaceId, createdAt desc)` — needed if listing
  cross-space (we don't, since subscribe is scoped under
  `collabSpaces/{spaceId}/tasks`, no composite needed).

**Acceptance:**
- Pushing a local task in browser A surfaces in browser B's tasks list
  within 500ms.
- "Pull to local" on member B creates a real `MaestroTask` in their
  active project; the shared task shows pulledByCount=1.
- Member can't delete another member's shared task; owner/admin can.

### 4.3 Team Members

**Status:** push exists (`shareTeamMember`). Subscribe + adopt are missing.

**Client additions** — `firebase/SpaceTeamMembersClient.ts` *(new)*:
```ts
subscribe(spaceId, cb): Unsubscribe
update(spaceId, tmId, patch): Promise<void>
delete(spaceId, tmId): Promise<void>
recordAdopt(spaceId, tmId, uid): Promise<void>
```

**Adopt adapter** — `firebase/SpaceTeamMemberAdapter.ts` *(new)*:
- Calls the local Maestro server to create a `TeamMember` with
  identity/model/agentTool/mode/commandPermissions copied.
- Stamps `metadata.spaceTeamMemberId = sourceId` for the badge.
- Calls `recordAdopt` to bump server-side counters.

**UI swap** — `sections/TeamMembersSection.tsx`:
- Replace `MOCK_TEAM` with subscription.
- "+ Publish from local" → query local team members in active project →
  on submit call `SpaceShareClient.shareTeamMember`.
- "Adopt locally" → adapter call.
- "Fork" stays a stub for v1.

**Rules touchups:** mirror the tasks rule (only-creator / owner / admin
can fully edit; members may only bump `adoptedByUids` / `adoptionCount`).

**Acceptance:**
- Publishing in A shows up in B; adopt creates a real local team member
  in B's active project.

### 4.4 Spells

**Status:** push exists (`shareSpell`). Subscribe + install + name
conflict UX are missing.

**Client additions** — `firebase/SpaceSpellsClient.ts` *(new)*:
```ts
subscribe(spaceId, cb): Unsubscribe
update(spaceId, spellId, patch): Promise<void>
delete(spaceId, spellId): Promise<void>
recordInstall(spaceId, spellId, uid): Promise<void>
```

**Install adapter** — `firebase/SpaceSpellAdapter.ts` *(new)*:
- Calls the local Maestro server to create a `Spell` in the *global*
  scope (not project-scoped) since spells are workflow-level.
- On name collision: surface the existing `Replace / Rename / Cancel`
  prompt (UI in section).
- Stamps `metadata.spaceSpellId` for the badge.

**UI swap** — `sections/SpellsSection.tsx`:
- Replace `MOCK_SPELLS` with subscription.
- "+ Publish from local" → search global spells, select, push.
- "Install" → adapter; conflict modal as needed.
- "Preview" already toggles inline body (no change).

**Rules touchups:** same pattern as tasks.

**Acceptance:**
- Publish/install round-trips. Install handles same-name conflict.

### 4.5 Members

**Status:** join/leave shipped. Invite and role management are missing.

**Client additions** — extend `CollabSpaceClient`:
```ts
createInviteLink(spaceId, opts?: { expiresInDays?: number; maxUses?: number }): Promise<string>
revokeInvite(spaceId, inviteId): Promise<void>
acceptInvite(token: string, user: User): Promise<{ spaceId: string }>
sendEmailInvite(spaceId, email): Promise<void>      // v1 stub: writes to invites/, no email send
setMemberRole(spaceId, targetUid, role: 'admin' | 'member'): Promise<void>
removeMember(spaceId, targetUid): Promise<void>
```

**UI swap** — `sections/MembersSection.tsx`:
- Replace `MOCK_MEMBERS` with `space.members` from the live space doc.
- Group by `role` + `joinedAt` recency (presence stays mocked in v1).
- Three-dot menu: implement *Make admin* and *Remove* (gated on viewer
  role). *Send DM* stays disabled.
- "+ Invite" → open `InviteMemberModal`. v1 path:
  - Public space: derive a link from `spaceId` (no token), copy.
  - Private space: surface email field; on submit, call
    `sendEmailInvite` (v1 stub that just writes a doc; no SMTP).

**Rules touchups:**
- Add: an owner or admin can patch `members[uid].role` and remove from
  `memberIds` for a non-owner uid.
- Add: an admin cannot demote owner.

**Acceptance:**
- Owner makes member B an admin → B can now see the role-management
  menu items.
- Owner kicks B → B's `SpaceWindow` flips to `not-member` empty state in
  realtime.

### 4.6 Settings

**Status:** UI exists; nothing is wired to writes.

**Client additions** — extend `CollabSpaceClient`:
```ts
update(spaceId, patch: Partial<Pick<CollabSpace, 'name' | 'description' | 'visibility'>>): Promise<void>
delete(spaceId): Promise<void>            // owner only; cascades subcollections via Cloud Function
```

**UI swap** — `sections/SettingsSection.tsx`:
- "Save changes" → `update`.
- "Discard" already wired (resets to space props).
- "Copy invite link" already wired (uses `navigator.clipboard`).
- "Leave" → `CollabSpaceClient.leave`.
- "Delete" → confirmation modal → `CollabSpaceClient.delete`. v1 can
  delete the root doc only and let a Cloud Function clean up
  subcollections, OR walk subcollections client-side in a batch (slower
  but ships without a function).

**Rules touchups:** none beyond what already exists; verify the
update-affected-keys rule still allows `name | description | visibility |
updatedAt`.

**Acceptance:**
- Renaming in A propagates to B's chrome and rail.
- Flipping public→private hides the space from non-members'
  `subscribeToRepo.public` query.

---

## 5. Push / Pull semantics (cross-cutting)

A single mental model used by tasks / team members / spells.

### 5.1 Push (local → space)
1. UI shows a picker scoped to the active local project (tasks /
   teamMembers) or to the global scope (spells).
2. Submit calls the corresponding `SpaceShareClient.share*` method.
3. Server-stamped `createdBy` and timestamps land via `serverTimestamp()`.
4. Subscribers in the section receive the new doc within ~500ms.

### 5.2 Pull (space → local)
1. UI button calls `*Adapter.materializeToLocal(...)`.
2. Adapter resolves the destination — for tasks/teamMembers, the user's
   active local project; for spells, the global scope.
3. Adapter creates the local entity via the local Maestro server's REST
   API; on success, stamps `metadata.spaceXxxId = sourceId`.
4. Adapter calls `recordPull` / `recordAdopt` / `recordInstall` to update
   the shared doc's fan-out fields, which causes other subscribers to
   re-render the badge.

### 5.3 Sync direction
- v1 is **one-way** at pull-time. After a pull, the local copy is its
  own thing; further upstream edits do not stream back.
- The UI shows "Re-pull to refresh" on space items the user has already
  pulled, so they can manually pick up upstream changes.

### 5.4 Conflict UX
- Tasks / team members: name collisions allowed (we display the source
  user, so duplicates are clear). No conflict UX.
- Spells: a spell-name conflict in the global library is meaningful
  (slash-command name). On install, prompt **Replace / Rename / Cancel**.

---

## 6. Firestore rules — required changes

(See `firestore.rules` for current state.)

1. **Admin tier**:
   ```
   function isSpaceAdminOrOwner(spaceId) {
     return isSignedIn()
       && (
         request.auth.uid == get(...).data.ownerId ||
         get(...).data.members[request.auth.uid].role == 'admin'
       );
   }
   ```

2. **Tighten task / teamMember / spell update rules** so non-creators can
   only patch the fan-out fields:
   ```
   allow update: if isSpaceMember(spaceId) && (
     request.auth.uid == resource.data.createdBy
     || isSpaceAdminOrOwner(spaceId)
     || request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['linkedLocalIdsByUid', 'pulledByUids',
                  'adoptedByUids', 'adoptionCount',
                  'installedByUids', 'installCount',
                  'updatedAt'])
   );
   ```

3. **Member role / kick**:
   ```
   // Owner/admin can patch members[<targetUid>].role and remove from memberIds.
   // Owner cannot be demoted.
   ```

4. **Invites collection**:
   ```
   match /collabSpaces/{spaceId}/invites/{inviteId} {
     allow read, create, update, delete: if isSpaceAdminOrOwner(spaceId);
   }
   ```
   `acceptInvite` can be implemented either via a Cloud Function (clean)
   or via a special rule that allows a non-member to update
   `memberIds` if they present the right token (more complex).
   Recommendation: ship with **Cloud Function** for invite acceptance.

---

## 7. Indexes

Most queries are scoped under `collabSpaces/{spaceId}/...`, which means
single-field indexes suffice. Composite indexes we will likely need:

- `collabSpaces` `(memberIds array-contains, githubUrl ==, createdAt desc)`
  — already covered by existing logic since we skip `orderBy` on the
  cross-repo query.
- `collabSpaces/{spaceId}/messages` `(channelId ==, createdAt desc)` —
  N/A because messages already live under
  `collabSpaces/{spaceId}/channels/{channelId}/messages`.

If subscribe queries on tasks/teamMembers/spells need an `orderBy` other
than `createdAt`, add the index here. v1 default ordering: `createdAt desc`
(no composite needed under a single subcollection).

---

## 8. Phased delivery plan (subtasks)

Subtasks under `task_1777451944260_5frbagq89`:

1. **Tasks: subscribe client + render real list** — `SpaceTasksClient` +
   wire `TasksSection` to subscription. Push modal stays mock at this
   step.
2. **Tasks: push from local** — wire push modal to `SpaceShareClient`
   using local Maestro server's task list.
3. **Tasks: pull to local** — adapter that creates a `MaestroTask` and
   updates fan-out fields.
4. **Team Members: subscribe + render**
5. **Team Members: publish from local**
6. **Team Members: adopt locally**
7. **Spells: subscribe + render**
8. **Spells: publish from local + name conflict**
9. **Spells: install locally**
10. **Messages: wire `MessagesSection` to `MessagingClient`** —
    subscribe, send, edit, soft-delete, pagination, optimistic state.
11. **Members: realtime member list + invite link copy + role menu wiring**
12. **Members: email invite via Cloud Function (or stub doc write in v1)**
13. **Settings: rename / visibility / description save** + leave + delete
14. **Rules: admin tier, tighten share entity updates, invites collection**
15. **Smoke test: two-browser end-to-end run-through of every surface**

Subtasks 1–9 can ship in parallel-ish since they are per-entity. 10 is
independent. 11–13 share the space root doc; do them sequentially. 14
gates 11 and 12. 15 closes the parent.

---

## 9. Acceptance criteria for the parent task

- A user creates a space → sees the default `# general` channel and is
  the sole member.
- They invite a second user; that user joins; both see each other in
  Members tab in realtime.
- Both users can chat in `# general` and the messages stream/edit/
  soft-delete in realtime, with pagination loading older history.
- User A pushes a task from local → user B pulls it → user B has a
  matching local `MaestroTask` and the shared task shows pulledBy=1.
- User A publishes a team member → user B adopts → user B has a matching
  local `TeamMember`.
- User A publishes a spell → user B installs → name collision is handled.
- User A (owner) renames the space → both users see the new name.
- User A makes user B an admin → user B can now see Manage in member
  menus.
- User A kicks user C → user C immediately sees the not-member empty
  state.
- User A flips public→private → the space disappears from non-members'
  public lists.
- User A deletes the space → space and subcollections gone; member B
  sees the missing-space empty state.
- Firestore rules pass an emulator unit-test pass for: member-only read,
  creator-only edit, owner/admin elevated edit, fan-out-field patches by
  non-creators, and invite acceptance.

---

## 10. Out of scope

Defer to follow-up tasks:
- Realtime presence (RTDB or presence subcollection)
- Threads, reactions, mentions, attachments
- Cross-project task push (push from any local project; v1 = active only)
- Auto-sync of pulled tasks (push-on-update)
- Spell categories / tags / search facets
- DMs
- Multi-window (open a space in its own Tauri window)
- Transfer ownership flow
- Audit log
- Email-send via SMTP (v1 records the invite doc; SMTP is a Cloud
  Function task)
- GitHub avatar import for members
