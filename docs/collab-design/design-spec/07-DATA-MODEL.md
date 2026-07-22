# 07 — Data Model (design-relevant)

Only the parts that shape the UI: what entities exist, the fields a screen shows, relationships, and who-can-do-what (permissions drive which controls appear). Storage is Firebase (Firestore) with realtime subscriptions; you don't need Firebase details to design — just the shapes and rules below.

## Entity map
```
User (Firebase account)
  └─ member of → CollabSpace (scoped to a GitHub repo)
                   ├─ members: { uid → {role, name, email, photo, joinedAt} }
                   ├─ channels[]
                   │    └─ messages[]  (edit / soft-delete; threads*, reactions*, mentions*)
                   ├─ tasks[]          (shared, with provenance + pull fan-out)
                   ├─ teamMembers[]    (shared agent personas + adoption fan-out)
                   ├─ spells[]         (shared spells + install fan-out)
                   └─ invites[] / joinRequests[]   (* future)
```
`*` = full-vision fields.

## User / member
A person authenticated via Firebase (Google or email/password). Inside a space they're a **member**:
- `uid`, `displayName`, `email`, `photoUrl`, `role` (**owner | admin | member**), `joinedAt`
- `[VISION]`: `timezone`, `bio`, `statusEmoji`, `statusText`, presence (online/idle/offline)
- **Agents** are members too `[VISION]`: same shape, marked as an agent, presence = "session alive."

## CollabSpace
- `id`, `name`, `description`, `visibility` (**public | private**)
- Repo scoping: `githubUrl` (canonical `github.com/owner/repo`), plus host/owner/repo parts
- `ownerId`, `memberIds[]`, `members{}` (denormalized member details), `createdAt/updatedAt`
- **UI implication:** discovery lists match on `githubUrl`; public spaces are visible and joinable by any signed-in Maestro user. GitHub repository membership is not verified. Private spaces are visible only to members.

## Channel
- `id`, `spaceId`, `name` (kebab-case, ≤64), `description`, `isDefault` (one `#general`), `position` (order), `lastMessageAt`, `createdBy`
- `[VISION]` `kind`: **channel | dm | group_dm** (DMs reuse this entity; DM `memberIds` = the participants)

## Message
- `id`, `spaceId`, `channelId`, `authorUid`, `authorDisplayName`, `authorPhotoUrl`, `content` (≤10,000), `createdAt`, `editedAt` (nullable → "(edited)"), `deletedAt` (nullable → "[deleted]")
- Reserved/future: `threadId`, `replyCount` (threads); `reactions[]`; `mentions[]` (incl. `@agent`)

## Shared Task (SpaceTask)
- Content: `title` (≤200), `description`, `status` (todo | in_progress | in_review | blocked | completed | cancelled), `priority` (high|medium|low), `assigneeUids[]`, task hierarchy (`parentTaskId`, `childrenIds`)
- **Provenance:** `sourceTaskId`, `sourceProjectId`, `sourceUserId` (who/where it came from)
- **Pull fan-out:** `pulledByUids[]`, `linkedLocalIdsByUid{}` (drives "Pulled by N" + your "✓ Pulled")
- `createdBy`, `createdAt/updatedAt`

## Shared Team Member (SpaceTeamMember)
- `name` (≤120), `role`, `identity` (the prompt — shown in expanded row), `avatar`, `model`, `agentTool`, `mode`, `skillIds[]`, `commandPermissions{}` (→ permission pills)
- **Provenance:** `sourceTeamMemberId`, `sourceProjectId`, `sourceUserId`
- **Adoption fan-out:** `adoptedByUids[]`, `adoptionCount` (→ "↑ N", "✓ Adopted")

## Shared Spell (SpaceSpell)
- `name` (≤120), `description`, `body` (shown in Preview), `entityType` (→ target pills), `icon`
- **Provenance:** `sourceSpellId`, `sourceUserId`
- **Install fan-out:** `installedByUids[]`, `installCount` (→ "↑ N", "✓ Installed")

## Invites & requests `[VISION]`
- **SpaceInvite:** `kind` (link | email), `email?`, `token?`, `maxUses?`, `uses`, `expiresAt?`, `revokedAt?`
- **JoinRequest** (private spaces): `uid`, `displayName`, `email`, `requestedAt`, `status` (pending | approved | denied)

## Permissions → which controls to show
The backend enforces these; the UI should reflect them (hide/disable what a user can't do).

| Entity | Read | Create | Update | Delete |
|---|---|---|---|---|
| **Space** | members (public: anyone) | any signed-in (becomes owner) | owner (full); self (join public / leave) | **owner** |
| **Channel** | members | members | owner (full); members (bump last-message) | **owner** |
| **Message** | members | members (author = self) | **author** (own content/edit/soft-delete) | author or **owner** |
| **Task** | members | members | creator or owner; members (pull fan-out fields only) | creator or owner |
| **Team member** | members | members | creator or owner; members (adopt fan-out only) | creator or owner |
| **Spell** | members | members | creator or owner; members (install fan-out only) | creator or owner |

**Design implications:**
- Non-owners don't see delete-space / manage-member controls.
- Edit/delete on a message appears only for the author (and delete for the owner).
- Anyone in the space can push and pull; only the creator/owner can edit/delete a shared entity.
- Pulling/adopting/installing is allowed for any member (it only writes fan-out counters) — so those actions are always available to members.
- `[VISION]` **admin** role sits between owner and member: moderate content + manage members, but can't delete the space.

## Realtime behavior (affects motion/feedback design)
- Messages, members, shared lists, and (future) presence/reactions update **live** via subscriptions — design for content that appears/updates without a refresh.
- The user's own sends/pulls are **optimistic** (shown instantly, reconciled) — design pending/confirmed/failed states.
- Counts (pulled-by, adoption, install, unread) tick up in real time.
