# NEEDS FROM USER — numbered, with exact destinations

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


**Status:** ⛔ **ALL ASKS CLOSED — NO ACTION REQUIRED** · 2026-07-25 · Owner: Bedrock

> # ⛔ Do not action anything in this document.
>
> Every credential request below was **closed on 2026-07-25** when the Collab-V2-on-maestro
> path became reference-only, superseded by **tm8** (plain Postgres, tm8-native identity,
> no Firebase or Supabase). tm8's own Ops lead owns tm8 infrastructure from scratch.
>
> | Ask | Final status |
> |---|---|
> | 1. Supabase access token | ⛔ **CLOSED** — not needed |
> | 2. Supabase JWT secret | ⛔ **CLOSED** — not needed |
> | 3. Supabase DB password | ⛔ **CLOSED** — not needed |
> | 4. Supabase service-role key | ⛔ **CLOSED** — not needed |
> | 5. Enable Firebase Storage | ⛔ **CLOSED** — not needed |
> | 6a. Google OAuth client secret / sign-in methods | ⛔ **MOOT** — question withdrawn |
>
> **Nothing was decommissioned.** The Supabase project and Firebase project remain
> untouched as design references. The secrets store at `~/.maestro/secrets/` remains
> in place — its `__NEEDS_USER__` placeholders are now permanent and inert.
>
> The content below is preserved **only** as the record of what the hybrid architecture
> would have required, and why. It is history, not a to-do list.

---

<details>
<summary><strong>Original request list (historical — do not action)</strong></summary>

**Original rule:** every value below goes into a file under `~/.maestro/secrets/`. Nothing goes in the repo, in chat, or in a task report.

Legend: 🔴 blocks work now · 🟡 blocks a specific feature · 🟢 nice-to-have

---

## 🔴 1. Supabase personal access token

**Why:** the Supabase CLI is logged out. Without it I cannot run `migration list`, `db push`, or confirm which of the 8 migrations are actually applied. This is the single biggest blocker — it gates all Supabase verification.

**Get it:** https://supabase.com/dashboard/account/tokens → *Generate new token* → name it `maestro-cli-local`.

**Put it:**
```bash
# edit this line in ~/.maestro/secrets/secrets.env
SUPABASE_ACCESS_TOKEN=<paste here>
```

**Then I can:** link the CLI non-interactively, produce a definitive applied-vs-pending migration diff, and settle the bypass question below with certainty.

---

## 🔴 2. Supabase JWT secret — **NEW (2026-07-25 architecture change)**

**Why:** the *"everything maestro server"* decision makes maestro-server the sole client-facing boundary. To do that **without** handing it a service-role key, the server mints its own short-TTL Postgres tokens — and it needs a signing secret to mint them with. This is what keeps RLS as the authorization engine instead of moving authorization into application code.

**Get it:** https://supabase.com/dashboard/project/ajlhrtjmsjjdrrzahitp/settings/api → **JWT Settings** → *JWT Secret* → reveal & copy.

**Put it:**
```bash
# ~/.maestro/secrets/secrets.env
SUPABASE_JWT_SECRET=<paste here>
```

⚠️ **Use the legacy HS256 JWT secret, not an asymmetric signing key.** Asymmetric third-party auth requires Supabase to *fetch* the issuer's public keys from a JWKS URL over the internet — and a local-first maestro-server on `localhost:4569` (or a Tailscale-private host) is unreachable from Supabase's servers. A shared symmetric secret needs no inbound reachability. See `02-TRUST-AND-AUTH.md` §3.2 for the trade-off this accepts.

---

## 🔴 3. Supabase database password

**Why:** `supabase db push` and `supabase link` both require it. Needed to apply any migration.

**Get it:** https://supabase.com/dashboard/project/ajlhrtjmsjjdrrzahitp/settings/database → *Database password* → **Reset database password** (the original is not retrievable; resetting is expected and safe — nothing currently connects with it).

**Put it:**
```bash
# ~/.maestro/secrets/secrets.env
SUPABASE_DB_PASSWORD=<paste here>
```

---

## 🟡 4. Supabase service-role key

**Why:** the Collab V2 signed-URL storage broker (`functions/src/collabStorageBroker.ts`) and the FCM outbox drainer need to bypass RLS. This is the only legitimate service-role consumer.

**Get it:** https://supabase.com/dashboard/project/ajlhrtjmsjjdrrzahitp/settings/api-keys → `service_role` → reveal & copy.

**Put it:**
```bash
# ~/.maestro/secrets/secrets.env
SUPABASE_SERVICE_ROLE_KEY=<paste here>
```

⚠️ **Do not put this in `functions/.env`.** That file is **git-tracked** and `functions/.gitignore` does not ignore it — pasting the key there commits god-mode access to the repo. It reaches Functions only via Secret Manager, which I run once you supply it:
```bash
firebase functions:secrets:set SUPABASE_SERVICE_ROLE_KEY
```

---

## 🟡 5. Enable Firebase Storage (dashboard click — no value to paste)

**Why:** I verified with the Admin SDK that **no Storage bucket exists** on `maestro-5f3fc` — neither `maestro-5f3fc.appspot.com` nor `maestro-5f3fc.firebasestorage.app`. The entire signed-URL attachment path is therefore inoperable regardless of code correctness.

