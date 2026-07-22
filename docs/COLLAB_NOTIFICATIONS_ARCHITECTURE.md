# Collab Space — Notifications Architecture & Plan

**Status:** Phase 1 and Phase 2 implementation complete; Phase 2 awaits Firebase console configuration and deployment
**Author:** maestro-worker (sess_1784714043809)
**Date:** 2026-07-22
**Scope decisions locked with product owner:** web-browser surface · phased delivery (in-app first, then true push) · Cloud Functions fan-out · **messages are the only notification trigger**

---

## 1. Goal

When a message is sent in a Collab Space, the *other* people in that space should find out, even when they aren't staring at the channel. Documents, tasks, spells, files, membership changes, and every other Collab event are deliberately out of scope and must not create notifications. Two delivery regimes:

- **In-app (foreground):** live toasts, unread badges, a notification inbox while the app is open.
- **True push:** an OS/browser notification that arrives when the tab is backgrounded or fully closed.

This document researches the two enabling technologies the task called out — **Web Push / FCM** and **Realtime Database (RTDB) events** — decides how they fit the *existing* Collab design, and lays out a phased build.

---

## 2. What exists today (constraints we must respect)

Findings from the current `staging` tree:

| Aspect | Current state | Implication for notifications |
|---|---|---|
| Backend | **100% Firestore + serverless.** No Cloud Functions, no RTDB configured (`firebase.json` has only `firestore`). Rules-only security. | Any *server-side* fan-out is net-new infra. |
| Firebase plan | Almost certainly **Spark (free)** — files are stored inline as base64 *because* "Storage requires Blaze" (see `firestore.rules` files block). | True push (Cloud Functions) **requires upgrading to Blaze**. |
| Live updates | Client `onSnapshot` listeners (`MessagingClient.subscribeToChannels/Messages`), plus poll-based `collab message watch` in the CLI. | Phase 1 in-app notifications can be built **entirely on existing listeners — zero new infra**. |
| Data model | `collabSpaces/{id}` has `channels/{id}/messages` plus separate document, file, task, membership, spell, and invite data. Members carry roles (owner/admin/member) in `members{}` + `memberIds[]`. | Only `channels/{id}/messages` is a notification source; all other data stays out of the pipeline. |
| Presence | **None.** No "who's online" anywhere. | RTDB presence is net-new (Section 7). |
| Notification infra | **None.** No FCM, VAPID, service worker, tokens. | All net-new. |
| Client surface (in scope) | **Web app** (`feat/web-ui*`, served over Tailscale) — a real browser. | This is the *only* surface that supports true **Web Push**. |
| Client surfaces (out of scope, noted) | Tauri **desktop** (WKWebView — cannot do Web Push; would need the OS-native notification plugin), **Expo mobile** (native FCM/APNs). | Deferred. The data model below is designed so adding them later is additive, not a rewrite. |

---

## 3. Concepts primer (so the design choices are legible)

Three things are all confusingly called "channels." Keep them distinct:

- **Collab channel** — our own Slack-style `channels/{id}` per space. A *product* concept.
- **FCM topic** — a named broadcast bucket a client subscribes to; a send to the topic reaches every subscriber. A *transport* concept. (Not the same as an Android "notification channel".)
- **Notification category / (Android) notification channel** — a client-side grouping/priority bucket for how a notification is displayed. Irrelevant on web; relevant only if mobile is added.

**Web Push in a nutshell** (the browser standard behind FCM web):
1. The web app registers a **service worker** (`firebase-messaging-sw.js`) — a background script that runs even when the tab is closed.
2. The app calls `Notification.requestPermission()`; on grant, FCM's `getToken()` returns a **registration token** (unique per browser install) using a **VAPID** key pair.
3. That token is stored server-side (in our case, in Firestore).
4. To notify, a trusted server sends a message *to that token* via the **FCM HTTP v1 API** (Firebase Admin SDK). The service worker receives it and calls `showNotification()`.

**Tokens vs topics** (the core fan-out choice):
- **Token-targeted:** send to specific device tokens. Precise (can target exactly the mentioned user), lets us apply per-user preferences and presence suppression server-side. Cost: we must maintain a token registry and multicast (≤500 tokens/batch). **This is what @mention-first notifications need.**
- **Topic-targeted:** clients subscribe to e.g. `space_{spaceId}`; one send hits all subscribers. Cheap and simple for coarse broadcast, but *can't* target a single user, *can't* apply per-recipient preferences at send time, and can't do presence suppression. Limits: an app instance can join ≤2000 topics; ≤3000 subscription-changes/sec/project.
- **Decision:** **token-targeted fan-out** for v1 (mentions + "activity in my space"), because recipient resolution is per-user (mention set, mute prefs, presence). Keep topics as a possible later optimization for very-high-member public spaces (Section 12).

