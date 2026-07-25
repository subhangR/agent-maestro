# Maestro — System Overview (HLD)

> ## ⚠️ LEGACY / REFERENCE — superseded by tm8
>
> This documents the **agent-maestro** world: single-user local Maestro plus the
> Collab V2 Supabase+Firebase hybrid. As of **2026-07-25** that interim path is
> **reference-only**. It is superseded by **tm8** (`~/Desktop/Projects/tm8`) — a
> fresh repo on **plain Postgres**, tm8-native identity, and **no Firebase or
> Supabase anywhere**. See `docs/tm8-architecture/`.
>
> **Retained deliberately** as the truthful record of what exists and what was
> verified. Nothing described here is decommissioned — and nothing here should be
> acted on as a to-do. Outstanding credential asks are **closed**; see
> `06-NEEDS-FROM-USER.md`.


**Status:** 2026-07-25 · Owner: Bedrock · North star: **local-first desktop, cloud as sync layer**

Status legend used throughout this doc set:

- **BUILT** — exists, runs, verified working
- **PARTIAL** — exists but incomplete, unverified, or not wired end-to-end
- **DESIGNED** — specified in a doc; no working implementation

---

## 1. What Maestro is, in one paragraph

Maestro is a **multi-agent orchestration system that runs on your machine**. A local Express server owns all state as JSON files under `~/.maestro/data/`. A Tauri desktop app is the primary interface. Agents are real Claude/Codex processes running in local PTYs, and they act on the system by invoking a CLI (`maestro …`) that talks back to the same local server. Everything essential works with no network and no account.

Cloud services are **additive**. Supabase and Firebase exist to let *multiple humans and machines share* a workspace — they are a collaboration and sync layer bolted onto the side, not the system of record. If every cloud dependency vanished, single-user Maestro would keep working.

That sentence is the single most important architectural fact in this document, and §2's trust model follows directly from it.

---

## 2. Component map

```
┌──────────────────────── YOUR MACHINE (trusted) ─────────────────────────┐
│                                                                          │
│   ┌───────────────┐         ┌────────────────────────────────────┐      │
│   │  maestro-ui   │◄───────►│          maestro-server            │      │
│   │  Tauri + React│  REST   │  Express · CommonJS · Clean Arch   │      │
│   │  23 Zustand   │   +WS   │  DI container · Zod-validated API  │      │
│   └───────┬───────┘         └──────┬──────────────────┬──────────┘      │
│           │ spawns PTY             │ owns             │ emits           │
│           ▼                        ▼                  ▼                 │
│   ┌───────────────┐      ┌──────────────────┐  ┌──────────────┐        │
│   │ Agent process │      │ ~/.maestro/data/ │  │ WebSocket    │        │
│   │ claude │codex │      │  JSON, atomic wr │  │ bridge, 50ms │        │
│   └───────┬───────┘      └──────────────────┘  └──────────────┘        │
│           │ runs                                                        │
│           ▼                                                             │
│   ┌───────────────┐                                                     │
│   │  maestro-cli  │──── REST ────► maestro-server (same box)           │
│   └───────────────┘                                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                    ════════════════╪══════════ TRUST BOUNDARY ══════════
              maestro-server is the SOLE crossing point. Clients hold NO
              Supabase key and NO Firebase token — they never cross it.
                                    │
                                    ▼
┌──────────────────────── CLOUD (untrusted) ──────────────────────────────┐
│  Supabase Postgres ◄── RLS authorization                                │
│      ▲  server mints short-TTL caller-scoped JWTs (SIGNING key,         │
│      │  NOT service-role) — so RLS still bounds the server itself       │
│  Firebase Auth ── prod identity, verified SERVER-TO-SERVER only         │
│  Firebase RTDB (presence)   Firebase Storage (attachments, NOT PROV.)   │
│  Firebase Functions (signed-URL broker, FCM drainer — service-role)     │
└──────────────────────────────────────────────────────────────────────────┘
```

**The boundary property (settled 2026-07-25, "Reading B").** Exactly one component crosses into the cloud: maestro-server. Clients — UI, CLI, agents, future MCP — authenticate to it and nothing else, and hold no cloud credential of any kind. Firebase remains production human identity but is verified server-to-server, invisible to clients. Dev identities are server-issued through the same token path (no emulator).

Crucially the server holds a **signing key, not a service-role key**, so Postgres RLS still bounds the server itself. See `02-TRUST-AND-AUTH.md` §3.

---

## 3. Components in detail

### 3.1 maestro-server — **BUILT**

Express + WebSocket, CommonJS, strict Clean Architecture with a hand-rolled DI container (`container.ts`).

| Layer | Contents |
|---|---|
| Domain | Interfaces only — `ITaskRepository`, `IEventBus`, `ILogger` |
| Application | `TaskService`, `SessionService`, `SpellService`, … |
| Infrastructure | `FileSystem*Repository`, `InMemoryEventBus`, `WebSocketBridge`, `Config` |
| API | Express routes, Zod validation (`api/validation.ts`) |

**It is the system of record.** All durable state is JSON under `DATA_DIR`, written atomically, one subdirectory per entity type. Postgres is a configurable alternative (`DATABASE_TYPE=postgres`) but is **DESIGNED**, not used.

Real-time fan-out: a custom WebSocket bridge with 50 ms batching, per-entity throttling (sessions 500 ms, tasks 300 ms), client-side subscription filtering, and an immediate bypass for spawn/modal events.

### 3.2 maestro-ui — **BUILT**

