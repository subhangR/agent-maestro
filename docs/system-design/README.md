# Maestro — System Design (HLD)

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


**Owner:** Bedrock (infrastructure & systems architect) · **Date:** 2026-07-25
**North star:** local-first desktop; cloud is a sync layer, not the system of record.
**Auth boundary (2026-07-25):** maestro-server is the **sole client-facing boundary**. Clients hold no Supabase or Firebase credential; the server mints caller-scoped Postgres tokens with a **signing key, not a service-role key**, so RLS remains the authorization engine.

The umbrella architecture document for Maestro: how the server, UI, CLI, agents, Supabase, Firebase, and the gateway fit together — plus what is actually configured, verified, and blocked.

---

## Read in this order

| Doc | What it answers |
|---|---|
| **[01-SYSTEM-OVERVIEW](01-SYSTEM-OVERVIEW.md)** | What each component is and how they connect. Component-by-component BUILT/PARTIAL/DESIGNED status. |
| **[02-TRUST-AND-AUTH](02-TRUST-AND-AUTH.md)** | Trust zones, the Firebase-identity/Supabase-authorization hybrid, and the insecure-defaults checklist. |
| **[03-DATA-FLOWS](03-DATA-FLOWS.md)** | Where data physically lives and how it moves: local state, spawn flow, entity graph, presence, attachments, notifications. |
| **[04-DEPLOYMENT-TOPOLOGIES](04-DEPLOYMENT-TOPOLOGIES.md)** | Local dual-env today; EC2/Tailscale hub next; general cloud later. What must change per topology. |
| **[05-ENVIRONMENTS-AND-SECRETS](05-ENVIRONMENTS-AND-SECRETS.md)** | The secrets model and full location map. **Locations only — never values.** |
| **[06-NEEDS-FROM-USER](06-NEEDS-FROM-USER.md)** | 🔴 **The action list.** Six numbered items only you can supply, each with its exact destination. |
| **[07-VERIFICATION-LOG](07-VERIFICATION-LOG.md)** | What was exercised vs assumed — including three corrections to existing docs and one new blocker. |

**Short on time?** Read `06` (what's needed from you), then `07` §C1–C2 (two widely-repeated claims that are wrong).

---

## Scope boundary

The **Collab V2 API contract** — tables, routes, DTOs, events, CLI surface, error taxonomy — is owned by **`docs/collab-v2-api-design/`**. That doc set is the authority; this one is the umbrella above it and deliberately does not restate it.

This doc set owns: system shape, trust boundaries, deployment topologies, the environments/secrets model, and ground-truth verification.

---

## Status at a glance

| Area | Status |
|---|---|
| Single-user local Maestro (server, UI, CLI, agents, spawn) | ✅ **BUILT** — works completely |
| Local dual-env isolation (staging 4569 / prod 3001) | ✅ **BUILT** |
| Secrets store, worktree-proof | ✅ **BUILT & VERIFIED** |
| Firebase Auth + Admin + RTDB | ✅ **BUILT & VERIFIED** |
| V1 collab (Firestore) | ✅ **BUILT** — live users today |
| Collab V2 schema on Supabase | ⚠️ **PARTIAL** — deployed, RLS enforcing; migration diff unverified |
| Collab V2 auth (maestro-server as sole boundary + token issuer) | ❌ **NOT DONE** — blocked on the JWT signing secret |
| Insecure UID bypass | ✅ **Verified absent** on the live project; pinned off; enforced by `check-services.sh` |
| Collab V2 realtime | ⚠️ **PARTIAL** — collapsed to a ~5s poll; target is WorkspaceEvent over the WS bridge / SSE |
| Attachments / storage broker | ❌ **BLOCKED** — no Storage bucket exists |
| Notifications / FCM | 📋 **DESIGNED** — outbox table deployed, drainer needs credentials |
| Gateway hub | ⚠️ **PARTIAL** — validated locally, not deployed |
| General cloud SaaS | 📋 **DESIGNED** — compute isolation is the unbuilt 80% |

---

## Three findings that change the plan

1. **The Admin SDK key was never committed.** Two docs demand a key rotation and a git history purge across 40+ worktrees. Full-history scan says the file is untracked and always was. **No rotation needed.** (`07` C1)

2. **The insecure UID bypass is not active on the live project.** Probed directly: RLS rejects writes identically with and without the spoofed header. The risk is **latent** — the dangerous migration sits in the repo and would activate on the next `db push` — not a live incident. This changes remediation *urgency*, not *ordering*. (`07` C2)

3. **Firebase Storage was never provisioned.** No bucket exists on the project. Every design doc treats Storage as available; the signed-URL broker is dead code until someone clicks "Get started" in the console — a choice that permanently fixes the bucket's region. (`07` N1)

Also worth closing out: the `role: authenticated` **claim backfill is already done** (5/5 users), despite being listed as pending in the implementation plan. (`07` C3)

---

## The honest summary

Single-user local Maestro is a real, complete, working system. **Multi-user collaboration is not.** Collab V2 has a deployed schema and a partial facade, but its authentication path is unregistered, its realtime is a poll, its storage backend does not exist, and its notification delivery is unbuilt.

The distance between "Collab V2 is nearly done" — the impression left by several planning docs — and what is verifiably operational is wide. This doc set exists to make that distance visible and to reduce it to a short, concrete list: [`06-NEEDS-FROM-USER.md`](06-NEEDS-FROM-USER.md).
