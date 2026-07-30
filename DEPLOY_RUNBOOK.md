# Maestro Hub Deploy Runbook

**Updated:** 2026-07-30  
**Context:** The previous deploy scripts (`scripts/deploy-local.sh`, `scripts/deploy-hub.sh`) called
`sudo systemctl restart maestro-server` unconditionally. This killed every in-flight agent session
on the box — including the one that triggered the deploy. This runbook documents the fixed flow.

---

## The Restart Hazard (know this)

`maestro-server` is the process that hosts ALL agent sessions on this box. Restarting it:
- Kills every running Claude agent process (PTY)
- Silently discards all uncommitted work those agents had in flight
- Terminates the maestro-server process itself — so if an agent script triggers the restart,
  the agent dies mid-task without any error or report

**The deploy scripts now refuse to restart by default.** The restart step is human-gated.

---

## Service map

| Tailscale URL | Local port | systemd unit |
|---------------|-----------|--------------|
| `maestro.tail28ac62.ts.net:443` | `127.0.0.1:4570` | `maestro-server.service` |
| `maestro.tail28ac62.ts.net:8443` | `127.0.0.1:4580` | `maestro-gateway.service` |

Both are defined in `/etc/systemd/system/maestro-*.service`.  
Server env lives in `/etc/maestro/maestro.env`; gateway env in `/etc/maestro/gateway.env`.

---

## Standard deploy (two-phase)

### Phase 1 — Build (agents safe to run this)

```bash
cd /home/ubuntu/agent-maestro
./scripts/deploy-local.sh [--skip-ui]
```

- Pulls latest code from `origin/<current-branch>` (skip with `--skip-pull`)
- Installs deps, builds all packages (server, CLI, gateway, optionally UI)
- Does **NOT** restart any service
- Safe to run with active agent sessions

Output will end with a reminder to run Phase 2.

### Phase 2 — Restart (human only, after checking sessions)

**Check first:**
```bash
maestro master sessions --active
# OR:
curl -s http://127.0.0.1:4570/api/sessions?active=true | python3 -m json.tool
```

Wait for all sessions to reach a safe stopping point, then:

```bash
./scripts/deploy-local.sh --skip-pull --skip-ui --restart
```

The script will:
1. Re-check for active sessions via the API and **abort** if any are found
2. If all clear: `sudo systemctl restart maestro-server && maestro-gateway`
3. Run the gateway health check and verify the live commit matches the built SHA

---

## Emergency override (force-restart with live sessions)

Only use this if sessions are stuck/zombie or you are certain the interruption is acceptable:

```bash
./scripts/deploy-local.sh --skip-pull --skip-ui --restart --force
```

With `--force`, the script will:
- List every active session by ID and name
- Wait 5 seconds (Ctrl-C window)
- Then restart (killing all listed sessions)

---

## Remote deploy from a developer machine

```bash
# Phase 1: build only (safe)
./scripts/deploy-hub.sh [--skip-ui]

# Phase 2: restart (after confirming sessions are clear)
./scripts/deploy-hub.sh --skip-ui --restart
```

Same `--force` escape hatch applies.

---

## Full flag reference

### `scripts/deploy-local.sh`

| Flag | Effect |
|------|--------|
| _(none)_ | Pull, install, build all (no restart) |
| `--skip-pull` | Skip git fetch/merge; build current tree |
| `--skip-ui` | Skip the ~90s `build:web:gateway` step |
| `--restart` | Also restart services after building |
| `--restart --force` | Restart even if active sessions exist |

### `scripts/deploy-hub.sh`

Same flags plus `--target <user@host>` (default: `ubuntu@maestro`).

---

## Health verification

After restart, verify the live commit:

```bash
GW_PORT=4580
curl -s http://127.0.0.1:${GW_PORT}/gateway/health | python3 -m json.tool
# Expect: "commit": "<target-sha>"

curl -s http://127.0.0.1:4570/health
# Server health endpoint
```

Check public Tailscale URLs:
```bash
curl -sk https://maestro.tail28ac62.ts.net:8443/gateway/health | python3 -m json.tool
```

---

## Rollback

```bash
git checkout <previous-branch-or-sha>
./scripts/deploy-local.sh --skip-pull [--skip-ui]
# Then: ./scripts/deploy-local.sh --skip-pull --skip-ui --restart  (when sessions clear)
```

---

## Pipeline audit summary (2026-07-30)

**Rating: 4/10**

| Area | Status | Notes |
|------|--------|-------|
| `build:server` | ✅ Clean | tsc, no errors |
| `build:cli` | ✅ Clean | tsc, no errors |
| `build:gateway` | ✅ Clean | tsc + git-sha stamp |
| `build:web:gateway` | ✅ Builds | ~90s, needs 6GB heap |
| `build:all` | ✅ Fixed | Gateway added at b8887559 |
| Server unit tests | ⚠️ Partial | 67 tests in 8 suites gate CI; 25+ min full suite does not |
| UI/Vitest (687 tests) | ❌ Not in CI | Listed in release.yml comment as "worth adding" |
| CLI tests | ❌ Not in CI | Not gated anywhere |
| Integration/E2E | ❌ None | No smoke test exists |
| Hub deploy CI | ❌ None | `build:web:gateway` never built in CI |
| Deploy safety | ✅ Fixed | Deploy now refuses restart when sessions active |

**Key gaps:**
1. No CI workflow builds the actual hub artifact (`build:web:gateway`/`dist-gateway/`). A deploy can succeed CI but produce a broken hub bundle.
2. The test gate runs ~22% of the server test suite; slow tests and all UI/CLI tests are unguarded.
3. No smoke test or post-deploy integration check beyond the health-endpoint commit comparison.
4. `scripts/` has no CI coverage — deploy logic changes are not tested.

**Quick wins** (not in scope of this task, but worth noting):
- Add a `test:ci` job that runs the full Vitest suite (fast, ~70s)
- Add `build:hub` to a nightly CI job to catch web-bundle breakage
- Add a post-deploy smoke test that hits `/gateway/health` and checks `commit` matches
