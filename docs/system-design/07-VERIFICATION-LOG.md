# Verification Log — what was exercised, not assumed

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


**Date:** 2026-07-25 · **Owner:** Bedrock
**Principle:** a configuration is "verified" only when it has been *exercised* — a real authenticated call, an applied migration, a live query. Reading a config file proves nothing.

This log exists because three widely-repeated claims in the existing docs turned out to be **wrong**, and one real blocker turned out to be **undocumented**. Anyone planning remediation should read this before acting on the older docs.

---

## ✅ Verified working

| # | Claim | Method | Result |
|---|---|---|---|
| V1 | Firebase Admin service-account key is valid | `admin.auth().listUsers()` with the key | **OK** — 5 users returned |
| V2 | Admin can mint tokens (required for Supabase third-party auth) | `admin.auth().createCustomToken(uid, {role:'authenticated'})` | **OK** — signed token, len 828 |
| V3 | V1 Firebase collab is live | `admin.firestore().listCollections()` | **OK** — `collabSpaces`, `notificationProfiles`, `notifications` |
| V4 | RTDB is provisioned and shaped as designed | `firebase database:get / --shallow` | **OK** — `gatewayPresence`, `presence`, `spacePresence` |
| V5 | Supabase project reachable with the publishable key | REST `GET /rest/v1/user_profiles` | **OK** — HTTP 200 |
| V6 | Collab V2 schema is deployed to the live project | REST probe across migration-era tables | **Confirmed** — `user_profiles`, `spaces`, `tasks`, `channels`, `messages`, `notification_outbox` all present |
| V7 | Secrets store works from any worktree | `source ~/.maestro/secrets/load.sh staging --verify` from `/tmp` | **OK** — loads and reports without revealing values |
| V8 | Firebase CLI has project access | `firebase projects:list` | **OK** — authenticated, `maestro-5f3fc` visible |
| V9 | **Bypass absent/disabled** (CRITICAL, re-verified 2026-07-25 post-decision) | `check-services.sh` — POST with spoofed `X-Collab-Firebase-Uid` | **PASS** — RLS rejected (`42501`) |
| V10 | Clients receive no Supabase credential | `source load.sh && echo $VITE_SUPABASE_*` | **PASS** — unset; only `VITE_API_URL` is exported |

### Repeatable verification

These are no longer one-off probes. `~/.maestro/secrets/check-services.sh [staging|prod]` re-runs them on demand, exits non-zero on failure, and treats **bypass absent/disabled** as a *critical* check — printing the exact remediation SQL if it ever comes back active:

```sql
UPDATE private.collab_runtime_flags SET enabled = false WHERE key = 'insecure_uid_bypass';
```

Run it before and after any `supabase db push`. Current result: all critical checks pass; Storage correctly reports FAIL (see N1).

> Note: the script's first version reported "all critical checks passed" while displaying a FAIL — a `while read` pipeline ran in a subshell and lost the failure flag. Fixed; it now exits non-zero correctly. Flagged here because a verification tool that under-reports failures is worse than no tool at all.

---

## ❌ Corrections to existing documentation

### C1 — The Admin SDK key was **never committed**. No rotation is needed.

`docs/trusted-hub/ARCHITECTURE.md:199` and `docs/trusted-hub/DESIGN-A.md:232` both state:

> ⚠️ **Security:** a `firebase-adminsdk-*.json` service-account key is committed at the repo root. That is a live secret — **rotate and remove from history**.

**This is false.** Evidence:

```
git log --all --diff-filter=A --name-only | grep -iE 'adminsdk|serviceaccount'   -> empty
git ls-files --error-unmatch maestro-5f3fc-firebase-adminsdk-*.json              -> not known to git
git check-ignore -v maestro-5f3fc-firebase-adminsdk-*.json                       -> .gitignore:51
```

The file is **untracked**, present only in the working tree, and matched by `.gitignore:51` (`*-firebase-adminsdk-*.json`). The doc authors saw the file at the repo root and inferred it was committed.

**Impact of the error:** it schedules an unnecessary key rotation and a history rewrite (`git filter-repo`) across a repo with 40+ live worktrees — an operation that would be disruptive and is entirely avoidable. Those two doc lines should be corrected.

**Residual hygiene note (real, minor):** the key still sits in a working tree that agents operate in. Now that a canonical copy lives at `~/.maestro/secrets/firebase-admin.json`, the repo-root copy can simply be deleted.

---

### C2 — The insecure UID bypass is **not active on the live project**. The risk is latent, not live.

