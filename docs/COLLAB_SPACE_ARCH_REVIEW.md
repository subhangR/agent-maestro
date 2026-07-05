# Collab Space — Production Hardening: Architecture Review

**Branch:** `feat/collab-hardening` (off `staging`) · **Date:** 2026-07-05
**Scope (locked):** harden the shipped surfaces — spaces, push/pull sharing,
storage (files), docs, chat/channels. Roadmap features (presence, DMs, email
invites, join approvals, admin tier, @mention→invoke) logged as future work only.

## 1. Current-state map (after this branch)

```
maestro-ui/src/firebase/
  config.ts, firestore.ts, auth.ts        — app/auth/db singletons (unchanged shape)
  firestoreUtils.ts          NEW          — retry/backoff, stripUndefinedDeep, validated coercers
  spaceResourceClient.ts     NEW          — ONE generic client for all shared-entity subcollections
  CollabSpaceClient.ts       REWRITTEN    — spaces CRUD/membership, validated reads, sub error handlers
  MessagingClient.ts         HARDENED     — channels/messages, clientMsgId, attachments, idempotent retries
  SpaceTasksClient.ts        THIN WRAPPER — over the factory (was ~115 LOC of copy-paste, now coercers only)
  SpaceTeamMembersClient.ts  THIN WRAPPER
  SpaceSpellsClient.ts       THIN WRAPPER + v2 rule validation at the read boundary
  SpaceDocsClient.ts         NEW          — shared docs
  SpaceFilesClient.ts        NEW          — shared files (inline base64) + blob/base64 helpers
  SpaceShareClient.ts        EXTENDED     — push writes for all five entity kinds, pre-allocated refs
  SpaceAdapters.ts           EXTENDED     — pull/adopt/install (+ docs pull), lossless spell install
  collabTeardown.ts          NEW          — one-way bridge: auth store → tears down every collab store
Stores: useCollabSpaceStore / useMessagingStore / useJoinedSpacesStore
        (+ unsubscribeAll, error surfacing), useFirebaseAuthStore
        (teardown on uid change, friendly error copy)
UI:     space-window (8 tabs: Messages/Tasks/Team/Spells/Docs/Files/Members/Settings),
        messaging (composer attachments, bubbles), ShareToSpaceModal (5 kinds),
        CollabSpacePanel; shared modal a11y hook (focus trap/restore, Esc)
Config: firestore.rules (rewritten), firestore.indexes.json (unchanged — audited),
        firestore-rules-tests/ (26 emulator tests)
```

Data model doc: `docs/collab-design/design-spec/07-DATA-MODEL.md`.
Rules model doc: `docs/COLLAB_SPACE_RULES_MODEL.md`.

## 2. Findings (severity-ranked) and disposition

### Critical — fixed
| # | Finding | Fix |
|---|---|---|
| C1 | **Spell push/pull was a lossy stub** — pushed a human-readable `body` string, installed a single *disabled* inject-prompt rule; all triggers/actions/colors lost | SpaceSpell schema v2: full `rules[]` + `color` + `schemaVersion` pushed (sanitized); install reconstructs the real spell; each rule validated field-by-field at the read boundary (malformed rules from hostile writers dropped); legacy v1 docs still install the safe disabled stub |
| C2 | **Fan-out spoofing** — rules let any member write `linkedLocalIdsByUid.<anyUid>` and (after their first fan-out) append arbitrary uids to `pulledByUids`/`installedByUids`/… | Rules now pin fan-out to the caller: per-uid map keys via `MapDiff.affectedKeys().hasOnly([auth.uid])`; arrays append-only with **set-difference == {caller}** (the naive `caller in newList` check was exploitable — caught by emulator test) |
| C3 | **No teardown on sign-out** — every store kept its Firestore listeners after auth changed; the auth listener itself was never released | `collabTeardown.ts` invoked on any uid transition (and eagerly on signOut); `unsubscribeAll` on messaging/collab stores; `stop()` on joined spaces |
| C4 | **Owner could orphan a space** — both the old and first-pass new rules allowed the owner to remove their own membership (via self-leave or their full-edit branch) | Owner must remain a member with role `owner` on every space update; owner leave denied (delete instead) — caught by emulator test |

