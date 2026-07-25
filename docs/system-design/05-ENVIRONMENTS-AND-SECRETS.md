# Environments & Secrets Map

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


**Status:** 2026-07-25 · Owner: Bedrock

> **IRON RULE.** This document names **locations and purposes only**. No credential value appears here, in any doc, in git, in chat, or in a task report. To inspect what is configured, run
> `source ~/.maestro/secrets/load.sh <env> --verify` — it prints names and set/unset status, never values.

---

## 1. Why the store lives outside the repo

The repo has **40+ active git worktrees**, and agent sessions routinely get a fresh one. A gitignored `.env.local` in the main checkout **does not exist** in any worktree — so a repo-local secret is invisible to most agent sessions, and every new worker stalls on missing credentials or an interactive prompt.

A single home-directory store solves this and three other problems at once:

| Property | Why it matters here |
|---|---|
| **Worktree-proof** | One path resolves identically from every checkout and every session |
| **Git-proof** | Physically outside every repo — no `.gitignore` mistake can leak it |
| **Rotation-friendly** | One place to change a credential, not N copies drifting apart |
| **Build-neutral** | Nothing here is needed to *build*; only to *reach cloud services* |

Rejected alternatives: a repo-local `.secrets/` (fails the worktree test — the deciding factor); OS keychain / 1Password (most secure, but can prompt interactively, which breaks unattended agent sessions — the very thing this store exists to prevent).

---

## 2. Layout

```
~/.maestro/secrets/            dir 0700
├── README.md                  layout, rules, provenance          0600
├── common.env                 NON-SECRET shared identifiers      0600
├── secrets.env                REAL CREDENTIALS                   0600
├── staging.env                staging overrides                  0600
├── prod.env                   prod overrides                     0600
├── firebase-admin.json        Admin SDK service-account key      0600
├── load.sh                    sourceable loader                  0700
└── check-services.sh          repeatable live verification       0700
```

`check-services.sh [staging|prod]` exercises the real services and prints PASS/FAIL, exiting non-zero on failure. Its **critical** check is *bypass absent/disabled* — it attempts a write with a spoofed `X-Collab-Firebase-Uid` header and fails loudly, with the exact remediation SQL, if the row is ever created. Run it before and after any `supabase db push`.

Load order: `common.env` → `secrets.env` → `<env>.env`. Later wins, so an environment file can shadow a shared default.

```bash
source ~/.maestro/secrets/load.sh staging          # or prod
source ~/.maestro/secrets/load.sh staging --verify # names + status only
```

`load.sh` also owns the **name mapping**, because the same credential is read under different names per package:

| Canonical | Exported as | Consumer |
|---|---|---|
| `SUPABASE_URL` | `MAESTRO_SUPABASE_URL` | **server only** |
| `SUPABASE_PUBLISHABLE_KEY` | `MAESTRO_SUPABASE_PUBLISHABLE_KEY` | **server only** |
| `SUPABASE_JWT_SECRET` | `MAESTRO_SUPABASE_JWT_SECRET` | **server only** — mints caller-scoped tokens |
| `FIREBASE_ADMIN_CREDENTIALS` | `GOOGLE_APPLICATION_CREDENTIALS`, `MAESTRO_FIREBASE_CREDENTIALS` | Admin SDK, gateway |
| `SUPABASE_ACCESS_TOKEN` | same | Supabase CLI |
| *(none)* | `VITE_API_URL` | UI — points at maestro-server, nothing else |

> **`VITE_SUPABASE_*` is deliberately NOT exported.** Per the 2026-07-25 boundary decision, clients hold no Supabase credential. Re-adding those exports would silently reopen the direct-to-Supabase path. `load.sh` carries an inline comment saying so at the point of temptation.

---

## 3. What lives where — the map

### `common.env` — non-secret identifiers
Supabase project ref / name / org / URL · Firebase project ID, project number · Admin-credentials path · collab storage bucket · CLI path.

