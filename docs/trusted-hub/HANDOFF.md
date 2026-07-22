# Maestro Trusted-Team Hub — Compiled Handoff

> Compiled 2026-07-22 from the design discussion (Claude coordinator session, run under the Auto-lvlup project by mistake — **this work belongs to the Agent-maestro project `proj_1770533548982_3bgizuthk`**).
> This folder is self-contained. Start here, then read `ARCHITECTURE.md` (full current-state + long-term north star) in this folder.

---

## 0. TL;DR

Turn Maestro into a **shared team hub on a single always-on server** so a small **trusted team (~10 people)** can each get their **own isolated Maestro workspace**, **pool AI subscriptions + compute**, collaborate, and run **autonomous long-running agents** — with **zero-setup Google-login onboarding**. Open-source core stays open source. This is a **team-enablement tool first**, not a SaaS-for-strangers. Money/marketing are downstream, not the driver.

**The key realization:** half of this is already built. Maestro already ships a hardened **Firebase "Collab Space"** (Jira + Slack). So the genuinely-new work is narrow: a **shared server that pools compute + AI subscriptions and gives each user a private server-side workspace**, unified under one Google login with Collab.

---

## 1. The goal — the ideal user journey (owner's words, locked)

1. **Open the app → login with Google.** *One* login — the same Firebase Google identity logs the user into **both** the Maestro workspace **and** Collab.
2. **New user ⇒ a new workspace is auto-provisioned on the machine.** First login for a `uid` creates a fresh, private Maestro space.
3. **Each user's Maestro space is fully isolated** — their own projects, tasks, sessions, entities. User B logging in gets a *different* space on the *same* server.
4. **Subscriptions are pooled underneath; workspaces are separate on top.** Shared AI subscriptions + shared compute; per-user isolated data.