**RTDB events & presence.** Firestore has **no native presence**. The canonical "who's online" primitive is **RTDB `onDisconnect()`**: a client writes `/presence/{uid} = online` and registers an `onDisconnect` handler that the RTDB server executes when the socket drops (tab close, network loss). We use RTDB *only* for presence — not as a second source of truth for collab data. Its role here is **routing**: decide whether a recipient is already looking (→ in-app only) or away (→ push). This is precisely where the task's "RTDB-based events" belongs.

---

## 4. Architecture overview

```
                       ┌──────────────────────────── Web client (browser) ───────────────────────────┐
                       │                                                                              │
  ┌─────────────┐      │   Firestore onSnapshot listeners ──► NotificationEngine (client)             │
  │  Author      │ write│        (existing MessagingClient etc.)      │                               │
  │  action      ├──────┼──► Firestore                                 ├─► in-app toast + inbox + badge│
  │  message     │      │ collabSpaces/{s}/channels/{c}/messages        │                               │
  └─────────────┘      │        ▲          │ onCreate trigger          └─► Notification API (tab open, │
                       │        │          ▼                                unfocused) — no FCM needed  │
                       │        │   ┌──────────────────────┐                                           │
                       │  RTDB  │   │  Cloud Function        │  ── FCM HTTP v1 ──►  Service Worker ──►  OS notification
                       │ presence│  │ fanoutMessageNotification()│    (token-targeted)   (firebase-        (tab closed /
                       │  read ──┼──►│  • resolve recipients  │                           messaging-sw.js)  backgrounded)
                       │        │   │  • filter prefs+presence│                                           │
                       │        │   │  • write inbox + send   │                                           │
                       │        │   └──────────────────────┘                                           │
                       └──────────────────────────────────────────────────────────────────────────────┘
```

- **Phase 1** uses only the left path (client listeners → in-app). No server, no Blaze.
- **Phase 2** adds the Cloud Function + FCM + service worker (the right path) for true push, and RTDB presence to decide in-app-vs-push so users aren't double-notified.

---

## 5. Phase 1 — In-app / foreground notifications (client-only, zero cost)

**Goal:** the moment collab feels alive when the app is open. No Blaze, no FCM, ships fast.

**Mechanism:** a client-side `NotificationEngine` that consumes the Firestore listeners the UI *already* runs (and extends coverage to all of the user's member spaces, not just the focused one).

Components:
1. **Space-wide subscription manager.** On login, subscribe to the user's member spaces. For each space, listen only to new messages across its channels. (Use `where('createdAt','>', sessionStart)` guards so the initial snapshot backfill doesn't fire a flood of notifications for old messages.)
2. **Event derivation.** For each incoming message, compute an in-app notification with `type: "message.new"`, `spaceId`, `channelId`, `actor`, `preview`, and `isMention` (author != me, and — v1 rule — I'm @mentioned **or** it's a new message in a space I belong to).
3. **Presentation:**
   - **Toast** (transient) via the existing UI toast system.
   - **Unread badges** driven by a per-user **read-state** model (Section 9): `unread = messages with createdAt > myLastReadAt[channel]`.
   - **Notification inbox** — a dropdown/panel listing recent events with deep links (space → channel → message).
   - **Browser `Notification` API when the tab is open but unfocused** — `new Notification(...)` works *without* a service worker or FCM. This gives real desktop notifications for free while the app is running; it just won't fire when the tab is closed (that's Phase 2).
4. **Preferences (minimal v1):** global toggle + per-space mute + "mentions only vs all activity" (default: mentions + my-space messages). Stored per Section 9.

**Deliverables:** `NotificationEngine`, `useNotificationsStore` (Zustand), read-state writer, inbox UI, permission-prompt UX for the browser Notification API.

---

## 6. Phase 2 — True Web Push (FCM + Cloud Functions), reaches closed tabs

**Requires:** upgrade `maestro-5f3fc` to the **Blaze** plan (Cloud Functions + Firestore triggers). FCM itself and RTDB are free-tier.

### 6.1 Client (web)
1. Add `firebase-messaging-sw.js` service worker (handles `onBackgroundMessage` → `showNotification`). It is served from the origin root and receives the public Firebase config at registration time, so it also works with a `VITE_FIREBASE_*` override.
2. On the explicit desktop-notification opt-in, `getToken({ vapidKey })` registers the browser under `notificationProfiles/{uid}/devices/{deviceId}`. Disabling the setting calls `deleteToken` and removes that device registration; the Function also prunes FCM-invalid registrations.
3. Foreground `onMessage` handler routes to the same in-app toast/inbox from Phase 1 (so a focused tab shows an in-app toast, not an OS banner).

### 6.2 Server (Cloud Functions) — the fan-out
A single `fanoutMessageNotification` triggered only on `onCreate` of `collabSpaces/{spaceId}/channels/{channelId}/messages/{messageId}`. There are no notification triggers for any other collection or membership change.