### `secrets.env` — real credentials
| Variable | Purpose | Status |
|---|---|---|
| `SUPABASE_PUBLISHABLE_KEY` | Server-side client key; RLS enforces access | ✅ present |
| `SUPABASE_JWT_SECRET` | **Server mints caller-scoped Postgres tokens** — the sole-boundary design rests on this | 🔴 **needs user (critical path)** |
| `SUPABASE_ACCESS_TOKEN` | Non-interactive Supabase CLI | 🔴 **needs user** |
| `SUPABASE_DB_PASSWORD` | `db push` / `link` | 🔴 **needs user** |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions only — signed-URL broker, FCM drainer | 🟡 **needs user** |
| `MAESTRO_AUTH_PASSWORD` / `_SECRET` | Server auth when enabled | optional, empty |
| `MAESTRO_COLLAB_TOKEN_STORE_KEY` | Only for keychain-less platforms | optional, empty |

### `staging.env` / `prod.env` — environment shape
Ports (4569 / 3001), data dirs, `NODE_ENV`, `MAESTRO_COLLAB_ENV` tag, and the security pins: `MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS=false` and `MAESTRO_GATEWAY_AUTH=firebase` in prod.

### `firebase-admin.json`
Admin SDK service-account key for `maestro-5f3fc`. **Verified working** (`07-VERIFICATION-LOG.md` V1–V3). Canonical copy; the repo-root original is gitignored and can now be deleted.

---

## 4. Credentials NOT in this store, by design

| Credential | Where it lives | Why not here |
|---|---|---|
| Supabase service-role key **in production use** | Firebase Secret Manager (`firebase functions:secrets:set`) | Must never sit in a file the repo tooling can reach. Stored here only long enough to push it up. |
| CLI collab refresh tokens | **OS keychain** (macOS `security`, Linux `secret-tool`) | Platform keychain beats a dotfile |
| Mobile Firebase ID token | `expo-secure-store` (Keychain / Keystore) | Device-only |
| Per-user GitHub tokens (hub) | `~/hub/<uid>/gh` | Per-user, self-service |
| Firebase Web SDK config | **hardcoded** in `maestro-ui/src/firebase/config.ts` | Public by design |

---

## 5. Repo files that look like secret stores but aren't

Clarified because the naming misleads:

| File | Tracked? | Reality |
|---|---|---|
| `maestro-server/.env.{prod,staging,example}` | **yes** | Ports and paths only. No credentials. Fine. |
| `maestro-ui/.env.example` | yes | Documentation. Fine. |
| `maestro-gateway/deploy/gateway.env.example` | yes | Template. Fine. |
| `maestro-ui/.env.local` | no (ignored) | Held the Supabase URL + publishable key; **now superseded** by the store |
| `functions/.env` | **yes** | ⚠️ **See below** |
| `maestro-5f3fc-firebase-adminsdk-*.json` | no (`.gitignore:51`) | Real key. **Never committed** — verified against full history. |

### ⚠️ `functions/.env`

It is **git-tracked**, and `functions/.gitignore` ignores only `node_modules/` and `lib/` — **not `.env`**. Contents today are harmless (`MAESTRO_RTDB_URL`, a public endpoint).

The risk is procedural, not present: the Collab V2 design routes the **service-role key** into Functions, and the intuitive place to put it is this file — which would commit an RLS-bypassing credential.

The code is already correct: `collabStorageBroker.ts:19` uses `defineSecret()`, which is Secret Manager-backed. The gap is purely that the file invites the mistake.

**Recommended** (not applied — outside this session's write scope): add `.env` to `functions/.gitignore` and `git rm --cached functions/.env`.

---

## 6. Onboarding a new agent session

```bash
source ~/.maestro/secrets/load.sh staging
```

That's it — from any worktree, no repo state required. Add `--verify` to confirm before running anything that touches the cloud.

**Optional convenience** (not created — repo write outside this session's scope): a one-line `scripts/load-secrets.sh` shim in the repo that execs the store's `load.sh`, so `source scripts/load-secrets.sh staging` works from muscle memory. It must contain **no values** — only the `source ~/.maestro/secrets/load.sh "$@"` line.

---

## 7. Rotation

1. Edit the value in `~/.maestro/secrets/secrets.env`.
2. Re-push wherever it was propagated — `firebase functions:secrets:set …` for the service-role key; re-link for the Supabase CLI.
3. `source ~/.maestro/secrets/load.sh <env> --verify` to confirm.

No repo change is ever needed to rotate a credential. That is the point of the design.
