# Entity Push/Pull: Tasks & Team Members between Local Maestro and Collab Spaces

Plan for sharing **tasks** and **team members** between a user's local Maestro project and a Collab Space. Same explicit-copy model used for spaces themselves: independent entities linked by provenance, never live mirrors.

This is the **third** collab pillar:
1. ✅ Spaces (browse, create, join — done)
2. 🚧 Messaging (`task_1777443179374_wiyrjhfrw`)
3. 🚧 Per-Space rail icons + Full-Window layout (`task_1777443525579_xvxw2qhds`)
4. 🆕 **This task** — Tasks & Team Members push/pull

---

## Decisions (locked, easy to revisit)

| # | Question | Decision |
|---|---|---|
| 1 | Re-share semantics | **Detect provenance and offer choice**. If the local task already has a SpaceTask in this space, modal asks: "Update existing" vs "Create new". |
| 2 | Hierarchy on push | **Preserve hierarchy** — push the subtree, remap ids. |
| 3 | Status & assignee on copy | **Reset status to `todo`, strip assignees**. Provenance preserves the trail. |
| 4 | Team member fields on copy | **Copy everything**: model, agentTool, mode, identity, skillIds, commandPermissions. Missing skills flagged in UI but not blocking. |
| 5 | Drag-and-drop in v1 | **Defer**. Hover + modal first. DnD onto rail icons is a phase-C polish layer. |

---

## 1. Mental Model

```
   Local Maestro                       Collab Space
  ┌────────────┐                      ┌──────────────┐
  │ Task X     │ ── push ──> SpaceTask│ X' (sourceX) │
  │ TM Y       │ ── push ──> SpaceTM  │ Y' (sourceY) │
  └────────────┘                      └──────────────┘
        ▲                                   │
        │                                   │
        └────────── pull / copy ────────────┘
        (creates fresh local entity with originSpaceTaskId / originSpaceTeamMemberId)
```

After fork, both sides edit independently. No conflict resolution. No cascading deletes.

---

## 2. Data Model

### `collabSpaces/{spaceId}/tasks/{taskId}` (new)

```ts
interface SpaceTask {
  id: string;
  spaceId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled' | 'blocked';
  priority: 'high' | 'medium' | 'low';
  assigneeUids: string[];          // Space members
  parentTaskId: string | null;     // for hierarchy in the Space
  childrenIds: string[];           // denormalized
  position: number;

  // Provenance: where it came from (if pushed)
  sourceTaskId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string | null;     // pusher's uid

  createdBy: string;               // uid (could differ from sourceUserId after fork)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `collabSpaces/{spaceId}/teamMembers/{tmId}` (new)

```ts
interface SpaceTeamMember {
  id: string;
  spaceId: string;
  name: string;
  role: string;
  identity: string;
  avatar: string | null;
  model: string | null;
  agentTool: string | null;
  mode: string | null;
  skillIds: string[];              // raw ids, may not exist in puller's local
  commandPermissions: { groups?: Record<string, boolean>; commands?: Record<string, boolean> };