Function logic:
1. **Load the space** → `memberIds`, `members{}`.
2. **Resolve candidate recipients** = members − author.
3. **Compute relevance** per recipient (v1 rule): included if `isMention(recipient)` OR their space-pref is "all activity". (Mentions parsed from `message.mentions[]`, which the model already carries.)
4. **Apply preferences** (`notificationProfiles/{uid}`): global mute, per-space mute, per-channel mute, mentions-only, quiet hours (later).
5. **Presence gate (RTDB):** if the recipient is `online` **and** actively focused on this exact `channelId` (from `/spacePresence/{spaceId}/{uid}.focus`), **suppress push** — they're already seeing it in-app. Otherwise send push.
6. **Write to inbox:** append to `notifications/{uid}/items/{id}` (durable history + unread source of truth; also lets a just-returned user catch up). This write itself drives the in-app inbox via that user's own listener.
7. **Send push:** look up recipient tokens, multicast via Admin SDK `sendEachForMulticast` (≤500/batch). Collapse/`tag` by `channelId` so a burst coalesces. On `messaging/registration-token-not-registered`, delete the dead token.

Keep the function **idempotent** (keyed on the source message id) so retries don't double-send.

### 6.3 Payload shape
Send **data-only** messages (not `notification`-only) so the service worker fully controls rendering (title/body/icon/deep-link `data.url`), with a server-computed title/body fallback. Include `spaceId`, `channelId`, `messageId`, `type: "message.new"`, and `tag`.

---

## 7. Presence (RTDB) — the "online users" piece

**Why RTDB and not Firestore:** only RTDB gives reliable disconnect detection via `onDisconnect()`. Firestore can't tell you when a client silently drops.

**Model (RTDB):**
```
/presence/{uid}            = { state: "online"|"offline", lastChanged: <ts> }   // onDisconnect → offline
/spacePresence/{spaceId}/{uid} = { online: true, focus: "<channelId>|null", lastActive: <ts> }
```
- On connect, write `online` and register `onDisconnect` to flip to `offline`.
- On focus change (channel switch / window blur), update `focus`.
- Mirror a coarse `online` boolean into the space member card so the UI can show green dots ("who's online") — satisfying the literal "online users" ask.

**Two jobs presence does:**
1. **UX:** show who's currently in a space.
2. **Routing:** the Cloud Function reads `/spacePresence` to decide in-app-only vs push (Section 6.2 step 5), preventing double-notification.

**Note:** presence is best-effort. Push is still sent if presence is stale/unknown (fail toward delivering).

---

## 8. Notification event taxonomy (what triggers what)

| Event | Source | v1 default recipients |
|---|---|---|
| `message.new` | `channels/{c}/messages` create | @mentioned members; + all members whose pref = "all activity" |
| `message.mention` | `message.mentions[]` includes uid | the mentioned member (highest priority) |

**Scope boundary:** `message.new` and its `message.mention` priority are the entire taxonomy. A message carrying an attachment is still a message notification; creating or sharing the attachment itself is not. No document, task, spell, file, invite, presence, or membership event may be added to this pipeline without a new product decision.

---

## 9. Data model additions

### Firestore
```
notificationProfiles/{uid}
  level: "mentions" | "all"
  desktopEnabled: bool
  mutedSpaceIds: [spaceId]
  mutedChannelIds: [channelId]
  updatedAt

notificationProfiles/{uid}/devices/{deviceId}                  // FCM registration (Phase 2)
  token, platform:"web", createdAt, lastSeenAt

collabSpaces/{spaceId}/readState/{uid}
  lastReadAt: { <channelId>: <ts> }                            // drives unread badges
  updatedAt

notifications/{uid}/items/{itemId}                             // durable inbox / history
  type: "message.new", spaceId, channelId, messageId,
  actorUid, actorName, preview, createdAt, readAt|null
```

### RTDB (new)
```
/presence/{uid}/connections/{id}                    : { online:true, lastActive }
/spacePresence/{spaceId}/{uid}/connections/{id}     : { focus, visible, lastActive }
```

**Why `notifications/{uid}` is per-recipient (not a space subcollection):** a user must read *their own* inbox across all spaces with one listener, and only they may read it — a per-uid top-level collection makes the security rule trivial and the read cheap.

---

## 10. Security rules additions

