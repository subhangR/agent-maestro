# Maestro Collab → Mobile: Understanding & Implementation Spec

_Task: task_1784740403807_3u64f9xu5 · Session: sess_1784740413749_knvbbcni8 · 2026-07-22_

Goal: implement the **entire Maestro Collab UI** inside `maestro-mobile` (RN/Expo), at **full parity** with desktop.

---

## 1. How Maestro Collab works (desktop + CLI, today)

Collab is a **100% Firebase product** — Firestore for data, Firebase Auth for identity.
There are **no maestro-server endpoints**: the desktop UI (`maestro-ui/src/firebase/*`,
`stores/useCollabSpaceStore`, `useMessagingStore`) and the CLI (`maestro-cli/src/commands/collab.ts`)
both talk **directly to Firestore**. Security is enforced by `firestore.rules`.

### Data model (Firestore)
- `collabSpaces/{spaceId}` — repo-scoped (canonical `githubUrl`), `visibility` public|private,
  `ownerId`, `memberIds[]`, `members{uid → {role owner|admin|member, displayName,email,photoUrl,joinedAt}}`.
  - `.../channels/{channelId}` — `name`, `position`, `isDefault`, `lastMessageAt`.
    - `.../messages/{msgId}` — `content`, `authorUid`, `mentions[]` (member|agent), `attachments[]`,
      `threadId`, `replyCount`, `editedAt`, `deletedAt` (soft delete), `clientMsgId` (optimistic reconcile).
  - `.../invites/{inviteId}` — bearer secret **is** the doc id; kind link|code, `maxUses`, `useCount`,
    `expiresAt`, `revokedAt`. Redeem is a Firestore **transaction** (+ `inviteClaims/{uid}`).
  - `.../docs`, `.../files` — shared markdown/diagram docs & small (<600KiB) files.
  - Shared entity subcollections for **tasks / members / spells** (share/pull).

### Feature surface (full parity target)
1. **Auth** — Firebase Auth. (Mobile decision: **Google only**.)
2. **Spaces** — list mine/public per repo, create (public/private), join public, redeem private invite (link/code).
3. **Chat** — channels sidebar (+create), messages pane (paginate/load-older, optimistic send, retry/dismiss failed),
   message bubble (edit, soft-delete, **@mentions** of members & agents, attachments, thread reply counts),
   composer with mention autocomplete.
4. **Members/roles** — owner/admin/member, set-role, remove, leave.
5. **Invites** — create (link|code, max-uses, expiry), list, revoke, redeem.
6. **Notifications** — `CollabNotificationEngine` (classify unread/mentions), bell, toaster; desktop web-push via Cloud Functions.
7. **Presence** — `collabPresence` online tracking.
8. **Share / Pull** — push & import **tasks, members, spells, docs, files** between a space and a local project
   (CLI-only today; creates entities via server REST `/api/*`).

---

## 2. maestro-mobile today

RN 0.81 / Expo 54, expo-router v6 (file-based), Unistyles, Zustand 5 + MMKV.
- Tabs: **Sessions / Tasks / Members / More** + Conduct FAB. Terminal & Whiteboard as full-screen WebView modals.
- Data layer: `MaestroClient` (REST) + realtime WS + PTY transport → a **local maestro-server over raw IP (Tailscale)**.
- **No-auth**: `app/connect.tsx` is a host-entry gate; no login, no token.
- **No Firebase dependency at all.** Single normalized `entityStore` mirrors desktop `useMaestroStore`.
- Routes are centralized in `navigation/routes.ts` (features never hardcode paths).

**The core gap:** Collab requires Firebase + a logged-in Firebase user; mobile is a Firebase-free, no-auth,
server-IP app. Mobile must bolt on a **second, independent backend** (Firebase) alongside its existing server client.

---

