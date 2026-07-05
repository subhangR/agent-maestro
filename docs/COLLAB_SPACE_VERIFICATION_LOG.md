# Collab Space Hardening — Verification Log

Branch `feat/collab-hardening` @ 2026-07-05. Companion to
`docs/COLLAB_SPACE_ARCH_REVIEW.md` and `docs/COLLAB_SPACE_RULES_MODEL.md`.

## Automated verification (all executed on this branch)

| Check | Result |
|---|---|
| `bunx tsc --noEmit` (maestro-ui) | ✅ clean |
| `bunx tsc -b` (maestro-server) | ✅ clean |
| `bunx tsc -b` (maestro-cli) | ✅ clean |
| maestro-ui vitest suite | ✅ 277/278 — the 1 failure (`ResourcesView.test.tsx` "clicking a doc calls openDocument") **fails identically on the staging baseline**; pre-existing, unrelated to collab (Resources doc viewer) |
| maestro-server Jest (`--forceExit`) | ✅ 183 passed, 8 todo, 0 failed |
| Firestore rules emulator suite (`firestore-rules-tests/`, 26 tests) | ✅ 26/26 |

New collab-specific unit coverage (86 tests across 6 files):
`firestoreUtils` (retry/backoff, sanitizers, coercers), `spaceSpellRulesFromData`
(v2 rule validation incl. server-matrix mirroring), `useSpaceSharing` builders
(lossless spell push, status mapping), `SpaceAdapters` (install v2/legacy/
conflict/replace, pull, adopt), `useMessagingStore` (clientMsgId reconciliation,
retry, teardown), `useFirebaseAuthStore` (teardown on uid change, friendly errors).

## Security properties proven by the emulator suite

- Private spaces unreadable (root + subcollections) to non-members/anonymous.
- Author/creator identity unforgeable; provenance (`createdBy`/`createdAt`)
  immutable on update; size caps re-validated on update.
- Fan-out pinning: a member can record only **their own** pull/install/download
  (the suite caught and killed two real holes during development: append-any-uid
  after first fan-out, and owner self-leave orphaning a space).
- Self-join only on public spaces, only as `member`, only adding yourself;
  admins can never demote/remove the owner; only the owner deletes the space.
- Message content cap enforced; attachment-only messages allowed (≤10 refs);
  default-deny on unknown collections.

## Independent adversarial review

A second-model adversarial review of the full branch was run before the PR.
Verified-clean: every client write permitted by the rules, all cross-layer
attachment/doc/spell contracts aligned, base64 round-trip correctness, no
listener leaks. Its confirmed findings (attachment orphaning H1, spell
schedule-trigger contract mismatch M1, plus three low-severity polish items)
were all fixed in commit `90c6077`. Remaining accepted note: on sign-out,
section-level listeners detach via natural React unmount a beat after the
store teardown — a brief cosmetic window, no leak.

## Rules & indexes deploy (§0.4) — ✅ DEPLOYED & VERIFIED LIVE

- `firebase deploy --only firestore --project maestro-5f3fc --force`
  (account `penrosecoder@gmail.com`, 2026-07-05): rules compiled and
  **released**; indexes reconciled — added the missing
  `(githubUrl, memberIds CONTAINS, createdAt DESC)` composite that the
  mine-for-repo queries require, and removed a stale
  `(memberIds CONTAINS, createdAt DESC)` composite no current query uses
  (the joined-spaces subscription deliberately avoids `orderBy`).
- **Live post-deploy probe** (`maestro-ui/scripts/verify-deployed-rules.mjs`,
  run against the real project with a scratch email/password user, self-
  cleaning): **11/11 checks passed** —
  signed-out read denied · valid space create allowed · spoofed `ownerId`
  denied · task push allowed · own pull fan-out allowed · cross-uid fan-out
  denied · oversized update denied · owner self-leave denied · cleanup
  (task, space, scratch user) all succeeded.

## Manual end-to-end pass (UI layer)

The deployed data layer is live-verified above; the emulator suite covers the
full security model. The remaining signed-in UI walkthrough (needs the owner's
own account in the running app):

1. Sign in (Google or email) → Collab tab lists repo spaces.
2. Create a space → default `#general` exists; send/edit/soft-delete messages.
3. Attach a small file to a message → chip renders, image previews inline,
   file does NOT appear in the Files tab; delete the message → file doc gone.
4. Files tab: upload (caps enforced incl. zero-byte), download, delete.
5. Push + pull a task, adopt an agent persona.
6. Publish a spell → install on the other side → **all rules/triggers/colors
   arrive enabled exactly as authored** (v2 lossless round-trip).
7. Docs tab: push a project doc, pull it into a chosen session; confirm it
   appears in the project's Docs panel.
8. Sign out mid-session → no permission-denied spam, all live updates stop.