The prior audit and the parallel API-design session describe a *"DEPLOYED insecure UID-bypass"* that ships "enabled by default with `anon` grants across all tables (full header-spoofable identity)". That is an accurate reading of the **code on `feat/collab-v2-supabase-backend`**. It does **not** describe the **deployed** project.

Probed live against `ajlhrtjmsjjdrrzahitp` with the real publishable key:

| Probe | Result |
|---|---|
| `POST /rest/v1/user_profiles` **with** `X-Collab-Firebase-Uid: <arbitrary>` | **HTTP 401** — `42501 new row violates row-level security policy` |
| Same POST **without** the header (control) | **HTTP 401** — identical error |
| `GET /rest/v1/spaces` with and without the spoofed header | `[]` in both cases |
| `rpc/firebase_uid`, `rpc/is_valid_firebase_identity` | 404 — helpers live in the `private` schema, not REST-reachable (expected; proves nothing either way) |

The INSERT test is the decisive one. Had the bypass been active, the header would have established a write identity and the insert policy would have admitted the row. It did not — and the behaviour was **identical** with and without the header, meaning the header is being ignored entirely.

**Conclusion:** migration `20260724235500_collab_v2_insecure_uid_test_bypass.sql` is either not applied to the live project, or its `private.collab_runtime_flags` row is disabled.

**Why the distinction matters:** the danger is real but **latent** — the migration sits in the repo and *a future `supabase db push` would activate it*. That is a "revert the migration before pushing" problem, not a "production is currently exploitable" incident. Conflating them misdirects remediation urgency.

**Certainty caveat:** definitive confirmation requires `supabase migration list`, blocked on 🔴 needs-from-user #1.

---

### C3 — The `role: authenticated` claim backfill is **already done**.

`COLLAB_V2_SUPABASE_FIREBASE_IMPLEMENTATION_PLAN.md` Phase 0 and `functions/src/supabaseAuth.ts` both flag a pending *"one-time Admin SDK backfill for existing users."*

Measured: **5 of 5 users already carry `customClaims.role === 'authenticated'`.** The backfill is complete; that checklist item can be closed.

---

## 🚨 New blocker not in any existing doc

### N1 — Firebase Storage is not provisioned at all.

Every design doc treats Firebase Storage as an available primitive that the signed-URL broker builds on. It does not exist:

```
admin.storage().bucket()                              -> storage/invalid-argument
admin.storage().bucket('maestro-5f3fc.appspot.com')       -> ABSENT
admin.storage().bucket('maestro-5f3fc.firebasestorage.app') -> ABSENT
```

No bucket has ever been created on this project. `functions/src/collabStorageBroker.ts` is therefore **dead code against the current backend** — it cannot work no matter how correct it is, and its tests presumably mock the bucket away.

This requires a console action (needs-from-user #4) and carries a **permanent, irreversible location choice**.

---

## ⚠️ Standing hygiene risk

### H1 — `functions/.env` is git-tracked and unignored.

- `functions/.env` **is tracked** (`git ls-files` confirms).
- `functions/.gitignore` contains only `node_modules/` and `lib/` — it does **not** ignore `.env`.
- The Collab V2 design routes the **Supabase service-role key** into the Functions runtime.

Current contents are harmless (`MAESTRO_RTDB_URL`, a public endpoint). The risk is procedural: the natural next step for anyone wiring up Functions is to add `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` to that file — which commits an RLS-bypassing credential.

**Mitigation, already applied at the design level:** `~/.maestro/secrets/README.md` rule 4 and needs-from-user #3 both state explicitly that the service-role key goes to Secret Manager via `firebase functions:secrets:set`, never to `functions/.env`. The code is already correct here — `collabStorageBroker.ts:19` uses `defineSecret()`, which is Secret Manager-backed.

**Recommended (not applied — outside this session's write scope):** add `.env` to `functions/.gitignore` and `git rm --cached functions/.env`, or rename the non-secret var into `firebase.json` params.

---

## Not yet verifiable (blocked)

| Item | Blocked on |
|---|---|
| Applied-vs-pending migration diff | Supabase access token (#1) |
| `supabase db push` of pending migrations | Access token + DB password (#1, #2) |
| Supabase Third-Party Auth trust of Firebase JWTs | Dashboard registration (#5) |
| End-to-end authenticated call through the facade with a real Firebase token | #5 |
| Signed-URL storage broker | Storage provisioning (#4) |
| FCM outbox drainer | Service-role key (#3) |

The user granted full deploy authorization; these are blocked on **credentials**, not on permission.
