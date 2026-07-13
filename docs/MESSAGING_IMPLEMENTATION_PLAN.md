# Maestro Space Messaging — Implementation Plan

Plan for the **messaging system inside Maestro Collab Spaces**. Each Space gets channels (Slack-style); each channel has a real-time message timeline; messages show author identity (name + photo) and timestamp.

This is the centerpiece feature of a Space — the messaging channel is the heart of collaboration.

---

## 1. Data Model (Firestore)

All messaging data lives as **subcollections under the existing `collabSpaces/{spaceId}` document**, so security inherits naturally from space membership.

### `collabSpaces/{spaceId}/channels/{channelId}`

```ts
interface Channel {
  id: string;                  // == doc id
  spaceId: string;             // denormalized for client convenience
  name: string;                // "general", "design" — kebab-case, no #
  description: string;
  createdBy: string;           // uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt: Timestamp | null;  // for sort/unread
  position: number;            // manual ordering (default = createdAt epoch)
  isDefault: boolean;          // true for the auto-created #general
}
```

### `collabSpaces/{spaceId}/channels/{channelId}/messages/{messageId}`

```ts
interface Message {
  id: string;
  spaceId: string;
  channelId: string;
  authorUid: string;
  authorDisplayName: string;   // SNAPSHOT at send-time
  authorPhotoUrl: string | null;
  content: string;             // plain text + simple markdown (max 10k chars)
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deletedAt: Timestamp | null; // soft delete
  threadId: string | null;     // parent message id (deferred)
  replyCount: number;          // updated by Cloud Function later (deferred)
}
```

**Why denormalize author info?** If a user changes their name/photo later, the historical message stays as authored. Standard chat pattern (Slack, Discord).

**Soft delete?** Yes — preserves thread integrity and lets the UI render "[deleted]" in place. Messages are hard-deleted only by space owner via admin sweep (out of scope v1).

---

## 2. Security Rules

Add to `firestore.rules`. Helpers go in the top of the rules file.

```
function isSpaceMember(spaceId) {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/collabSpaces/$(spaceId)).data.memberIds;
}

function isSpaceOwner(spaceId) {
  return request.auth != null
    && request.auth.uid == get(/databases/$(database)/documents/collabSpaces/$(spaceId)).data.ownerId;
}

match /collabSpaces/{spaceId}/channels/{channelId} {
  allow read:   if isSpaceMember(spaceId);
  allow create: if isSpaceMember(spaceId)
                && request.resource.data.createdBy == request.auth.uid
                && request.resource.data.name is string
                && request.resource.data.name.size() > 0
                && request.resource.data.name.size() <= 64;
  allow update: if isSpaceOwner(spaceId)
                || (isSpaceMember(spaceId)
                    && request.resource.data.diff(resource.data).affectedKeys()
                       .hasOnly(['lastMessageAt', 'updatedAt']));
  allow delete: if isSpaceOwner(spaceId);
}

match /collabSpaces/{spaceId}/channels/{channelId}/messages/{messageId} {
  allow read:   if isSpaceMember(spaceId);
  allow create: if isSpaceMember(spaceId)
                && request.resource.data.authorUid == request.auth.uid
                && request.resource.data.content is string
                && request.resource.data.content.size() > 0
                && request.resource.data.content.size() <= 10000;
  allow update: if request.auth.uid == resource.data.authorUid
                && request.resource.data.diff(resource.data).affectedKeys()
                   .hasOnly(['content', 'editedAt']);
  allow delete: if request.auth.uid == resource.data.authorUid
                || isSpaceOwner(spaceId);
}
```

`get()` reads cost 1 doc read per rule eval — acceptable. If volume becomes an issue, denormalize `memberIds` onto each message (skipped for v1).

---

## 3. Indexes

Messages query within a single channel (subcollection), ordered by `createdAt`. **Single-field auto-indexed** by Firestore — no composite needed.

For threads (deferred): `where('threadId', '==', X)` ordered by `createdAt ASC` — also single-field auto-indexed.

For listing channels: `orderBy('position').orderBy('createdAt')` — composite needed if both used. v1 uses just `position` ASC, single-field.

---

## 4. UI Architecture

All new components live under `maestro-ui/src/components/maestro/messaging/`.

```
messaging/
├── ChannelList.tsx          left sidebar — list channels + "+ create"
├── CreateChannelModal.tsx   modal form
├── ChannelHeader.tsx        active channel name + description
├── MessagesPane.tsx         scroll container + paged loading
├── MessageBubble.tsx        single message row
├── MessageComposer.tsx      textarea + send button
└── messagingTypes.ts        Channel + Message types
```

