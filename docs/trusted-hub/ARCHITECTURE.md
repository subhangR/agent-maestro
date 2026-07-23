# Maestro → Cloud Service: Architecture Understanding & Design

> Status: discussion draft · 2026-07-22 (revised after team framing call)
> Task: `task_1784658161586_lzxikczyl` — Understand Maestro Architecture
> Goal (revised): a **shared team hub on a single server** where a small **trusted team** each gets their own Maestro workspace, **pools AI subscriptions + compute**, collaborates (messaging + shared entities/folders), and runs **autonomous long-running agents** — with **zero-setup, link-based onboarding**. Open-source core stays open source. This is a *team enablement tool first*, not a SaaS-for-strangers.

---

## Part 0 — The real goal (reframe, 2026-07-22)

The point is **NOT money or marketing** ("avi osthay" — those will come). The point is **ease of people getting stuff done together**: onboarding + communication + execution + review, back and forth. The users are the **founding team itself** (~4–5 now, ~5 more if onboarding is trivial — e.g. Tarkesh on a 4GB laptop).

### The 4 pillars
1. **Scaling compute** — stop needing a personal PC always-on to run branching, long-running agents. Move to an always-on server (bonus: lower downtime since someone's always using it).
2. **Ease of onboarding** — share a link, works out of the box, **zero local setup**. A weak laptop must not be a blocker.
3. **Collaboration efficiency** — ultimate ask: **10 members in one space, running agents in parallel, messaging each other, sharing entities.**
4. **Autonomous long-running tasks** — agents that branch out and run for hours without the owner's machine on.

Economic core underneath all four: **pooling** of `(agent compute + AI subscription)` across the team.

### Explicit product decisions
- **Open-source core stays open source** (unchanged).
- **NOT the Cursor model** (desktop app + paid cloud sync + local↔cloud sync gated behind a plan). Instead: a **collab-first model** — shared workspace, subscription sharing, folder sharing.
- **Money/marketing are downstream**, not the current driver. Build the internal team hub first.

### The critical re-scope vs Parts 3–7 below
Parts 3–7 were written for a **hardened, adversarial multi-tenant SaaS**, where the sandboxed compute runner is ~80% of the cost. **The team is trusted** ("maname"), so:
- **Compute isolation drops to soft/organizational**, not a security sandbox → **share the box** (tier-1 `LocalRunner`, which already works). MicroVM/container isolation is **deferred**, not Level-1.
- **Isolation now means workspace organization + explicit sharing** (your space vs shared spaces; shared folders/entities/subscription), not a tenant security boundary.
- **Subscription pooling + routing** across a few shared subscriptions becomes the economic center (was per-user BYO).
- **Collab / messaging is Level-1 scope** (was "future").
- **Onboarding = share a browser link** via `maestro-web`, 0 install (was signup/provisioning).

### Level-1 concrete plan
- **Single server** (e.g. Hetzner) — not per-person PCs.
- **Per-user Maestro workspaces** on that one box.
- **Pooled / routed AI subscriptions** — one underlying subscription, or a router spreading load across several.
- **Collab as the communication channel** at Level 1.
- Everyone trusted → shared `LocalRunner` compute, soft workspace separation.

### New real work at Level 1 (what's actually left to build)
1. **Per-user workspaces** — light identity + a workspace concept over the existing single-`DATA_DIR` model (soft separation, not hardened tenancy).
2. **Subscription pool / router** — the credential resolver (Part 5) becomes a **load-balancing pool** across N shared subscriptions, with **rate-limit failover**.
3. **Collab / messaging channel** — member-to-member comms + shared entity/folder visibility inside a space.
4. **Link-based, zero-setup onboarding** — browser (`maestro-web`) as the front door; invite link → in a workspace → running agents.

Most of the rest (shared-box runner, single-server deploy, nginx/systemd/Tailscale scripts) is **already ~80% built** — Level 1 is close to the existing shared-box deployment plus the four items above.

### ⚠️ Subscription-pooling caveat
If the pooled subscriptions are Claude Max/Pro (`claude login` OAuth seats), sharing many humans onto them risks **rate limits + TOS** on shared seats — this is exactly why routing across *multiple* subscriptions helps (spread load). **API keys (pay-per-token) pool cleanly; subscription seats are the grey area.** Design the router for clean rate-limit failover.

---

> **Note:** Parts 1–2 (current architecture) remain accurate. Parts 3–8 describe the *fuller* hardened-SaaS end state — keep them as the long-term north star, but Level 1 follows **Part 0**, not the sandboxed-runner path.

---

## Part 1 — What Maestro is today

A **multi-agent orchestration system** built as a monorepo. The server is the brain; everything else is a client over the same channels.

### Monorepo layout
| Package | Role |
|---|---|
| `maestro-server` | The brain — Express 5 + WebSocket + `node-pty`. Clean/hexagonal architecture. |
| `maestro-cli` | Thin REST client agents use to report progress, spawn siblings, manage tasks. **This session runs through it.** |
| `maestro-ui` | Tauri desktop app. |
| `maestro-web` | Browser client. |
| `maestro-mobile` | Expo/React Native remote conductor. |
| `maestro-pty-protocol` | Shared PTY wire protocol. |

### Server internals (`maestro-server/src`)
Clean architecture, one-directional: `domain` → `application` → `infrastructure` → `api`.

Three concerns flow through the server:

1. **Entities** — projects, tasks, teams, team-members, spells, sessions, orderings, task-graphs, model-profiles, ensembles. CRUD via REST (`api/*Routes.ts`), persisted through **`FileSystem*Repository`** classes to `~/.maestro/data`. **No database** — flat files on disk behind clean `I*Repository` domain interfaces.
2. **Sessions = real PTY processes.** `PtyHostService` spawns an agent CLI (`claude`, `codex`, …) as an actual pseudo-terminal **on the server host machine** via `node-pty`. Output streams over a `/pty` WebSocket with an offset-tracked scrollback ring buffer for reconnect/replay (`OutputBuffer` + `TerminalStateMirror`).
3. **Realtime fan-out** — a second WebSocket (`WebSocketBridge`) broadcasts every entity change to **all** connected clients, which reconcile via `batchSet` coalescing.

### Storage & config
- `DATA_DIR` (default `~/.maestro/data`) — entities.
- `SESSION_DIR` (default `~/.maestro/sessions`) — session logs + manifests.
- `MAESTRO_PTY_HOST` — toggles PTY host between `server` (VPS/headless) and desktop (Tauri).

### Auth (current)
`AuthService` — a **single shared password** (`MAESTRO_AUTH_PASSWORD`) → HMAC-signed token in a cookie. Off by default (`MAESTRO_AUTH_ENABLED`). Rate-limited, 7-day token expiry. **No per-user identity.**

### Deploy (already sketched)
`deploy/` has VPS + nginx + systemd + EC2/Tailscale scripts. `MAESTRO_PTY_HOST=server` already exists. So "put it on a server behind a VPN and share it" essentially works **today**.

---

## Part 2 — The core constraint

Maestro is architecturally **single-tenant and single-host**:

- **One `DATA_DIR` = one global workspace.** All projects/tasks/sessions in one flat namespace. **No `tenantId` / `userId` / `owner` anywhere in the data model** (verified by grep).
- **Auth is one shared password.** No identity.
- **Realtime broadcasts everything to everyone** — no per-user scoping.
- **Agents run on one box, one OS user, one `claude login`.** Every session shares that machine's filesystem, git, and agent credentials.

This is why "make it a cloud service so multiple people can share a workspace" forks sharply depending on what "share" means. **Decision made: isolated workspaces per team (true multi-tenancy), with compute isolation offered as a tier.**

---

## Part 3 — Target architecture: split into 4 planes

Today the server fuses everything into one process on one box. To become a service, separate these concerns. The codebase is already seamed for three of the four.

```
┌─────────────────────────────────────────────────────────────┐
│  CONTROL PLANE  (stateless, horizontally scalable)           │
│  Express API + AuthService(→ real identity) + entity CRUD    │
│  Every request carries {userId, tenantId}; repos scope by it │
└───────────────┬──────────────────────────┬──────────────────┘
                │                           │
     ┌──────────▼─────────┐      ┌──────────▼───────────────┐
     │  DATA PLANE        │      │  REALTIME PLANE          │
     │  I*Repository →    │      │  WebSocketBridge, but    │
     │  Postgres (or      │      │  fan-out FILTERED by     │
     │  per-tenant dir)   │      │  tenant/room, not global │
     └────────────────────┘      └──────────────────────────┘
                │
     ┌──────────▼──────────────────────────────────────────┐
     │  COMPUTE PLANE  (the hard part — the PTY/agent host) │
     │  PtyHostService → RunnerPort:                        │
     │    • "shared"   → node-pty on the box   (tier 1)     │
     │    • "sandboxed"→ container/microVM/pod  (tier 2)    │
     │  Each runner gets: tenant's workspace volume +       │
     │  the chosen agent credential (shared OR user BYO)    │
     └──────────────────────────────────────────────────────┘
```

---

## Part 4 — Changes at each seam

### 1. Tenancy in the data model (foundational)
Add `tenantId` (+ `ownerId`/`createdBy`) to every entity. Today there is nothing. Touches `types.ts` + every entity — mechanical. New entities: `Tenant`, `User`, `Membership` (user↔tenant, with role).

### 2. `AuthService` → real identity
Already token-based. Extend the token to a real JWT carrying `{ sub: userId, tenantId, role }`. Add signup/login/invite + middleware that resolves `tenantId` from the token into a per-request context. Keep the shared-password mode as a single-tenant self-host fallback.

### 3. `I*Repository` → tenant-scoped store
The **clean** part — every repo already implements a domain interface. Two options:
- **Fast/cheap:** keep FileSystem repos, one `DATA_DIR` per tenant (`~/.maestro/tenants/<tenantId>/data`). Zero repo rewrites, hard filesystem isolation, but doesn't scale past one node.
- **Proper:** implement `Postgres*Repository` behind the same interfaces, every query filtered by `tenantId` (row-level security). The real SaaS answer; the interface seam makes it a drop-in.

### 4. Realtime fan-out must be scoped
Today `WebSocketBridge` broadcasts every change to everyone — a **data leak** under isolation. Make it room-based: a socket joins its `tenantId` room and only receives that tenant's events. Small, critical.

### 5. `PtyHostService` → `RunnerPort` (compute plane — the real engineering)
`PtyHostService` already abstracts spawning; `MAESTRO_PTY_HOST` already toggles behavior. Introduce a `RunnerPort` interface with two implementations:
- **`LocalRunner` (tier 1, shared box):** today's `node-pty` path. Fine for a trusted tenant. Keep it.
- **`SandboxedRunner` (tier 2, isolated):** each session runs inside a per-tenant (ideally per-session) container/microVM — Docker to start, then Firecracker / gVisor / Fly Machines / E2B. Mounts **only** that tenant's workspace volume; gets **only** that session's credential. Server talks to it over the same `/pty`-style stream, so UI/mobile clients don't change.

Per-tenant tier choice becomes a workspace setting.

---

## Part 5 — Agent credentials (both supported)

A **credential resolver** injected at spawn time, per session (the spawn config already carries `env` — the credential slots in there):
- **Shared platform account:** server holds one org-level Claude/Codex auth; injected into runners as a secret. Everyone bills to the platform. Good for a free tier / single-org deployment.
- **Per-user BYO:** user stores their own key/OAuth (encrypted at rest, per-tenant KMS/secret store); their sessions inject their credential. Needed for real isolation + per-user billing.

The policy ("this workspace uses shared / this user uses their own") is a lookup, not plumbing.

---

## Part 6 — Why this is tractable

The three abstractions to bend — `I*Repository`, `AuthService`, `PtyHostService` — **already exist as clean seams**. The genuinely new engineering:
1. Tenancy columns/scoping everywhere.
2. Scoped realtime rooms.
3. The `SandboxedRunner`.

Everything else is injection at existing seams.

---

## Part 7 — Suggested phasing

| Phase | Scope | Payoff |
|---|---|---|
| **0 — Identity & tenancy** | `User`/`Tenant`/`Membership`, JWT auth, `tenantId` on entities, request-context middleware. No isolation yet. | "Who are you" |
| **1 — Data isolation** | Tenant-scoped repos (start with per-tenant `DATA_DIR`) + scoped realtime rooms. | Workspaces genuinely private |
| **2 — Credential model** | Shared + BYO resolver, encrypted secret store. | Per-user/per-org agent auth |
| **3 — Compute isolation** | `RunnerPort` + `SandboxedRunner` (Docker → microVM). Per-workspace tier. | **True "cloud service"** |
| **4 — Scale/ops** | Postgres repos, multi-node control plane, runner autoscaling, billing/quotas. | Production SaaS |

---

## Part 8 — Open items / flags

- **Compute isolation is ~80% of the total cost.** Everything else is a few weeks; the sandboxed runner is where the real work and the real infra bill live.
- **Firebase pieces in the repo** (`firestore.rules`, `maestro-web`, Firebase deps) look like an **earlier parallel stab** at cloud. Decision needed: build the SaaS layer on **Firebase/Firestore** or the **Postgres** path sketched here.
- **⚠️ Security:** a `firebase-adminsdk-*.json` service-account key is committed at the repo root. That is a live secret — **rotate and remove from history**.

---

## Decisions locked so far
- Sharing model: **isolated workspaces (SaaS)** — with team-level isolation; members within a team share their team's workspace.
- Agent auth: **both** — shared platform account *and* per-user BYO keys.
- Compute isolation: **tier 1 (shared box, already have it) + tier 2 (sandboxed runners)**.

## Next decision point
Pick where to go deeper: **compute/runner design** · **tenancy data model** · **Firebase-vs-Postgres**.