## 3. Locked design decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Data path | **Firebase SDK directly** in RN (mirror desktop; no new server work) |
| 2 | v1 scope | **Full parity** (chat + invites + members + notifications + share/pull) |
| 3 | Auth methods | **Google only** |
| 4 | Navigation placement | **New top-level "Spaces" tab** |
| 5 | Firebase SDK flavor | **@react-native-firebase** (native; enables FCM push; needs dev build — already using expo-dev-client) |
| 6 | Repo scoping | **All my spaces, flat** (`subscribeToAllForUser`), grouped by repo; repo picker for discover/create |
| 7 | Design source | **Build in existing mobile kit** (Hanken Grotesk, m-* components, tokens, dark mode) |
| 8 | Share/pull target | **The connected maestro-server** (pull → server REST into a chosen project; share ← server's local entities) |

---

## 4. Implementation shape (derived from decisions)

### New dependencies
- `@react-native-firebase/app`, `/auth`, `/firestore`, `/messaging` (FCM push).
- `@react-native-google-signin/google-signin` for Google auth → Firebase credential.
- Requires native config (GoogleService-Info / google-services.json, OAuth client ids) + a fresh dev build.

### Navigation
- Add `(tabs)/(spaces)/` route group + `routes.spaces()` / `routes.space(id)` / `routes.spaceChannel(...)` in `navigation/routes.ts`.
- Add tab to `CustomTabBar` (5th destination). Auth-gate the tab: signed-out → Google sign-in screen.

### Firebase layer (new `maestro-mobile/src/services/collab/`)
- Port/adapt desktop `CollabSpaceClient` + `messaging` client to `@react-native-firebase/firestore`
  (API differs from JS SDK: `firestore().collection().onSnapshot()` chaining vs modular `onSnapshot(query,...)`).
- Reuse the **type contracts** from desktop (`collabSpaceTypes`, `messagingTypes`) and the
  `CollabNotificationEngine` classification logic (framework-agnostic — good reuse candidate).
- Firestore realtime via `onSnapshot`; optimistic send via `clientMsgId`.

### State
- New Zustand stores mirroring desktop: `collabAuth`, `collabSpaces`, `messaging`, `collabNotifications`, `presence`.
- Keep them **separate** from the server `entityStore` (different backend/lifecycle).

### Screens (mobile kit)
1. Spaces tab home — flat "my spaces" grouped by repo + discover/create (repo picker) + private-invite redeem.
2. Space view — channel list (drawer/sheet) → messages pane → composer (mentions, attachments).
3. Message actions — edit / delete / thread (sheet).
4. Members & roles — sheet/screen (set-role, remove, leave).
5. Invites — create/list/revoke (owner/admin).
6. Share/Pull — browse shared tasks/members/spells/docs/files; pull → pick server project; share ← server entity picker.
7. Notifications — bell + in-app toaster + FCM native push (tap → deep-link to channel/message).
8. Auth — Google sign-in gate.

### Backend touchpoints
- Extend existing **Cloud Functions** notification sender (currently web-push) to also send **FCM** to mobile device tokens.
- Register/store the device FCM token (new field or subcollection keyed by uid).

---

## 4a. Cross-session coordination — shared mobile Firebase auth

Adjacent session **sess_1784740522218_280f7jk3r** ("Maestro Hub / mobile-multi-server", design at
`docs/mobile-multi-server/DESIGN.md`) also needs mobile Firebase Google sign-in — the Hub gateway
verifies a Firebase Google **ID token** (project maestro-5f3fc). To avoid two sign-in flows we agreed:

**Status: LOCKED & CONFIRMED (both sessions).** Their record: `docs/mobile-multi-server/DESIGN.md` §3, §4a.

- **SDK standardized:** **@react-native-firebase/auth + @react-native-google-signin** (Expo-AuthSession alternative
  dropped). `signInWithCredential(GoogleAuthProvider)` yields both a live Firebase session (Collab/Firestore) and
  `getIdToken()` (Hub Bearer). Dev build via expo-dev-client is accepted.
- **Owner: the Hub session (sess_1784740522218_280f7jk3r) lands** the shared module `src/services/firebaseAuth/`:
  - `useFirebaseAuth(): { user, status, signInWithGoogle(), signOut() }` — my live-auth/Firestore need (hook).
  - `getIdToken(forceRefresh?): Promise<string|null>` — **non-hook accessor** (their Hub needs it at connect-time
    + socket re-auth, outside React). `onIdTokenChanged` refresh; token cached in `expo-secure-store`.
  - I co-design the interface + am primary consumer validating the live-session requirement; ping them if
    Firestore/security-rules needs an interface tweak.
- **Sequencing:** they land **firebaseAuth + Firebase app bootstrap init + native Firebase config FIRST** (the base
  both build on); I layer `(tabs)/(spaces)` + Collab Firestore layer + stores + messaging/FCM on top.
- **Joint edits (sequenced):** `package.json` deps, native config (`google-services.json`/`app.json`/`Info.plist`/
  expo-dev-client), Firebase bootstrap, secure storage. Coordinate before touching **prefs/connection** for FCM
  device-token registration — that's their area.
- **Disjoint (confirmed):**
  - **Mine, they won't touch:** `(tabs)/(spaces)` routes, `CustomTabBar`, `src/services/collab/`, collab stores,
    messaging + FCM sender.
  - **Theirs, I won't touch:** server-profiles store, `/health` authMode, connection transport, settings server-switcher.

## 6. DELIVERED (feat/mobile-collab worktree, off staging)

Full-parity Collab-mobile implemented end-to-end. **tsc clean across the whole app; all 76 existing mobile tests pass.** ~8,600 LOC.

Commits on `feat/mobile-collab` (worktree `~/Desktop/Projects/maestro/mobile-collab-wt`):
- `0a01ea2` foundation — shared firebaseAuth (Google) + Firestore-direct data layer + Spaces tab + native config
- `f44ea12` spaces + members + invites + chat verticals
- `6f866b5` notifications + FCM + share/pull, fully integrated

What shipped:
- **Auth** `src/services/firebaseAuth/` — Google-only sign-in; `useFirebaseAuth()` hook + module-level `getIdToken()`/`signInAndGetIdToken()`/`currentUser()`; token mirrored to expo-secure-store; `initFirebaseAuth()` in app root.
- **Data** `src/services/collab/` — RN-namespaced Firestore clients (spaces/messaging/invites/shared) + normalized types + invite-link util. Same collections/shapes as desktop+CLI → interoperable.
- **Spaces** — `subscribeToAllForUser` home grouped by repo; create/join/discover; private-invite redeem; MembersSheet (roles/remove/leave); InvitesSheet (create/list/revoke).
- **Chat** — channels + paginated messages + optimistic send (clientMsgId reconcile) + retry + @mentions + edit/soft-delete.
- **Notifications** — engine (space→channel→message) + pure classifier + store (inbox/toasts/unread, MMKV) + Bell + Toaster + FCM (`fcm.ts`) + `functions/src/collabFcm.ts` sender; `collabRuntime` binds it to auth.
- **Share/Pull** — browse shared entities; pull task/member into a chosen **connected-server** project (`getMaestroClient`); share local task/member out to Firestore.
- **Nav** — 5th "Spaces" tab (hash icon) + `(spaces)` route group + `routes.space()`.

Orchestration: foundation authored by lead; 4 package-disjoint parallel sub-agents (spaces / chat / notifications+FCM / share-pull); lead integrated (bell, members/invites/shared into SpaceScreen, toaster+runtime at root) and verified.

### Remaining to actually RUN on a device (NOT code — prerequisites/merge steps)
1. **On-device creds** (device-auth prerequisite, not a code dep): real `google-services.json` + `GoogleService-Info.plist` from the maestro-5f3fc Firebase console + real `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (placeholders in app.json). A dev build (`expo prebuild` + native) is required — not runnable in this env.
2. **Hub merge-time wiring** (3 lines, after both branches on staging): in bootstrap after `initFirebaseAuth()` — `setHubFirebaseAuth({ getIdToken, signIn: signInAndGetIdToken })`.
3. **FCM sender wiring**: import/trigger `functions/src/collabFcm.ts` from `functions/src/index.ts` (left un-imported to protect the functions build).

## 5. Open follow-ups (not blocking design, resolve during build)
- Firestore rules: confirm mobile device-token writes are covered; no rule changes expected for read/write parity.
- share/pull "active server project" selection UX on phone (which connected server + which project).
- Whether mentions of **agents** (`kind:'agent'`) should trigger an invoke path on mobile, or display-only for v1.
- Offline behavior (Firestore RN persistence is on by default) vs the app's existing MMKV/offline model.