**Mount point:** in `CollabSpaceDetail.tsx`, replace the `MessagesPlaceholder` with the actual messaging UI when `tab === "messages"`.

### Layout (within Messages tab)

```
┌─ Channels ──┬─ Messages ─────────────────────┐
│ # general   │  # general                     │
│ # design    │  3 members can post here       │
│ # random    │ ────────────────────────────── │
│             │  [Avatar] Subhang  4:23 PM     │
│ + new       │           Hey team             │
│             │                                 │
│             │  [Avatar] Manzil   4:25 PM     │
│             │           Working on the API   │
│             │                                 │
│             │ ────────────────────────────── │
│             │  [textarea  ]    [Send]        │
└─────────────┴────────────────────────────────┘
```

Sidebar collapses to icons on narrow widths (CSS only).

### MessageBubble details

- **Avatar**: 32px Google photo or initials fallback
- **Header**: display name + relative time (`4:23 PM today` / `Yesterday 4:23 PM` / `Apr 12 4:23 PM`) — use `date-fns` (already a dep)
- **Content**: simple markdown via `react-markdown` (already a dep)
- **Hover actions** (own message): edit ✎, delete ✕
- **Edited indicator**: `(edited)` after timestamp if `editedAt` set
- **Deleted message**: render `[deleted]` placeholder, no content

### Composer details

- Multi-line textarea, autosizes
- **Enter** sends, **Shift+Enter** newline
- Disabled while sending
- Optimistic insert: append a temporary message with `pending: true`, replace once Firestore confirms (or rollback on error)
- Empty/whitespace-only blocked

---

## 5. Client + State

### `maestro-ui/src/firebase/MessagingClient.ts`

```ts
export const MessagingClient = {
  subscribeToChannels(spaceId, cb): Unsubscribe;
  createChannel(user, spaceId, input): Promise<Channel>;
  updateChannel(spaceId, channelId, patch): Promise<void>;
  deleteChannel(spaceId, channelId): Promise<void>;

  subscribeToMessages(spaceId, channelId, cb, opts?: { limit?: number }): Unsubscribe;
  loadOlderMessages(spaceId, channelId, beforeDoc, limit): Promise<Message[]>;
  sendMessage(user, spaceId, channelId, content): Promise<Message>;
  editMessage(spaceId, channelId, messageId, content): Promise<void>;
  deleteMessage(spaceId, channelId, messageId): Promise<void>;
};
```

### `maestro-ui/src/stores/useMessagingStore.ts`

New Zustand store, separate from `useCollabSpaceStore` to keep concerns clean.

```ts
interface MessagingState {
  channelsBySpace: Record<spaceId, Channel[]>;
  channelsLoading: Record<spaceId, boolean>;
  activeChannelBySpace: Record<spaceId, channelId>;

  messagesByChannel: Record<channelId, Message[]>;
  messagesLoading: Record<channelId, boolean>;
  messagesHasMore: Record<channelId, boolean>;

  // pending optimistic sends keyed by client tempId
  pendingByChannel: Record<channelId, Message[]>;

  channelSubs: Record<spaceId, Unsubscribe>;
  messageSubs: Record<channelId, Unsubscribe>;

  subscribeToChannels(spaceId): void;
  unsubscribeFromChannels(spaceId): void;
  selectChannel(spaceId, channelId): void;
  subscribeToMessages(spaceId, channelId): void;
  unsubscribeFromMessages(channelId): void;
  loadOlder(spaceId, channelId): Promise<void>;
  sendMessage(user, spaceId, channelId, content): Promise<void>;
  editMessage(...): Promise<void>;
  deleteMessage(...): Promise<void>;
  createChannel(user, spaceId, input): Promise<Channel>;
}
```

### Pagination

- Initial subscription: `orderBy('createdAt', 'desc'), limit(50)`
- "Load older" button at top of timeline: one-time fetch with `startAfter(oldestDoc)`, prepend to local list
- New messages arrive via the live subscription on the head; sorted ASC for display

---

## 6. Auto-create `#general` on Space Creation

Modify `CollabSpaceClient.create()` to also write the default `#general` channel in the same flow:

```ts
async create(user, input) {
  const spaceRef = await addDoc(collabSpaces, { ...spaceFields });
  await addDoc(`collabSpaces/${spaceRef.id}/channels`, {
    name: 'general',
    description: '',
    createdBy: user.uid,
    isDefault: true,
    position: 0,
    ...
  });
  return fetchedSpace;
}
```

Two writes, can be a Firestore batch for atomicity.

---

## 7. Acceptance Criteria

- [ ] Creating a Space auto-creates a `#general` channel.
- [ ] Channel sidebar lists all channels for the active space, in `position` order.
- [ ] Clicking a channel switches the message timeline.
- [ ] Sending a message: appears optimistically, then confirms; visible in real-time to other connected members.
- [ ] Each message shows author avatar (Google photo or initials), display name, relative timestamp.
- [ ] Author can edit or soft-delete their own messages; space owner can delete any message.
- [ ] Edited messages show `(edited)` indicator.
- [ ] Soft-deleted messages render as `[deleted]`.
- [ ] Channel "+ create" modal: name (kebab-case validated), optional description.
- [ ] Only space members can read or post messages (verified by rules, not just UI).
- [ ] Initial load shows latest 50 messages; "Load older" button appears when more exist.
- [ ] Channel list updates in real-time when other members create channels.
- [ ] Empty channel state: "No messages yet — be the first to say something."
- [ ] Composer disabled with helpful empty state if user is not a member.

---

## 8. Out of Scope (deferred to follow-up tasks)

- Threaded replies (`threadId`/`replyCount` exist in the schema but UI deferred)
- Mentions / `@user` autocomplete
- Embedded entity cards (mentioning a Maestro task in a message — `@task:abc123`)
- Reactions / emoji
- Read receipts / unread indicators
- Typing indicators / presence
- File attachments (Firebase Storage)
- Push notifications
- Search across messages
- Channel rename / archive UI (rules allow, no UI yet)

---

## 9. Open Questions

1. **Channel deletion**: hard delete or archive? Current plan: hard delete by owner only — no recovery. Confirm.
2. **Markdown safety**: `react-markdown` defaults are safe (no raw HTML). Any need for richer formatting (code blocks, tables)?
3. **Message length cap**: 10k chars enforced by rules. Reasonable?
4. **Channel name format**: kebab-case (`api-design`) vs free text (`API Design`)? Default kebab — Slack-style.
5. **Do we need a `lastReadAt` per-user-per-channel for unread badges in v1?** I'd say no — defer.

---

## 10. Subtask Breakdown (suggested)

When breaking this into work units:

1. **Schema + rules + indexes** — types, rules update, deploy
2. **MessagingClient + useMessagingStore** — Firestore CRUD + state shell
3. **Auto-create `#general`** — modify space creation, batch write
4. **ChannelList + CreateChannelModal** — left sidebar UI
5. **MessagesPane + MessageBubble** — timeline rendering, formatting, hover actions
6. **MessageComposer** — input, optimistic send, keyboard
7. **Wire into CollabSpaceDetail** — replace `MessagesPlaceholder`, layout
8. **Pagination** — load older, scroll-to-bottom
9. **Edit / soft-delete UI** — author-only actions
10. **Polish + empty states** — error toasts, loading skeletons

Ten subtasks if one wants fine granularity, or roughly three coherent PRs (schema+state, basic send/receive, edit/paginate/polish).

---

## 11. File Inventory

**New:**
- `maestro-ui/src/firebase/MessagingClient.ts`
- `maestro-ui/src/firebase/messagingTypes.ts`
- `maestro-ui/src/stores/useMessagingStore.ts`
- `maestro-ui/src/components/maestro/messaging/ChannelList.tsx`
- `maestro-ui/src/components/maestro/messaging/CreateChannelModal.tsx`
- `maestro-ui/src/components/maestro/messaging/ChannelHeader.tsx`
- `maestro-ui/src/components/maestro/messaging/MessagesPane.tsx`
- `maestro-ui/src/components/maestro/messaging/MessageBubble.tsx`
- `maestro-ui/src/components/maestro/messaging/MessageComposer.tsx`
- `maestro-ui/src/styles-messaging.css`

**Modified:**
- `maestro-ui/src/components/maestro/CollabSpaceDetail.tsx` — replace placeholder
- `maestro-ui/src/firebase/CollabSpaceClient.ts` — auto-create `#general` in `create()`
- `maestro-ui/src/styles.css` — `@import './styles-messaging.css'`
- `firestore.rules` — add helpers + channel/message blocks
