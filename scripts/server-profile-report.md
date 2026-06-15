# Maestro Server Resource Profile

**Captured:** 2026-06-14 01:22 (macOS, `scripts/profile-server.sh`)

Two maestro server processes are live on this machine. Profiled both.

| | Dev / web stack | Prod (Maestro.app) |
|---|---|---|
| PID | 5456 | 98907 |
| Process | `node maestro-server/dist/server.js` | bundled `maestro-server` binary |
| Port | 4570 | 2357 |
| Uptime | 91 min | 118 min |
| WS clients | 3 | 1 |
| Open FDs | 178 | 24 |
| Threads | 32 | 10 |
| TCP established | 40 | 1 |
| **Physical footprint** | **251.9 MB** (peak 365.2) | **99.5 MB** (peak 136.6) |
| CPU avg / peak | 0.8% / 0.9% | 1.9% / 11.7% |
| PTY-host children | 20 (≈530 MB total) | 0 |

Shared data store: `~/.maestro/data` = 80 MB, 2824 session files (lazy-loaded — only active sessions + a 7-day index held in RAM).

## Findings

1. **The server process itself is healthy and lightweight.** CPU sits near-idle on both (sub-1% dev, occasional brief spike on prod). RSS is flat across all samples — no monotonic growth, so no obvious leak. Peak footprint > current (365→251 MB dev) means memory was reclaimed by GC.

2. **The dominant memory cost is the PTY children, not the server.** The dev server manages 20 idle terminal `node` children at ~25–28 MB each = **~530 MB**, more than 2× the server's own 251 MB. If overall memory pressure is the concern, terminal lifecycle (reaping idle/dead session terminals) is the lever, not the server core.

3. **MALLOC virtual vs resident is normal.** e.g. dev `MALLOC_MEDIUM` reserves 768 MB virtual but only ~1.7 MB resident — that's V8/malloc arena reservation, not real usage. Judge by *Physical footprint*, not VSZ.

4. **FD/thread counts scale with connections.** Dev has 178 FDs / 40 established TCP (3 WS clients + 20 child PTYs + data files); prod is minimal at 24 FDs. Nothing approaching ulimit.

## How to reprofile

```bash
scripts/profile-server.sh                      # auto-detects dev server (dist/server.js)
PID=98907 PORT=2357 scripts/profile-server.sh  # prod Maestro.app server
SAMPLES=12 INTERVAL=5 scripts/profile-server.sh # longer CPU window
```

The script reports: uptime + WS clients, FDs/threads/TCP, `vmmap` memory breakdown (physical footprint + malloc zones), interval-accurate CPU/RSS sampling via `top`, per-child PTY RSS, and data-store size. It is read-only / non-invasive — no attach, no restart, safe against the running prod process.

## Note on built-in metrics

Neither server exposes memory/CPU over HTTP today — only `/health` (status + uptime) and `/ws-status` (client count). If you want continuous in-process metrics (V8 heap used/total, `process.cpuUsage()`, eventloop lag), the clean follow-up is a `/metrics` route returning `process.memoryUsage()` + `process.cpuUsage()`. Left out here to keep this task non-invasive (would require rebuild + restart of the running prod server).