### High — fixed
| # | Finding | Fix |
|---|---|---|
| H1 | Missing `onSnapshot` error handlers (messages, channels, repo subs, space doc) — a rules denial or network failure silently froze the UI | Every subscription takes an error callback; stores surface `error` state; sections render error banners with Retry |
| H2 | No update-time revalidation in rules — a 3-char title could be updated to 50k chars; `createdBy`/`createdAt` immutability was only implicit | Final-document shape validation on every update; explicit `coreImmutable()` |
| H3 | Unbounded subscriptions — tasks/teamMembers/spells streamed entire subcollections | All resource subscriptions capped (`limit(500)`); messages already paginated |
| H4 | Drifting denormalized counters (`adoptionCount`, `installCount` via `increment(1)` — not idempotent under retry) | Counters removed from writes and rules; counts derived from uid arrays on read |
| H5 | Pending-message reconciliation by author+content fingerprint — two identical texts sent quickly deduped wrongly | `clientMsgId` written with each message; exact reconciliation (fingerprint kept only for legacy docs); temp ids now `crypto.randomUUID()` (was a cross-tab-colliding counter) |
| H6 | `leave()`/`removeMember()` wrote `members.<uid> = null` — permanent null tombstones in the members map | `deleteField()`; readers also skip malformed entries |
| H7 | Blind `as` casts at every snapshot boundary — malformed docs coerced into wrong types | Validated coercers (`asString`/`asEnum`/…) in every `fromData`; visibility fails closed to `private` |
| H8 | No retry on any Firestore op | `withRetry` (exp backoff + jitter, transient codes only) on all one-shot ops; writes made idempotent via pre-allocated doc refs (space+channel batch, messages, channels) |
| H9 | ~80% copy-paste across the three Space*Client files | Single `createSpaceResourceClient` factory; per-entity clients are coercers + fan-out config |

### Medium — fixed
- `optimisticPulled`/`installing` sets leaking across space switches (reset on `space.id` change).
- `detectRemote` race (stale async result overwriting newer detection) — nonce guard.
- Modal a11y: shared `useModalA11y` (initial focus, Esc, focus restore) + `role=dialog`/`aria-labelledby`/`aria-modal` across section modals; aria-labels on icon-only buttons; status not conveyed by color alone.
- Raw Firebase auth errors shown to users — mapped to actionable copy.
- Message/channel/content validation client-side (length caps with friendly copy) matching rules caps.
- Stubs removed (§4): fake "online" presence, disabled DM/View-profile/Add-admin/emoji/@mention buttons.
- Copy: unified ellipsis, actionable error strings per `06-CONTENT-AND-COPY.md`.
- Ad-hoc hex/rgba colors tokenized across collab stylesheets.

### New capabilities built (locked scope required them; they did not exist at all)
- **Docs tab** — push project docs (content ≤ 200k chars) / pull into a chosen
  session (local docs are session-scoped; picker defaults to most recent),
  provenance + pull fan-out, full states + a11y.
- **Files tab** — upload/download/preview small files, **stored inline in
  Firestore as base64 (600 KiB raw cap)**; message attachments end-to-end
  (composer chips → `Message.attachments` → bubble rendering with lazy image
  previews). *Why not Firebase Storage:* the project's default bucket is not
  provisioned and creating one now requires the Blaze plan — an infra/billing
  action outside this task. The schema isolates `data` so migration to Storage
  paths is mechanical; rules for it are sketched in `COLLAB_SPACE_RULES_MODEL.md`.

## 3. Deferred (with reasons) — the roadmap, unchanged
Realtime presence, DMs, member profile popover, admin role tier beyond
owner/admin/member, email invites + join-request approvals, deep links,
threads/reactions, unread counts, search, notifications
(`08-FULL-VISION-ROADMAP.md`), and **@mention→invoke** (explicitly out of
scope §0.3 — the mention *tagging* data model remains; the no-op integration
point in `useMessagingStore.notifyAgentMentions` documents where invocation
plugs in). Cascade-delete of subcollections on space delete needs a Cloud
Function (Blaze) — orphans are unreachable via rules, cost-only.

## 4. Verification
- `bunx tsc -b` clean across the workspace; `maestro-ui` vitest suite green
  (incl. new tests: firestoreUtils, spell-rule coercion, share builders,
  SpaceAdapters install/pull/adopt, messaging reconciliation, auth teardown).
- `firestore-rules-tests/`: 26 emulator tests green — these caught C2's
  append-any-uid variant and C4's owner-leave hole before deploy.
- Deploy of rules+indexes to `maestro-5f3fc`: see verification log
  (`docs/COLLAB_SPACE_VERIFICATION_LOG.md`) for status.
- Independent adversarial review of the full branch diff was run before the PR;
  its confirmed findings were fixed (see PR description).