```
// A user owns their notification profile and inbox.
match /notificationProfiles/{uid} {
  allow get, create, update: if isSignedIn() && request.auth.uid == uid
    && /* level, desktop flag, bounded mute arrays */;
  match /devices/{deviceId} {
    allow read, create, update, delete: if isSignedIn() && request.auth.uid == uid
      && /* bounded web-token shape; createdAt/platform immutable on update */;
  }
}
match /notifications/{uid}/items/{itemId} {
  allow read: if isSignedIn() && request.auth.uid == uid;
  allow update: if isSignedIn() && request.auth.uid == uid
    && affectedOnly(['readAt']);           // recipient can only mark read
  allow create, delete: if false;          // ONLY the Cloud Function (Admin SDK) writes items
}
match /collabSpaces/{spaceId}/readState/{uid} {
  allow read: if isSpaceMember(spaceId) && request.auth.uid == uid;
  allow write: if isSpaceMember(spaceId) && request.auth.uid == uid
    && affectedOnly(['lastReadAt','updatedAt']);
}
```
- Inbox items are written **only** by the Admin SDK (Cloud Function), which bypasses rules — so clients can't forge notifications. Clients may only flip `readAt` on their own items.
- **RTDB rules** (`database.rules.json`): a uid may write only its own connection entries. The current UI does not expose a presence roster, so reads stay private; the Admin SDK reads space focus for routing and bypasses RTDB rules.

---

## 11. Firebase plan & cost

- **Phase 1:** stays on **Spark (free)** — pure client. No new spend.
- **Phase 2:** requires **Blaze** (Cloud Functions). At Collab's scale the metered cost is negligible: FCM sends are free; Functions invocations + a few Firestore writes per event are pennies; RTDB presence traffic is tiny. Blaze is pay-as-you-go with a generous free tier — practically ~$0/mo at current usage, but the *plan upgrade is a hard prerequisite and a decision to confirm*.

---

## 12. Later optimizations (explicitly out of v1)

- **Topic fan-out for large public spaces:** for spaces with hundreds of "all-activity" subscribers, subscribe clients to `space_{spaceId}` topics and broadcast coarse events via one topic send, reserving token-targeting for mentions. Cuts multicast cost at scale.
- **Digest / batching:** coalesce bursty channels into a rolling "N new messages" push (`tag` + server-side debounce).
- **Quiet hours** in the preference model.
- **Other surfaces:** Tauri desktop via the OS-native notification plugin fed by the same inbox writes; Expo mobile via native FCM/APNs. The per-device registration shape is ready to add a platform discriminator.

---

## 13. Phased milestones

**Phase 1 — In-app (no Blaze) — complete**
1. `NotificationEngine` + space-wide subscription manager (with `createdAt >` backfill guard).
2. `useNotificationsStore` + read-state model + unread badges.
3. Notification inbox UI + deep links.
4. Browser `Notification` API for open-but-unfocused tabs + permission UX.
5. Minimal preferences (all messages or mentions-only, plus per-space/channel mute).

**Phase 2 — True push (Blaze) — implementation complete**
6. Upgrade project to Blaze; scaffold `functions/`.
7. `firebase-messaging-sw.js` + token registration + CSP allowances.
8. `fanoutMessageNotification` Cloud Function (recipient resolution, prefs, inbox write, multicast send, dead-token pruning, idempotency).
9. RTDB presence + `onDisconnect` + presence-gated push suppression.
10. Security rules (Firestore additions + new `database.rules.json`) + tests.
11. End-to-end verification: closed-tab push, mention targeting, mute honored, no double-notify when focused.

### Deployment checklist (operator action required)

1. Upgrade `maestro-5f3fc` to Blaze and enable Cloud Messaging / Cloud Functions in Firebase.
2. Generate a Web Push VAPID key in Firebase Console → Project Settings → Cloud Messaging, then set `VITE_FIREBASE_VAPID_KEY` for the browser build. It is a public key and must be available at build time.
   For a non-default Firebase project, also provide its RTDB instance URL as the `MAESTRO_RTDB_URL` Functions parameter.
3. Deploy the database and Firestore rules, then deploy the `notifications` Functions codebase:

   ```sh
   firebase deploy --only database,firestore:rules
   firebase deploy --only functions:notifications --force
   ```

4. Test with two signed-in browser profiles: keep the recipient’s channel focused (inbox only, no push), hide/close it (push), then click the notification (opens its message channel). Confirm a muted channel and a mentions-only profile suppress the appropriate deliveries.

---

## 14. Open questions for the design review

1. **Blaze upgrade** — approved as a prerequisite for Phase 2? (Phase 1 needs nothing.)
2. **Default noise level** — is "mentions + any new message in my spaces" the right default, or should non-mention messages be opt-in from day one?
3. **Presence visibility** — do we want the green-dot "who's online" UI in v1, or is presence purely an internal routing signal at first?
4. **Inbox retention** — cap `notifications/{uid}/items` (e.g. last 200 or 30 days) to bound reads/storage?
5. **DM / thread notifications** — messages carry `threadId`; do threads get their own follow/notify semantics in v1 or later?
6. **Agent mentions** — `mentions[].kind` can be `'agent'`. Should an agent-mention notify the agent's owner, or is that a separate (agent-runtime) path?
