# Deployment Topologies

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


**Status:** 2026-07-25 · Owner: Bedrock · North star: **local-first desktop**

Three topologies, in order of how real they are.

---

## T1 — Local dual-environment · **BUILT, in daily use**

Staging and production run **simultaneously** on one machine without conflict:

| | Staging | Production |
|---|---|---|
| Server port | **4569** | **3001** |
| UI (Vite) port | 4568 | n/a (installed app) |
| Data | `~/.maestro-staging/data/` | `~/.maestro/data/` |
| Mode | Tauri dev, hot-reload | Installed macOS app |
| `NODE_ENV` | development | production |

> The server's own default `PORT` is `4567`. Staging overrides it to 4569 with the UI wired via `VITE_API_URL=http://localhost:4569/api`. A bare `bun run dev:server` lands on 4567 and belongs to neither environment — a common source of "why isn't my change showing up".

Complete isolation of ports **and** data directories means staging agents cannot corrupt production state. This is the single most valuable operational property Maestro has, and it should survive every future change.

**Where it leaks: the cloud.** Both environments currently point at the **same Supabase project and the same Firebase project** (per the environment-split decision, 2026-07-25). So a staging agent *can* write production collab data. Local isolation is total; cloud isolation is nil. Mitigation and exit path in §5.

### Worktrees

40+ active `git worktree` checkouts. Agents get their own worktree to avoid stomping each other's working tree — a hard-won lesson from parallel CLI-spawned workers sharing a cwd.

The consequence that drives the secrets design: **a gitignored `.env.local` in the main checkout does not exist in any worktree.** Any credential stored repo-locally is invisible to most agent sessions. Hence `~/.maestro/secrets/` (see `05-ENVIRONMENTS-AND-SECRETS.md`).

Also: concurrent `bun run build:ui` across many workers SIGTERM-kill each other's Vite bundle. Per-worker verification should use `tsc -b`, not a full UI build.

---

## T2 — EC2 / Tailscale hub · **PARTIAL — validated locally, not deployed**

`maestro.tail6cfd2b.ts.net`. The `maestro-gateway` package (`feat/trusted-hub-gateway`) implements process-per-user:

```
client ──TLS──► Tailscale ──► gateway :4580 (127.0.0.1)
                                 │ verify Firebase ID token (Admin SDK)
                                 │ check ~/hub/allowlist.json
                                 ▼
                        maestro-server per user, ports 4600–4699
                        DATA_DIR=~/hub/<uid>/data   ← isolation boundary
```

**Isolation model.** One OS process and one data directory per user — real isolation, not row-level filtering. That's the right choice for a system whose agents execute arbitrary code: a shared-process multi-tenant design would be indefensible here.

**What is shared** (deliberately): one pooled Claude/Codex subscription across all users, seeded from the operator's own `~/.claude.json`. Every user's agent runs on the operator's account. GitHub credentials are correctly *per-user* (self-service `gh auth login` into `~/hub/<uid>/gh`).

**Preconditions before this may face anything but Tailscale:**

1. `MAESTRO_GATEWAY_AUTH=firebase` — the default `dev` mode trusts an `x-maestro-uid` header and is fully unauthenticated (`02-TRUST-AND-AUTH.md` §5).
2. `MAESTRO_PTY_HOST=server` — otherwise terminals expect a Tauri host that isn't there.
3. Allowlist enforced (already the default).
4. Hub users must be **trusted people** — they share your subscription and run code on your box.

**Constraint:** the box has ~1.9 GB free EBS and no GitHub credentials. Disk is the binding limit for a shared checkout plus per-user data.

---

## T3 — General cloud SaaS · **DESIGNED only**

Not built, and honestly assessed: **compute isolation is ~80% of the total cost.** Everything else — API, billing, provisioning — is weeks of work. The sandboxed runner that would let untrusted strangers execute agent code is where the real engineering and the real infrastructure bill live.

T2's process-per-user model does **not** generalize to untrusted users. It is safe only because hub users are people you trust; strangers would need VM- or container-level sandboxing with resource limits, egress control, and a filesystem jail.

The API layer is being designed deployment-agnostic (`docs/collab-v2-api-design/`, principle 6) so this remains possible without a rewrite. That's the right investment — but the contract being portable is not the same as the system being deployable.

---

## 4. What must change per topology

| Concern | T1 local | T2 hub | T3 cloud |
|---|---|---|---|
| Server auth | off | gateway-fronted | mandatory |
| PTY host | `tauri` | **`server`** | `server` |
| Gateway auth | n/a | **`firebase`** | federated |
| CORS | `*` | allowlist | strict |
| Data isolation | dirs | **process + dir** | sandbox + tenancy |
| Secrets | `~/.maestro/secrets/` | `/etc/maestro/gateway.env` | secret manager |
| Compute isolation | none needed | trust-based | **the hard problem** |

The row that changes character rather than degree is **compute isolation**. Everything else is configuration; that one is unbuilt engineering.

---

## 5. Environment separation: current state and exit path

**Decision (2026-07-25):** staging and prod share one Supabase project and one Firebase project *for now*, to avoid provisioning cost while Collab V2 is still moving.

**Accepted risk:** a staging session can read and mutate production collab data. There is no technical barrier today.

**Mitigation now.** `MAESTRO_COLLAB_ENV` is set in both `staging.env` and `prod.env`. It is currently only a **tag** — it makes rows attributable, not protected. Do not mistake it for enforcement.

**Exit path, in order:**

1. Add an `env` column to Collab V2 root entities, defaulted from the caller's tag.
2. Extend RLS policies to filter on it — this converts the tag into an actual boundary.
3. When collab data becomes valuable, provision a separate Supabase project for staging; keep Firebase shared (identity is genuinely the same, and a second Firebase project means duplicating Third-Party Auth, rules, and FCM setup).
4. Split Firebase only if staging needs to test auth changes destructively.

Step 2 is the one that matters. Until it lands, treat production collab data as writable by any staging agent, and don't put anything in it you would mind losing.
