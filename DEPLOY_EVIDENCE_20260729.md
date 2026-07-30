# Dev push + tailscale-server redeploy — Evidence (2026-07-29)

## A) GitHub — developments pushed

Local `staging` commits were **already** on `origin/staging` (remote was 10+ commits ahead). The
only unpushed work was an uncommitted working tree (~884 lines). Because that UI work is built on
a redesign the team **deliberately reverted** on `staging` (`Revert "feat(ui): redesign phase…"`),
it was landed as a **PR branch** (not force-rebased onto shared `staging`), preserving all work and
letting the team decide whether to re-adopt the redesign.

| Item | Value |
|------|-------|
| Commit | `d2b9655fbc26b188cc21bd0bd89fcce345df0468` |
| Author | manzilshaik95 <manzilshaik95@gmail.com>, 2026-07-29 16:44 UTC |
| Branch (pushed) | `feat/messaging-pipeline-glass` → `origin` ✓ |
| Pull Request | **#189** — https://github.com/subhangR/agent-maestro/pull/189 (OPEN, base `staging`) |
| Diff | 25 files, +1520 / −97 |
| Safety backup | local branch `backup/pre-rebase-20260729` @ `810a3ec` |

Contents: CLI GLM/Kimi spawners + agent-spawner/manifest wiring · server `LogDigestService`,
`sessionRoutes`, `WorkspaceFsService`, `GitService`, `types` · UI `ThreadPanel`,
`PipelineVisualization` + `derivePipeline`, messaging view/store/bubble, Firebase `MessagingClient`.

Build junk deliberately **excluded** (accidental redirect files `dist===`, `dist-gateway===`,
and `dist-gateway.pre-glass-*` backup dir).

## B) Tailscale server (this host = `maestro`, 100.101.22.61) — maestro-server redeployed

Deployed the **canonical `staging`** (`34fcd4a2`, in sync with `origin/staging`) — not the
unreviewed PR branch — so the live node runs reviewed code and picks up the 10+ upstream commits
(decouple-architecture, firebase-functions dep locks, etc.).

| Step | Result |
|------|--------|
| `bun install` | clean |
| `maestro-ui` `build:web` | ✓ built (`maestro-ui/dist/index.html` 16:51) |
| `maestro-server` `build` (tsc) | ✓ clean (`maestro-server/dist/server.js` 16:51) |
| `systemctl restart maestro-server` | active/running, MainPID 463375, started 16:51:33 UTC |
| Startup log | clean (WebSocket bridge subscribed to 58 events; container initialized) |
| Health `http://127.0.0.1:4570/` | **200** |
| Health `https://maestro.tail28ac62.ts.net/` (Tailscale Serve) | **200** |

Note: a Firebase **functions/hosting deploy was intentionally NOT run** — the chosen scope was
"redeploy the maestro server here," which serves the Firebase-backed messaging SPA from
`maestro-ui/dist`.