**Do it:** https://console.firebase.google.com/project/maestro-5f3fc/storage → **Get started** → pick a location (⚠️ **permanent, cannot be changed later**; choose the region matching your RTDB, `asia-southeast1`, unless you have a reason not to).

**Then I can:** deploy Storage rules that deny direct client access, and verify the broker end-to-end.

---

## ⬜ ~~Register Firebase as a Supabase third-party provider~~ — **NO LONGER NEEDED**

Superseded by the 2026-07-25 boundary decision. The trusted issuer is now **maestro-server**, not Firebase, so Supabase no longer needs to trust Firebase-issued JWTs. Item #2 (the JWT secret) replaces this on the critical path.

It may return in a reduced form under *Reading B* (§3.3 of `02-TRUST-AND-AUTH.md`), where Firebase remains the upstream human sign-in verified server-to-server — but it is no longer blocking.

---

## ✅ ~~6. Prod identity scope~~ — **DECIDED: Reading B**

Firebase stays as prod identity, strictly server-side. maestro-server verifies Firebase tokens server-to-server and mints its own Postgres JWTs; clients hold no Firebase or Supabase material. Firebase project + Admin credentials remain required infrastructure and stay in the secrets store as **server-side** secrets. No action needed.

---

## 🟡 6a. Heads-up — a credential that may be needed soon

Not a request yet, because it depends on an unspecified design choice — recorded so it isn't discovered mid-implementation.

Under Reading B the client never holds a Firebase token, so it can't use the Firebase JS SDK popup the UI uses today. For **email/password**, maestro-server can call the Firebase Auth REST API and nothing new is needed. For **Google sign-in**, the server must instead run an authorization-code flow — which requires a **Google OAuth client secret** as a new server-side credential.

**If email/password-only is acceptable for V2, this disappears entirely.** Tell me which sign-in methods V2 must support and I'll either add the item or close it.

Related, and worth knowing: the Firebase *client* config is **hardcoded** in `maestro-ui/src/firebase/config.ts`, not env-driven. Removing it from clients needs a code change, not a config change — and it can't be deleted while V1 collab (Firestore) is live and using it. So "clients hold no Firebase material" is precisely true of the **V2 path**; the V1 path keeps its config until V1 is decommissioned.

---

## 🟢 7. Confirm the Firebase account is the intended one

**Why:** the Firebase CLI on this machine is authenticated as **`penrosecoder@gmail.com`**, while your Claude account is `manzilshaik95@gmail.com`. That account does have access to `maestro-5f3fc`, so nothing is broken — I just want confirmation it's the intended owner identity before I deploy Functions and rules under it.

**Do it:** reply "yes that's right", or run `firebase login` to switch.

---

## Already handled — no action needed

For completeness, so you don't chase things that are done:

| Item | Status |
|---|---|
| Firebase Admin service-account key | ✅ Verified working; canonicalised into the secrets store |
| `role: authenticated` custom-claim backfill | ✅ **Already complete** — all 5 users carry it. The plan lists this as pending; it isn't. |
| Supabase publishable key + project ref/URL | ✅ Recovered from local config, migrated into the store |
| Firebase project ID / RTDB URL / project number | ✅ In `common.env` |
| RTDB rules | ✅ Deployed and live |
| Admin key "leaked to git" | ✅ **False alarm** — full-history scan shows it was never committed. No rotation needed. See `07-VERIFICATION-LOG.md`. |
| Secrets layout for all 40+ worktrees | ✅ Built and verified at `~/.maestro/secrets/` |
| Insecure UID bypass | ✅ Pinned `false` in both envs; verified absent on the live project; enforced by `check-services.sh` |
| Supabase third-party auth registration | ✅ **No longer needed** — maestro-server is the trusted issuer now |
| Search infrastructure | ✅ **Deferred entirely for v1** — nothing to provision |

---

## The fastest unblock

Items **1, 2 and 3** live on the same two Supabase dashboard pages — about three minutes total — and together unblock nearly everything: full CLI control, a definitive migration diff, and the server-side auth path the whole "everything maestro server" architecture rests on.

Item **2 (the JWT secret) is the new critical path.** Without it maestro-server cannot mint Postgres tokens, and the sole-boundary design has no working implementation.

---

</details>

---

## Changelog

**2026-07-25 (later) — superseded by tm8.** All five credential asks closed; the sign-in-methods question withdrawn. The Collab-V2-on-maestro path is reference-only. Nothing decommissioned; the deployed Supabase/Firebase projects remain untouched as design references.

**2026-07-25 — architecture change** (*"no firebase or supabase, everything maestro server"*):

- **Added #2**, the Supabase JWT secret — now the critical-path credential.
- **Removed** the Supabase third-party-auth registration; maestro-server is the trusted issuer instead of Firebase.
- **#6 resolved** — Reading B: Firebase stays prod identity, server-side only. Firebase Admin credentials remain required infra.
- **Added #6a** as a heads-up: a Google OAuth client secret may be needed if V2 must support Google sign-in (server-brokered auth-code flow). Moot if email/password-only.
- Documented that `SUPABASE_JWT_SECRET` is **obtained, not generated** — Supabase must verify our tokens, so it must be the project's own secret — and that **rotating it also invalidates the anon and service_role keys**.
- Bypass pinned `false` in both environments, re-verified absent, and now a critical check in `check-services.sh`.
- Clients no longer receive any Supabase credential — `load.sh` stopped exporting `VITE_SUPABASE_*`.
- Search infrastructure deferred for v1.