Tauri 2 · React 18 · 23 Zustand stores · xterm.js terminals · Monaco. Runs as an installed macOS app (prod) or Vite dev server (staging). Also builds as a plain web app (`VITE_APP_MODE=browser`) — that mode is what the gateway serves.

The UI spawns agent PTYs itself via Tauri when `MAESTRO_PTY_HOST=tauri` (default); setting it to `server` moves PTY ownership server-side, which is what makes remote/mobile clients possible.

### 3.3 maestro-cli — **BUILT**

The agents' hands. Commander.js, ESM. An agent runs `maestro task report progress …`, `maestro session prompt …`, etc.; the CLI resolves config (`~/.maestro/config`, env) and calls the local server's REST API.

It also **generates the agent's own system prompt**: `worker init` reads a `MaestroManifest` written by the server and composes the prompt via `prompting/PromptComposer` from `prompts/identity.ts`, `prompts/commands.ts` (filtered by permissions), and `prompts/spawner.ts`. Agent mode (worker / coordinator / coordinated-worker / coordinated-coordinator) selects the behavioural sections.

### 3.4 Agents — **BUILT**

Real `claude` / `codex` processes in PTYs. They are *untrusted-ish participants inside a trusted boundary*: constrained by `commandPermissions` in their manifest, not by OS sandboxing. On this machine they run with bypassed permission prompts by design, so that unattended orchestration doesn't stall.

### 3.5 Supabase Postgres — **PARTIAL**

Intended durable source of truth for **Collab V2** (the shared workspace graph). Project `Maestro` / `ajlhrtjmsjjdrrzahitp`.

Verified live: schema is deployed (`user_profiles`, `spaces`, `tasks`, `channels`, `messages`, `notification_outbox` all present) and **RLS is actively enforcing** — anonymous writes are rejected. What is *not* verified is exactly which of the 8 migrations are applied; that needs the CLI token (see `06-NEEDS-FROM-USER.md` #1).

Authorization is database-backed, not claim-backed: policies read membership from Postgres rather than trusting JWT claims. The API contract above it is owned by `docs/collab-v2-api-design/` — **that doc set is the authority for the API layer; this HLD does not restate it.**

### 3.6 Firebase — **MIXED**

| Service | Role | Status |
|---|---|---|
| **Auth** | Canonical human identity. Firebase UID is the identity anchor (`user_profiles.firebase_uid`, a `text` PK — the schema deliberately never references `auth.users`) | **BUILT** — verified, 5 users, all carrying `role: authenticated` |
| **RTDB** | Presence / typing / transient live state only. Never mirrors durable entities | **BUILT** — live: `gatewayPresence`, `presence`, `spacePresence` |
| **Firestore** | V1 collab (the previous generation). Still live and serving users | **BUILT** — `collabSpaces`, `notificationProfiles`, `notifications` |
| **Storage** | Attachments via a trusted signed-URL broker; clients never get direct bucket access | **BLOCKED — no bucket exists on the project at all** |
| **Functions** | Signed-URL broker, FCM outbox drainer, auth lifecycle hooks | **PARTIAL** — code exists; broker cannot function without Storage |
| **FCM** | Push delivery only; notification *intent* lives in Postgres | **DESIGNED** |

### 3.7 maestro-gateway — **PARTIAL**

Process-per-user hub (`feat/trusted-hub-gateway`): one `maestro-server` per authenticated user, ports 4600–4699, fronted by Tailscale. Validated locally, not deployed. Discussed in `04-DEPLOYMENT-TOPOLOGIES.md`.

⚠️ Its auth **defaults to `dev` mode**, which trusts a client-supplied `x-maestro-uid` header. See `02-TRUST-AND-AUTH.md` §5.

### 3.8 maestro-mobile — **PARTIAL**

Standalone Expo RN app (outside the Bun workspace). Connects to a server by URL; needs `MAESTRO_PTY_HOST=server`. Firebase config files (`google-services.json`, `GoogleService-Info.plist`) are **absent**, so no native build currently works.

---

## 4. The two generations of collab

A recurring source of confusion worth stating plainly:

| | **V1 (live)** | **V2 (in progress)** |
|---|---|---|
| Store | Firestore | Supabase Postgres |
| Identity | Firebase Auth | Firebase Auth (unchanged) |
| Authorization | Firestore security rules | Postgres RLS |
| Status | **Serving real users today** | Schema deployed; API facade partial |

They coexist on the **same Firebase project**. This is why deploying Firestore rules is not a free action — it touches live V1 users. V2's cutover plan mandates a feature flag, dual-read verification, and a staged migration; Firestore is not to be mutated or removed until V2 parity is proven and rollback is no longer needed.

---

## 5. Where the truth lives

| Question | Authoritative source |
|---|---|
| Collab V2 API contract, tables, events, CLI | `docs/collab-v2-api-design/` (parallel session) |
| Collab V2 entity model rationale | `docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md` (backend branch) |
| Overall system shape, trust, deployment, secrets | **this doc set** |
| What is actually configured and verified | `07-VERIFICATION-LOG.md` |
| Credential locations | `~/.maestro/secrets/README.md` |

---

## 6. Honest assessment

What genuinely works today: **single-user local Maestro, completely.** Server, UI, CLI, agents, spawn flow, spells, tasks, sessions, worktrees. That is a real, working system.

What is aspirational: **multi-user collaboration.** V1 collab works but is the previous generation. V2 has a deployed schema, a partial facade, an unverified auth path, no storage backend, and no notification delivery. The gap between "Collab V2 is nearly done" (implied by several planning docs) and what is verifiably operational is **wide** — see `07-VERIFICATION-LOG.md`.
