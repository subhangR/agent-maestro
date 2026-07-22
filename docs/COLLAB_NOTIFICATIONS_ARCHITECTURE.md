# Collab Space — All-Entity Notifications Architecture

**Status:** implemented; deployment and two-browser verification recorded in Section 12
**Date:** 2026-07-22
**Firebase project:** `maestro-5f3fc`
**Functions region:** `asia-southeast1`

## 1. Product contract

When an authenticated Collab-space member changes or shares a relevant entity, every other relevant member receives a durable inbox item. A member who opted into desktop notifications also receives FCM Web Push unless the space/channel is muted or that browser is visibly focused on the affected surface.

Covered entities are messages, channels, tasks, shared team members, spells, documents, files, invites, membership, roles, and space profile/lifecycle changes. The earlier message-only decision is superseded.

## 2. Preserved baseline

Commits `d5aa484` and `1e6fc6e` established the production path:

- `fanoutMessageNotification`, a Functions v2 Firestore create trigger;
- token-targeted FCM, device registration, VAPID configuration, and dead-token pruning;
- a private durable inbox at `notifications/{uid}/items/{itemId}`;
- per-user preferences and space/channel mutes;
- connection-scoped RTDB focus presence;
- service-worker background delivery and foreground inbox/toasts;
- Firestore and RTDB security rules.

The deployed `fanoutMessageNotification` name, source path, message payload, inbox compatibility, and exact-channel focus behavior remain intact. All-entity notification handling is additive.

## 3. Architecture decision

Use entity-specific Firestore triggers feeding one shared fan-out core, rather than making clients write a public outbox.

This preserves authenticated write context for updates/deletes, adds no client-writable notification surface, and fits the current rules-only/serverless Collab architecture. Functions v2 `onDocumentWrittenWithAuthContext` supplies the actor UID for every rules-authorized write, so actor exclusion does not trust mutable `createdBy` fields.

```text
Collab Firestore write
  ├─ message create ───────────────► existing message trigger
  ├─ space root write ─────────────► membership / role / profile classifier
  ├─ channel write ────────────────► channel classifier
  ├─ invite write ─────────────────► invite classifier
  └─ shared-resource write ────────► resource classifier
                                      │
                                      ▼
                              shared fan-out core
                       recipients − actor − muted space/channel
                                      │
                      deterministic inbox create (idempotency gate)
                              │                       │
                         live inbox             FCM if enabled
                                                     │
                                      suppress when matching RTDB focus
```

## 4. Trigger inventory

| Function | Firestore source | Operations |
|---|---|---|
| `fanoutMessageNotification` | `collabSpaces/{spaceId}/channels/{channelId}/messages/{messageId}` | create only; unchanged |
| `fanoutSpaceNotification` | `collabSpaces/{spaceId}` | update/delete; join, leave/remove, role, profile, lifecycle |
| `fanoutChannelNotification` | `.../channels/{entityId}` | create/update/delete |
| `fanoutInviteNotification` | `.../invites/{entityId}` | create/update/delete |
| `fanoutTaskNotification` | `.../tasks/{entityId}` | create/update/delete/pull |
| `fanoutTeamMemberNotification` | `.../teamMembers/{entityId}` | create/update/delete/adopt |
| `fanoutSpellNotification` | `.../spells/{entityId}` | create/update/delete/install |
| `fanoutDocNotification` | `.../docs/{entityId}` | create/update/delete/pull |
| `fanoutFileNotification` | `.../files/{entityId}` | create/update/delete/download |

Channel writes that only change `lastMessageAt`/`updatedAt` are ignored. This prevents a message send from also generating `channel.updated`.

Space creation is ignored because its creator is the only initial member. Space deletion uses the before-image member set. Membership fan-out uses the union of before/after member IDs, which lets a removed member receive the removal event while still excluding the actor.

## 5. Durable taxonomy

Message compatibility stays `message.new` with `isMention`. Entity items use `<entity>.<action>`:

- `channel.created|updated|deleted`
- `task.shared|updated|deleted|pulled`
- `team_member.shared|updated|deleted|adopted`
- `spell.shared|updated|deleted|installed`
- `doc.shared|updated|deleted|pulled`
- `file.shared|updated|deleted|downloaded`
- `invite.created|updated|deleted|redeemed|revoked`
- `member.joined|left|removed|role_changed`
- `space.updated|deleted`

Inbox records add `section`, `entityKind`, `entityId`, `entityLabel`, and `action`; message fields remain readable by old and new clients.

## 6. Recipient, preference, and mute semantics

- Candidate recipients are relevant before/after/current space members minus the authenticated actor.
- `mutedSpaceIds` suppresses inbox and push for every taxonomy.
- `mutedChannelIds` suppresses message events and channel-scoped events.
- `level: mentions|all` remains a **message** preference. Entity activity is delivered at both levels because it is the product-wide activity stream. UI copy says “@mentions + Collab activity” to make this explicit.
- `desktopEnabled` gates FCM only; the durable inbox remains available.
- Invalid FCM tokens are pruned exactly as in the message pipeline.

## 7. Retry safety and delivery behavior

Entity item IDs are `evt_` plus a SHA-256 digest of the CloudEvent ID, space, taxonomy, and entity ID. The Function uses Firestore Admin `create()` as an idempotency gate. Only the invocation that creates the inbox record may send FCM, so Functions retries cannot duplicate inbox or push delivery.

The inbox is committed before FCM and remains the source of truth if FCM has a transient failure. As in the preserved message function, FCM errors are logged rather than retrying after the idempotency gate and risking a duplicate OS banner.

## 8. Generalized focus presence

RTDB remains connection-scoped:

```text
/spacePresence/{spaceId}/{uid}/connections/{connectionId}
  focus: channelId | "section:tasks" | "section:team" | ...
  visible: boolean
  lastActive: server timestamp
```

Messages compare focus to the exact channel ID. Channel events compare to their channel where applicable. Other entity events compare to `section:<section>`. A visible matching surface suppresses Web Push but not the durable inbox record. Hidden/background tabs allow push.

## 9. Generalized navigation and presentation

FCM/data and inbox payloads carry `section`, entity identity, preview, and a deep link:

```text
/?collabSpace=<spaceId>&collabSection=<section>&collabEntity=<entityId>
```

Channel links also include `collabChannel`. The client opens the space, persists/selects the correct Space Window tab, selects a channel when relevant, and acknowledges the exact durable item. The inbox/toaster/service worker use entity-specific icons and generic actor/entity headings while preserving mention rendering.

## 10. Security

There is no client-writable outbox. Existing rules remain the boundary:

- only the recipient can read their inbox and set `readAt`;
- clients cannot create/delete or alter notification content;
- only profile owners manage preferences/devices;
- Functions use Admin SDK after a rules-authorized source write;
- RTDB connections remain writable only by their UID.

The Functions trigger actor comes from authenticated Eventarc context, not document fields.

## 11. Tests and operational checks

- Pure Functions tests cover resource action taxonomy, channel metadata suppression, invite lifecycle, membership join/leave/remove/role behavior.
- UI tests cover new durable entity decoding/render metadata and deployed message document compatibility.
- Existing notification engine/store/classifier tests protect message behavior.
- Firestore emulator tests protect private inbox/profile/device/read-state rules.
- Production builds cover Functions TypeScript and browser UI/service worker bundling.

## 12. Deployment and two-user verification

To be filled with the deployed function revisions, rules deployment, VPS commit/build, and authenticated two-browser evidence during release verification.
