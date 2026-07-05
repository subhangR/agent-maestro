# Collab Space — Firestore Security Rules Model

Authoritative description of `firestore.rules` for the Collab Space feature.
Tested by `firestore-rules-tests/` (emulator-backed; `cd firestore-rules-tests && bun run test`).
Deployed to the `maestro-5f3fc` Firebase project with `firebase deploy --only firestore`.

## Data layout

```
collabSpaces/{spaceId}                      — space root (membership lives here)
  channels/{channelId}                      — Slack-style channels
    messages/{messageId}                    — one timeline per channel
  tasks/{taskId}                            — shared tasks (push/pull)
  teamMembers/{tmId}                        — shared agent personas (push/adopt)
  spells/{spellId}                          — shared spells, schema v2 (push/install)
  docs/{docId}                              — shared docs (markdown/diagram, inline content)
  files/{fileId}                            — shared files (inline base64, hard-capped)
```

Everything else is **default-denied** by an explicit catch-all.

## Identity & roles

- All access requires Firebase Auth (`isSignedIn`).
- Membership is denormalized on the space root: `memberIds: string[]` (queryable)
  plus `members: { [uid]: { role, … } }` (role lookup).
- Roles: `owner` (exactly one, `ownerId`), `admin`, `member`.

| Capability | member | admin | owner |
|---|---|---|---|
| Read space + all subcollections | ✓ | ✓ | ✓ |
| Create channels / messages / shared entities | ✓ | ✓ | ✓ |
| Edit/delete own messages & own shared entities | ✓ | ✓ | ✓ |
| Fan-out writes (record pull/adopt/install/download) | ✓ (self only) | ✓ | ✓ |
| Edit space profile (name/description/visibility) | — | ✓ | ✓ |
| Manage members (roles, removal — never the owner) | — | ✓ | ✓ |
| Rename/reorder/delete channels | — | — | ✓ |
| Moderate (hard-delete any message, delete any shared entity) | — | — | ✓ |
| Delete the space | — | — | ✓ |

Public spaces are readable by any signed-in user; private spaces only by members.

## Core invariants (enforced on every write)

1. **Final-document validation.** Shape checks (`valid*Shape()`) run on the
   *resulting* document for creates AND updates, so an update can never smuggle
   an oversized/malformed field even when that field wasn't in the diff.
2. **Immutable audit/provenance.** `createdBy`, `createdAt`, `spaceId` (and the
   space's `ownerId`) never change after create (`coreImmutable()`).
   `source*` provenance fields are only writable at create because every update
   path whitelists its editable keys via `affectedOnly([...])`.
3. **No identity spoofing.** `createdBy == request.auth.uid` on create;
   `authorUid == request.auth.uid` on message create.
4. **Fan-out pinning.** Non-creators may only touch fan-out fields, and only
   for themselves:
   - `appendsOwnUidOnly(field)`: uid arrays (`pulledByUids`, `adoptedByUids`,
     `installedByUids`, `downloadedByUids`) are append-only, max +1 per write,
     capped at 1000, and the **set-difference of added elements must be exactly
     `{caller}`** (checking `caller in newList` would let anyone already in the
     list append arbitrary uids).
   - `touchesOwnMapKeyOnly(field)`: per-uid maps (`linkedLocalIdsByUid`) accept
     changes to the caller's key only (rules `MapDiff.affectedKeys()`).
   - Counters are **not** stored (increments drift under retry); clients derive
     counts from the uid arrays on read.
5. **Membership transitions are self-service only.**
   - Self-join: public spaces only; the caller may add exactly themselves, with
     role `member`, touching only their own `members` key.
   - Self-leave: the caller may remove exactly themselves. The **owner cannot
     leave** (they must delete the space) — no orphaned spaces.
   - Admins manage members but can never demote, remove, or replace the owner.
6. **Size caps everywhere.** Space name ≤ 80, description ≤ 500; channel name
   ≤ 64; message content ≤ 10,000 chars (empty allowed only with 1–10
   attachments); task title ≤ 200, description ≤ 20k; team-member identity
   ≤ 20k, skillIds ≤ 50; spell rules ≤ 20 entries, body ≤ 20k; doc content
   ≤ 200k chars; file `data` ≤ 819,200 base64 chars (600 KiB raw, `size` field
   ≤ 614,400); `memberIds` ≤ 200.

## Special cases

- **Space creation batch:** the default `#general` channel is created in the
  same atomic batch as the space; `willOwnSpace()` uses `getAfter()` to
  authorize the channel write before the space doc exists.
- **`lastMessageAt` bumps:** any member may update a channel iff the diff is
  exactly `{lastMessageAt, updatedAt}` (part of the send-message batch).
- **Message edit/soft-delete:** author only, diff limited to
  `{content, editedAt, deletedAt}`, content re-capped. Hard delete: author or
  space owner.
- **Files are inline base64** because the project's default Firebase Storage
  bucket is not provisioned (requires the Blaze plan). When Storage becomes
  available, migrate `files/{id}.data` to Storage object paths and mirror the
  membership checks in `storage.rules` (`firestore.get()` on the space doc).

## Known accepted gaps (documented, not enforced)

- **Orphaned subcollections after space delete.** Deleting the space root does
  not cascade (client-side cascade is unreliable; needs a Cloud Function =
  Blaze). Orphaned docs are unreachable through the rules (membership check
  `get()`s the space doc, which no longer exists → deny), so this is a storage
  cost, not an access risk.
- **Denormalized `members` map vs `memberIds` consistency** is written
  atomically by the client; rules verify the diff shape per transition but do
  not re-derive one from the other.

## Indexes

`firestore.indexes.json` carries the two composite indexes needed by
repo-scoped space discovery:

- `collabSpaces (githubUrl ASC, visibility ASC, createdAt DESC)`
- `collabSpaces (githubUrl ASC, memberIds CONTAINS, createdAt DESC)`

All subcollection queries order by a single field (`createdAt` / `position`)
and use Firestore's automatic single-field indexes. The joined-spaces query
(`memberIds CONTAINS`, no orderBy) deliberately avoids a composite index and
sorts client-side.
