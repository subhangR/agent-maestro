# Maestro Platform Self-Update — Scorecard & Findings

Date: 2026-07-30 · Branch: `integrate/msg-pipeline-to-main` · 8 commits, none pushed

## The headline finding

**The deploy path was self-destructive.** `scripts/deploy-local.sh` and `deploy-hub.sh`
called `sudo systemctl restart maestro-server` unconditionally. `maestro-server` (and the
`maestro-gateway` children that host per-user instances) is the process tree that runs every
agent session on the box. Any agent that deployed therefore killed itself *and every sibling
agent*, mid-task, discarding uncommitted work.

This is not theoretical: it destroyed the previous Self-Update batch on 2026-07-29 at 21:54.
Four workers (A–F) were marked `failed`; three had hours of finished work stranded uncommitted
in the working tree, and one task (B) was mislabelled `blocked` when it had simply been killed.
Diagnosis: `systemctl show maestro-server -p ExecMainStartTimestamp` (21:54:42) lined up exactly
with the workers' last log lines (21:51–21:54).

Recovering that work was the first action of this round (`b8887559`).

## Ratings

| Surface | Rating | Note |
|---|---|---|
| `firestore.rules` | 9/10 | Default-deny catch-all, membership-gated reads, immutable provenance fields |
| `maestro-mobile` | 7/10 | **Real shipping product, not abandoned** — Expo 54, FCM, SecureStore, wired to prod Firebase |
| `functions/` | 7/10 | One spoofing bug found and fixed |
| Gateway auth | 7/10 | No bypass paths; only `/health` unauthenticated; `verifyIdToken(token, true)` checks revocation |
| `maestro-cli` | 6/10 | Solid four-mode model; semantics/help text had drifted from behaviour |
| `database.rules.json` | 6/10 | One accepted RTDB limitation (cannot cross-reference Firestore) |
| `maestro-ui` | 5/10 | A whole view was dead code (see below) |
| `maestro-web` | 4/10 | Dev diagnostic tool, not a product — no auth by design |
| Build/test/deploy | 4/10 | Builds clean, but ~22% of server tests in CI, UI's 687 tests not in CI at all |

## Fixes landed

**Deploy safety** (`d0c31fc8`, `a7a4c2ea`) — restart is now opt-in (`--restart`), guarded by an
active-session check, `--force` required to override. The first implementation *looked* right but
was verified broken: it probed port 4570 (the standalone server, which never hosts agents) and
reported zero sessions while four ran on gateway children 4604/4605 — false confidence, worse than
the honest bug. Corrected to enumerate gateway children via `MainPID` → `pgrep -P` → `ss -lntp` and
made fail-closed: any unreachable or unparseable instance aborts. Verified live: correctly detected
5 active sessions and aborted.

**Task completion actually completing** (`cdff3a1c`) — `maestro task report complete` PATCHes
`{status:'completed', updateSource:'session'}`, but `TaskService.updateTask`'s session branch
allow-listed only `taskSessionStatuses`, silently discarding `status`. The CLI printed "Task
completed" while the task stayed `in_progress` forever — the cause of ~54 permanently open tasks.
Two commits in this very effort had made it *worse*: `b8887559` added the ineffective payload field
and `bb5d9e75` then removed the pointer to `maestro task complete`, the one command that works.
Sessions may now set `status` but only to `completed`; `cancelled`/`blocked`/`in_review` and all
user-controlled fields stay rejected.

**Session status model** (`624307f0`) — three bugs. `mapSessionState` checked a stale
`needsInput.active` flag *before* `status`, so working sessions rendered as NEEDS INPUT. `detectStuck`
keyed on text-silence only, flagging an agent making 15 rapid tool calls as stuck — the most
productive state there is. And `needsInput.active` was never cleared on resume. Added startup
reconciliation so sessions orphaned by a restart resolve to `stopped` instead of claiming to be live.
Root-caused from a live specimen caught during this run, where `session info` said `working` while
`session logs` said NEEDS INPUT + STUCK for the same session at the same instant.

**UI** (`3f147ef8`, `b8887559`) — `isTree` was checking `strategy === 'queue'`, identical to `isQueue`,
so the hierarchical tree view **never rendered**; the UI's `WorkerStrategy` type had drifted to
`'queue'` while the server uses `'tree'` (zero occurrences of `'queue'` server-side), making every
tree-strategy branch dead code. Restored the session completion banner lost in the 21:54 kill. File
attachment dropped all but the first file.

**Security** (`ee84ec88`, `b8887559`) — `fanoutMessageNotification` trusted client-controlled
`message.authorDisplayName`, so a member could post as "Space Admin" in everyone's push
notifications; now derived from the space's members map. `clientFingerprint` preferred the spoofable
`x-forwarded-for` header over infra-set `request.ip`, letting a caller forge their rate-limit identity.

**CLI semantics** (`bb5d9e75`) — worker bootstrap referenced a non-existent `maestro task start`;
identity prompts contradicted actual behaviour; `spawn --message` was silently dropped without
`--subject`.

## Known gaps (not fixed)

- **Nothing is deployed.** All 8 commits are local and unpushed; the running stack is still the old
  build. The status-model and task-completion fixes only take effect after a deploy — which must now
  be done by a human, when no sessions are running.
- CI does not build the hub artifact (`dist-gateway/`) and does not run the UI's 687 tests.
- `message.mentions` is unvalidated — a member can fake `isMention` for someone. Needs a Firestore
  rule change; inflates badge counts only, no data exposure.
- RTDB `spacePresence` cannot enforce space membership (Firebase cannot cross-reference Firestore).
- Jest leaks open handles ("did not exit one second after the test run"), which makes runs look hung.

## Operational lessons

1. Never let an agent restart `maestro-server`/`maestro-gateway`. Put the prohibition in *every*
   worker prompt. Back up the tree (`git diff > backup.patch`) before any risky batch.
2. A safety guard that fails open is worse than no guard. Verify guards against live state.
3. Verify worker claims. Three of this round's most important findings came from checking reports
   against the box rather than trusting them — including a guard that reported success while broken.
