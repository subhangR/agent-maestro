# Deploy runbook — make PR #189 (glass/messaging) live on the tailscale host

Goal: deploy branch `feat/messaging-pipeline-glass` @ `d2b9655f` and restart BOTH services so
that the `:8443` (gateway → 4580) and `:443` (maestro-server → 4570) tailscale endpoints serve
the new UI bundle. Both endpoints must end up serving the SAME freshly-built asset hash.

Working dir: `/home/ubuntu/agent-maestro`

## Context you must know (verified by coordinator)
- `:8443` tailscale URL → `127.0.0.1:4580` = systemd unit `maestro-gateway.service`.
- `:443` tailscale URL → `127.0.0.1:4570` = systemd unit `maestro-server.service`.
- Today's earlier redeploy restarted ONLY maestro-server, so the gateway on :8443 is stale.
- Current checkout is branch `staging` @ 34fcd4a2. Working tree has NO uncommitted tracked
  changes (verified) — only untracked files (DEPLOY_EVIDENCE_20260729.md, dist=== backup dirs).
  A branch switch is safe. Do NOT delete the untracked files.
- The maestro-server `/health` endpoint reports the built commit — use it to verify.

## Steps (run in order, stop and report if any step fails)

1. Guard: confirm no uncommitted tracked changes.
   `cd /home/ubuntu/agent-maestro && git status --porcelain=v1 --untracked-files=no`
   Expected: EMPTY output. If NOT empty, STOP and report to coordinator — do not proceed.

2. Fetch + switch to the PR branch.
   `git fetch origin`
   `git checkout feat/messaging-pipeline-glass`
   `git pull --ff-only origin feat/messaging-pipeline-glass`
   Confirm: `git rev-parse HEAD` starts with `d2b9655`. If not, STOP and report.

3. Install deps clean.
   `bun install`

4. Build everything the tailscale host serves (UI, server, gateway, CLI).
   `bun run build:ui`        (vite build; sets its own heap; may take a few minutes)
   `bun run build:server`
   `bun run build:gateway`
   `bun run build:cli`
   All four must exit 0. If any fails, STOP and report the exact error.

5. Record the freshly-built UI asset hash for verification.
   `grep -oE 'assets/index-[a-zA-Z0-9._-]+\.js' maestro-ui/dist/index.html | head -1`
   Call this NEWHASH.

6. Restart BOTH services.
   `sudo systemctl restart maestro-server maestro-gateway`
   Then: `systemctl is-active maestro-server maestro-gateway` → both must say `active`.
   (If sudo prompts for a password and cannot proceed non-interactively, STOP and report —
   the coordinator/user will run this step.)

7. Verify all three match NEWHASH:
   a. on-disk: `grep -oE 'assets/index-[a-zA-Z0-9._-]+\.js' maestro-ui/dist/index.html | head -1`
   b. :443/4570: `curl -sk --max-time 5 http://127.0.0.1:4570/ | grep -oE 'assets/index-[a-zA-Z0-9._-]+\.js' | head -1`
   c. :8443/4580: `curl -sk --max-time 5 http://127.0.0.1:4580/ | grep -oE 'assets/index-[a-zA-Z0-9._-]+\.js' | head -1`
   All three must equal NEWHASH.

8. Verify the server health commit:
   `curl -sk --max-time 5 http://127.0.0.1:4570/health`
   The `commit` field must start with `d2b9655`.

9. Verify the public tailscale URLs (should mirror the local ports):
   `curl -sk --max-time 8 https://maestro.tail28ac62.ts.net:8443/ | grep -oE 'assets/index-[a-zA-Z0-9._-]+\.js' | head -1`
   `curl -sk --max-time 8 https://maestro.tail28ac62.ts.net/ | grep -oE 'assets/index-[a-zA-Z0-9._-]+\.js' | head -1`
   Both should equal NEWHASH.

## Report back
Report the outcome to coordinator session `sess_1785344312616_jtgsmc5ys` with:
- git HEAD short hash, NEWHASH, and the three asset hashes from step 7,
- both services' is-active state,
- the /health commit field,
- the two public-URL hashes from step 9,
- any step that failed with its exact error.
Use: `maestro session prompt sess_1785344312616_jtgsmc5ys --message "<your full status>"`

## Rollback (only if something breaks badly)
`git checkout staging` then repeat steps 3–6, or restore branch `backup/pre-rebase-20260729`.