### The 4 pillars behind it
1. **Scaling compute** — stop needing a personal PC always-on to run branching, long-running agents. Move to an always-on server (bonus: low downtime, someone's always using it).
2. **Ease of onboarding** — share a link, Google login, works out of the box, **zero local setup**. A weak laptop (e.g. 4GB) must not block anyone.
3. **Collaboration efficiency** — ultimate ask: **10 members in one space, running agents in parallel, messaging, sharing entities.**
4. **Autonomous long-running tasks** — agents that branch out and run for hours without the owner's machine on.

Economic core under all four: **pooling** of `(agent compute + AI subscription)` across the team.

---

## 2. Current state of Maestro (what exists to build on)

**maestro-server** — Express 5 + WebSocket + `node-pty`, clean/hexagonal (`domain`/`application`/`infrastructure`/`api`). Three concerns:
- **Entities** (projects, tasks, teams, team-members, spells, sessions, orderings, task-graphs, model-profiles) — CRUD via REST, persisted through **`FileSystem*Repository`** classes to `~/.maestro/data`. **No DB** — flat files behind clean `I*Repository` domain interfaces.
- **Sessions = real PTY processes** — `PtyHostService` spawns an agent CLI (`claude`, `codex`, …) as a pseudo-terminal **on the server host** via `node-pty`. Streams over a `/pty` WebSocket with a scrollback ring buffer for reconnect/replay. `MAESTRO_PTY_HOST=server` already exists.
- **Realtime fan-out** — `WebSocketBridge` broadcasts every entity change to **all** connected clients. ⚠️ Currently global (no per-user scoping) — a data leak under multi-user.

**Config:** `DATA_DIR` (`~/.maestro/data`), `SESSION_DIR` (`~/.maestro/sessions`). **The server is a single process bound to ONE `DATA_DIR` at boot.**

**Auth today:** `AuthService` — single shared password → HMAC token in a cookie. No per-user identity. Off by default.

**Deploy already sketched:** `deploy/` has VPS + nginx + systemd + EC2/Tailscale scripts. "Put it on a server behind a VPN" essentially works today (single-workspace).

### ⭐ The big asset: Firebase "Collab Space" (already shipped + hardened)
Per `docs/maestro-spaces-DECISIONS.md`, north-star: *"Full Jira + Slack on Maestro… the foundation for a future multi-user, multi-agent platform."* Already provides:
- **Spaces** (core/git/personal), membership + roles, hardened `firestore.rules` (`docs/COLLAB_SPACE_ARCH_REVIEW.md`).
- **Slack messaging** — channels, threads, DMs, group DMs, attachments.
- **Jira** — issues + Kanban, sub-issues, estimates, assignees, activity log.
- **Sharing** — files/docs/team-members/teams/spells via push/pull snapshots.
- **Firebase Auth** (Google) + **Firebase Storage**. Client-side clients live in `maestro-ui/src/firebase/*Client.ts`.
- **Decision P6 (locked):** move to **maestro-server-as-gateway** — server holds Firebase auth and proxies CLI reads/writes; CLI never talks to Firebase directly.

**Implication:** collaboration / messaging / sharing / identity are **DONE**. Do **not** rebuild them over `WebSocketBridge`. The trusted-hub only needs the **compute + subscription + per-user-workspace + onboarding** plane, plugged into Collab via P6.

---

## 3. Target architecture — two planes

```
   ┌─────────────────────────────┐      ┌──────────────────────────────┐
   │  COLLAB PLANE (exists)      │      │  COMPUTE PLANE (new work)    │
   │  Firebase Collab Space      │      │  Shared maestro-server on    │
   │  Jira + Slack + sharing     │◄─────┤  a single box (Hetzner):     │
   │  membership, roles          │  P6  │  per-user workspace +        │
   │  Google auth (identity)     │gateway  subscription pool/router +  │
   │                             │      │  pooled PTY agents           │
   └─────────────────────────────┘      └──────────────────────────────┘
        "where we talk & track"               "where agents run"
              (Firebase)                    (the single server)
```

**Same Google login authenticates both planes.** The maestro-server verifies the Firebase ID token, maps `uid → workspace`, and (P6) proxies Collab reads/writes.

---

## 4. THE key fork — how to isolate per-user workspaces on one box

The server is today a single process bound to one `DATA_DIR`. The journey needs N private spaces on one server. Two ways:

### Option A — Process-per-user (workspace = its own server instance) ← RECOMMENDED for L1
A thin **gateway** verifies the Firebase token → maps `uid` → ensures *that user's* maestro-server instance is running (own `DATA_DIR`, own port) → proxies their REST / WS / `/pty` to it.
- ✅ **Near-zero code change** — today's server *already is* a perfect single-user server; run one per user.
- ✅ **Hard isolation for free** (separate process + separate data dir).
- ✅ **Kills the global-broadcast realtime leak automatically** — each instance only holds one user's data.
- ➖ New work = gateway + lifecycle (start-on-login, idle-stop) + Firebase-token verification. RAM per idle node process ≈ 100MB (cheap; the heavy cost is the agent CLIs, which exist either way).

### Option B — Single multi-tenant process (one server, uid-scoped repos)
Refactor the container from singleton repos → a **per-uid repo factory**; scope every request + realtime room by `uid`.
- ✅ More efficient at scale (one process, shared memory).
- ➖ **Bigger, riskier refactor** — touches the container, every route, the realtime bridge, and FileSystem-repo concurrency (10 concurrent writers, no file locking).

**Recommendation:** **Option A for Level-1** (trusted team, ~10 users, max reuse, hard isolation, least code). Migrate to B only when instance count actually hurts. Clean phasing, not a dead end.

> **This A/B is the natural "two designs"** the owner wanted the two `gpt-5.6-sol` workers to develop in parallel: Worker A = process-per-user gateway; Worker B = single multi-tenant server. Both feed off Collab Space for collaboration. See `DESIGN-A.md` / `DESIGN-B.md` (to be produced).

---

## 5. What stays constant either way

### Subscription pool + router (the economic core)
- Independent of the isolation model — injects a credential **per session** at spawn.
- Router spreads load across **N shared subscriptions** with **rate-limit failover**.
- **Mechanism to prove first:** per-session **`CLAUDE_CONFIG_DIR`** (or `HOME`) pointing at a distinct credential dir, so 10 concurrent `claude` processes on one box can each use a *different* pooled subscription simultaneously.

### Collab plane = existing Firebase Collab Space, unchanged
Same Google login flows in. Agents act **as the human user** (Collab decision P2 — no separate bot identity).

---

## 6. Locked decisions

| # | Decision |
|---|---|
| D1 | **Team-enablement tool first**, not SaaS-for-strangers. Money/marketing downstream. Users = the trusted founding team (~4–5 now, ~10 target). |
| D2 | **Open-source core stays open source.** |
| D3 | **NOT the Cursor model** (desktop app + paid cloud sync). A **collab-first model**: shared workspace, subscription sharing, folder sharing. |
| D4 | **Single always-on server** (e.g. Hetzner) hosting **N per-user workspaces**. |
| D5 | **One Google login** (Firebase) → authenticates **both** the Maestro workspace and Collab. |
| D6 | **Per-user workspace is fully isolated** (own tasks/sessions/entities); **subscriptions are pooled/shared** underneath. |
| D7 | **Collab plane already exists = Firebase Collab Space.** Reuse it (Jira+Slack+sharing); don't rebuild. Link via P6 (server-as-gateway). |
| D8 | Agent credentials support **both** a shared pooled account **and** per-user BYO. |
| D9 | Trusted team ⇒ **soft/organizational isolation**, NOT hardened sandboxing (microVM/container sandbox deferred). |
| D10 | **Leaning toward Option A** (process-per-user) for L1 — pending the two-design comparison. |

---

## 7. Open questions / risks to de-risk (in order)

1. **[CRUX] Per-session credential isolation** — can 10 concurrent `claude`/`codex` procs each use a *different* pooled subscription on one box (via `CLAUDE_CONFIG_DIR`/`HOME`)? **Prove this first.** If it works, pooling is easy; if not, you're pushed to API keys (pay-per-token, which pool cleanly but cost more).
2. **Subscription TOS/rate-limits** — pooling many humans onto Claude Max/Pro OAuth *seats* risks rate-limits + TOS. Routing across *multiple* subscriptions is the mitigation. API keys are the safe fallback.
3. **Box sizing** — 10 concurrent agent CLIs + node + gateway will **not** fit in 4GB. Budget **16–32GB RAM** for 10 parallel heavy agents.
4. **FileSystem repo concurrency** — if per-user data stays on FileSystem repos in a *single* process (Option B), 10 concurrent writers risk races (flat-file, no locking). Option A sidesteps this (one writer per instance).
5. **Firebase-vs-local data model** — with Collab on Firebase + P6 gateway, lean toward the shared server being **Firebase-aware**; local FileSystem repos become personal/offline mode, the hub is the source of truth.

---

## 8. Suggested phasing (Level-1)

| Phase | Scope |
|---|---|
| **P0 — De-risk the crux** | Prove per-session `CLAUDE_CONFIG_DIR` credential isolation + the subscription router shape. Prove 2 concurrent agents on 2 different subs on one box. |
| **P1 — Identity** | Firebase Google login in maestro-web; server verifies the ID token; `uid → workspace` mapping. Unify with Collab identity. |
| **P2 — Per-user workspace** | Option A: gateway + per-user server instance + lifecycle (provision-on-first-login, idle-stop). (Or Option B if chosen.) |
| **P3 — Subscription pool/router** | Credential pool across N subscriptions, rate-limit failover, per-session injection. Shared + BYO. |
| **P4 — Onboarding polish** | Invite link → Google login → in your workspace → running agents. Zero setup. |
| **P5 — Collab wiring (P6)** | maestro-server as Firebase gateway; folder/entity sharing surfaced in the hub. |

Most of the single-server deploy plumbing (nginx/systemd/Tailscale) already exists in `deploy/`.

---

## 9. Pointers to existing repo docs (read these)

| Doc | Why |
|---|---|
| `docs/trusted-hub/ARCHITECTURE.md` (in this folder) | Full current-state map + the long-term hardened-SaaS north star (Parts 1–8). **Part 0 = the reframe / source of truth for intent.** |
| `docs/maestro-spaces-DECISIONS.md` | The locked Collab-Space "Full Jira + Slack" decision log (P1–P6, Rounds 1–6). |
| `docs/COLLAB_SPACE_ARCH_REVIEW.md` | Current-state map of the shipped, hardened Collab Space + its clients + rules. |
| `docs/COLLAB_SPACE_RULES_MODEL.md`, `docs/collab-design/design-spec/` | Firestore rules model + data model spec. |
| `deploy/README.md` | The existing single-server VPS deploy (nginx/systemd/Tailscale). |
| `maestro-server/src/application/services/PtyHostService.ts` | Where sessions/agents spawn — the seam the subscription router plugs into. |
| `maestro-server/src/infrastructure/repositories/FileSystem*Repository.ts` | The repo seam for per-user data. |
| `maestro-server/src/infrastructure/websocket/WebSocketBridge.ts` | Realtime fan-out — needs per-user scoping (Option B) or is sidestepped (Option A). |
| `maestro-server/src/container.ts` | Where repos are wired to `DATA_DIR` — the thing Option B refactors. |

---

## 10. Session / task references (for continuation)

- **Coordinating session** ran under **Auto-lvlup** `proj_1770737500750_ncgopleip` (mistake). Final home = **Agent-maestro `proj_1770533548982_3bgizuthk`** (wd `/Users/subhang/Desktop/Projects/maestro/agent-maestro`).
- Two design tasks were created under Auto-lvlup (reconcile/move or recreate in Agent-maestro): `task_1784700490076_e8us9kp2d` (Design A), `task_1784700490364_y87ch2eqa` (Design B).
- Two `openai/gpt-5.6-sol` design worker sessions were spawned but **closed before producing `DESIGN-A.md` / `DESIGN-B.md`**. Re-spawn against the A/B split in §4 to fill those slots.

---

## 11. Immediate next steps

1. **Re-spawn the two design workers** on the A/B split (§4), briefed that Collab already exists (§2) — have them write `DESIGN-A.md` (process-per-user) and `DESIGN-B.md` (single multi-tenant) into this folder.
2. **De-risk the credential crux (§7.1)** in parallel — a 1-hour spike proves or kills subscription pooling.
3. Decide **Option A vs B** from the two design docs.
4. Recreate the tasks under **Agent-maestro** and start P1.