  sourceTeamMemberId: string | null;
  sourceProjectId: string | null;
  sourceUserId: string | null;

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Local-side additions

Extend the existing `Task` and `TeamMember` types (in `maestro-server/src/types.ts` and the UI's mirror types) with **nullable provenance fields**:

```ts
// Task
originSpaceId?: string | null;
originSpaceTaskId?: string | null;
originUserId?: string | null;

// TeamMember
originSpaceId?: string | null;
originSpaceTeamMemberId?: string | null;
originUserId?: string | null;
```

Plus a **forward-link** structure for tracking pushes:

```ts
// Task / TeamMember
sharedTo?: Array<{
  spaceId: string;
  spaceEntityId: string;
  sharedAt: number;
  sharedByUid: string;
}>;
```

Backwards-compatible — all nullable / optional.

---

## 3. Security Rules (additions to `firestore.rules`)

```
match /collabSpaces/{spaceId}/tasks/{taskId} {
  allow read: if isSpaceMember(spaceId);
  allow create: if isSpaceMember(spaceId)
    && request.resource.data.spaceId == spaceId
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.title is string
    && request.resource.data.title.size() > 0;
  allow update: if isSpaceMember(spaceId)
    && (request.auth.uid == resource.data.createdBy || isSpaceOwner(spaceId));
  allow delete: if request.auth.uid == resource.data.createdBy
    || isSpaceOwner(spaceId);
}

match /collabSpaces/{spaceId}/teamMembers/{tmId} {
  allow read: if isSpaceMember(spaceId);
  allow create: if isSpaceMember(spaceId)
    && request.resource.data.spaceId == spaceId
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.name is string
    && request.resource.data.name.size() > 0;
  allow update: if isSpaceMember(spaceId)
    && (request.auth.uid == resource.data.createdBy || isSpaceOwner(spaceId));
  allow delete: if request.auth.uid == resource.data.createdBy
    || isSpaceOwner(spaceId);
}
```

---

## 4. Indexes

Both subcollections within a single space → **single-field auto-indexed** by Firestore.

For querying "tasks in this space" sorted by `position` then `createdAt`: composite needed if both used. v1: just `position` ASC, single-field.

---

## 5. UI Surfaces

### Generic shared modals

```
maestro-ui/src/components/share/
├── ShareToSpaceModal.tsx        push: pick Space + (if re-share) "update existing / new"
├── CopyToProjectModal.tsx       pull: pick local project + optional parent task + rename
├── ProvenanceBadge.tsx          inline indicator on rows
└── shareCommon.ts               types + helpers
```

Both modals are **generic over entity type**: take `{ kind: 'task' | 'teamMember', payload }`.

### Trigger placements

**Local Task** (push entry points):
- Hover action on `TaskListItem.tsx` — small ↑ icon
- Inside task detail overlay — "Share to Space" item
- Bulk: `ExecutionBar` gets a "Share to Space" mode for multi-select

**Local Team Member** (push):
- Hover action on `TeamMemberCard` / row
- Inside team member modal — "Share to Space" item

**Space Task / Space Team Member** (pull):
- Hover action on Space entity row — small ↓ icon → "Copy to my project"
- Inside Space entity detail view (when we build one)

### Provenance badge

Placed inline next to the entity title. States:

| State | Visual | Tooltip |
|---|---|---|
| Pushed to N spaces | `↑ N` | "Shared to: Backend Squad, Design" |
| Pulled from a Space | `↓` | "Copied from Backend Squad — by Manzil" |
| Both | `⇅ N` | combined |

Click → small popover with: list of linked entities, "Open in Space" / "Open source", **unlink** action (clears provenance, doesn't delete).

### SpaceWindow integration (depends on rail+window task)

The Space window's right column gets two sections:

```
┌─ Members ────────┐
│ ● Subhang        │
│ ● Manzil         │
│ + invite         │
├──────────────────┤
│ Space Tasks      │
│ ▸ #1 Improve...  │
│ ▸ #2 Refactor... │
│ + Push from local│
├──────────────────┤
│ Space Team       │
│ • Backend Engr   │
│ • Reviewer       │
│ + Push from local│
└──────────────────┘
```

For now (until rail+window lands), these mount inside the existing `CollabSpaceDetail.tsx` "Tasks" tab as a tabbed inner view. Migration to `SpaceWindow` is mechanical — same components.

---

## 6. State + Clients

### Clients

```
maestro-ui/src/firebase/
├── SpaceTasksClient.ts         CRUD + subscriptions for collabSpaces/{id}/tasks
├── SpaceTeamMembersClient.ts   same for teamMembers
├── spaceEntityTypes.ts         SpaceTask + SpaceTeamMember types
```

### Stores

```
maestro-ui/src/stores/
├── useSpaceTasksStore.ts        per-space subscriptions, push/pull actions
├── useSpaceTeamMembersStore.ts  same
```

State shape (one per entity type):

```ts
interface SpaceTasksState {
  tasksBySpace: Record<spaceId, SpaceTask[]>;
  loading: Record<spaceId, boolean>;
  subs: Record<spaceId, Unsubscribe>;

  subscribeForSpace(spaceId): void;
  unsubscribeForSpace(spaceId): void;

  pushFromLocal(args: { localTask, spaceId, includeChildren }): Promise<SpaceTask>;
  rePush(args): Promise<SpaceTask>;            // updates existing
  copyToLocal(args: { spaceTaskId, projectId, parentTaskId? }): Promise<MaestroTask>;
  delete(spaceId, taskId): Promise<void>;
}
```

### Push flow (tasks)

1. User clicks "Share to Space" on local Task X.
2. Modal: pick space (auto-pick if only one linked space exists for the project's repo); checkbox "Include subtasks" if X has children; if any existing SpaceTask has `sourceTaskId == X.id`, surface "You've shared this before — Update existing or Create new?".
3. On submit: client builds the entity payload, walks subtree if requested, writes a Firestore batch (parent + children), assigns Space-side ids, remaps `parentTaskId`/`childrenIds`.
4. Local task updated: append to `task.sharedTo[]` with the new Space entity id. (This is a server write — needs a small `task.update()` call.)
5. Modal closes; if user is currently viewing the Space, auto-scroll to the new entry.

### Pull flow (tasks)

1. User clicks "Copy to my project" on Space Task X'.
2. Modal: pick local project (default = currently active if linked, else first linked); optional parent task (browse local tree); "Reset status to todo" checkbox (default on); "Strip assignees" (default on); rename input.
3. On submit: server creates local Task with `originSpaceId`, `originSpaceTaskId`, `originUserId` filled. Walks the Space task's children if "Include subtasks" checked.
4. Modal closes; navigate to the new local task.

### Team member flows

Symmetric. One added wrinkle: **skill resolution on pull**. The Space TM has `skillIds[]` — these are raw ids that may or may not exist in the puller's local skill set.

Strategy: on pull, the modal shows resolved skills + a "missing in your project" list. Pull proceeds; missing skills are stored on the local TM as-is (server tolerates unknown ids — confirmed in current loader). UI shows a small warning chip on the team member card.

---

## 7. Server-Side Changes

Nothing for Firestore (all from UI). But:

- **Local types**: add provenance fields to `Task` and `TeamMember` in `maestro-server/src/types.ts` + UI's `maestro.ts` mirror.
- **Validation**: extend `validation.ts` Zod schemas to accept (and ignore-as-trusted) the new fields.
- **No domain logic change**: provenance fields are pure metadata; no service behavior gates on them.

---

## 8. Acceptance Criteria

### Tasks (phase A)
- [ ] "Share to Space" action visible on every local task (hover and detail).
- [ ] Pushing a task creates a SpaceTask doc in real-time visible to other Space members.
- [ ] Pushing a task with children offers "Include subtasks" → preserves hierarchy.
- [ ] Re-pushing an already-shared task offers "Update existing" or "Create new".
- [ ] "Copy to my project" creates a local Task with status reset to `todo` and assignees stripped.
- [ ] Provenance badge appears on shared local tasks (↑) and copied local tasks (↓).
- [ ] Click provenance badge → popover with source/target details.
- [ ] Bulk share via ExecutionBar multi-select works.
- [ ] Permissions enforced: members create, creator/owner edit/delete (verified by rules).

### Team members (phase B)
- [ ] Same flow for team members on `TeamMemberCard` and detail modal.
- [ ] Pull preserves model, agentTool, mode, identity, commandPermissions.
- [ ] Missing skills surfaced as a warning, not blocking.
- [ ] Provenance badge on shared / copied team members.

---

## 9. Phased Plan (subtask sequence)

| # | Subtask | Depends on |
|---|---|---|
| 1 | Schema + rules + provenance types (Task, TM, SpaceTask, SpaceTeamMember) | — |
| 2 | `SpaceTasksClient`, `useSpaceTasksStore`, `subscribeForSpace` | 1 |
| 3 | `ShareToSpaceModal` + `CopyToProjectModal` (generic, task-only first) | 2 |
| 4 | Task push: hover action + detail menu, modal wiring, multi-share/upsert | 3 |
| 5 | Task pull: hover action + modal wiring, status/assignee reset | 3 |
| 6 | Provenance badge component + integration on task rows | 4, 5 |
| 7 | Bulk push via `ExecutionBar` | 4 |
| 8 | Space tasks list mount in `CollabSpaceDetail` Tasks tab (placeholder → real) | 2 |
| 9 | `SpaceTeamMembersClient`, `useSpaceTeamMembersStore` | — |
| 10 | Team member push (modal reuse) | 3, 9 |
| 11 | Team member pull, skill warning UI | 9 |
| 12 | Provenance badge on team members | 10, 11 |
| 13 | Migration to `SpaceWindow` right column (post rail+window task) | rail+window task |

Phases A=1–8, B=9–12, C=13. PRs roughly group as A1 (1–3 schema+modals), A2 (4–6 task UX), A3 (7–8 polish), B (9–12), C (13 reorg).

---

## 10. Out of Scope (deferred)

- Drag-and-drop onto rail icons (phase-C polish, separate task)
- Share-as-message (drop entity into composer → attaches card + creates SpaceTask) — depends on messaging task; separate follow-up
- Task graphs / task lists push-pull
- Task docs / file content sync (needs Firebase Storage)
- Live-sync mode (continuous mirror) — deliberately not in scope
- Auto-pull notifications ("a new task appeared in Space X")
- Permissions tiers beyond creator/owner/member

---

## 11. File Inventory

**New:**
- `maestro-ui/src/firebase/SpaceTasksClient.ts`
- `maestro-ui/src/firebase/SpaceTeamMembersClient.ts`
- `maestro-ui/src/firebase/spaceEntityTypes.ts`
- `maestro-ui/src/stores/useSpaceTasksStore.ts`
- `maestro-ui/src/stores/useSpaceTeamMembersStore.ts`
- `maestro-ui/src/components/share/ShareToSpaceModal.tsx`
- `maestro-ui/src/components/share/CopyToProjectModal.tsx`
- `maestro-ui/src/components/share/ProvenanceBadge.tsx`
- `maestro-ui/src/components/share/shareCommon.ts`
- `maestro-ui/src/styles-share.css`

**Modified:**
- `firestore.rules` — add task/teamMember subcollection rules
- `maestro-server/src/types.ts` — add provenance fields to Task + TeamMember
- `maestro-server/src/api/validation.ts` — accept provenance fields
- `maestro-ui/src/app/types/maestro.ts` — mirror provenance fields
- `maestro-ui/src/components/maestro/TaskListItem.tsx` — share action + badge
- `maestro-ui/src/components/maestro/TeamMemberCard.tsx` (or equivalent) — share action + badge
- `maestro-ui/src/components/maestro/ExecutionBar.tsx` — multi-share mode
- `maestro-ui/src/components/maestro/CollabSpaceDetail.tsx` — Tasks tab content (until SpaceWindow lands)
- `maestro-ui/src/styles.css` — `@import './styles-share.css';`
