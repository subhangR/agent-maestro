# Trust Boundaries & Authentication

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

---

## 1. The founding assumption

Maestro's north star is **local-first**: your machine is trusted, the network is not.

This single choice explains nearly every security property of the system, including ones that look like omissions:

- The local server has **no authentication by default** (`MAESTRO_AUTH_ENABLED` defaults off). That is correct for a process bound to your own machine serving only you.
- Agents run with permission prompts bypassed. Correct for unattended local orchestration.
- CORS defaults to `*`. Tolerable on localhost.

**Each of these becomes a critical vulnerability the moment the server is reachable from elsewhere.** The local-first design is not "insecure"; it is secure *for its stated deployment*. The danger is deploying it under a different one without flipping the corresponding switches. §5 enumerates them.

---

## 2. The four trust zones

| Zone | Contains | Trusted? | Enforced by |
|---|---|---|---|
| **Z1 — Machine** | server, UI, CLI, agent processes, `~/.maestro/data` | Fully trusted | OS user account |
| **Z2 — Agent** | individual agent processes | Constrained, not sandboxed | `commandPermissions` in the manifest — *advisory*, enforced by the CLI, not the OS |
| **Z3 — Transport** | anything leaving the machine | Untrusted | TLS, Tailscale |
| **Z4 — Cloud** | Supabase, Firebase | Untrusted with the *user's* identity | RLS, Firestore rules, RTDB rules |

The important subtlety is **Z2**: an agent is restricted by what the CLI *offers* it, not by what the OS *permits* it. An agent that shells out directly can do anything the user can. Agent restriction is a usability and focus mechanism, **not a security boundary**. Do not rely on it for isolation. Real isolation is what the gateway's per-user process model and the (unbuilt) sandboxed runner are for.

---

## 3. The identity model — **revised 2026-07-25**

> **User directive:** *"no firebase or supabase, everything maestro server."*

**maestro-server is the sole client-facing boundary.** Clients — UI, CLI, agents, future MCP — authenticate to maestro-server and nothing else. They hold no Supabase key, no Firebase token, and open no connection to either service.

```
  1. Client authenticates            ──► maestro-server   (the ONLY boundary)
                                              │ establishes identity itself
                                              │ dev: server-issued dev identity
                                              │ prod: upstream sign-in (§3.3)
                                              ▼
  2. Server mints a short-TTL JWT    sub = identity id, role = authenticated
                                              │  signed with the SIGNING KEY
                                              ▼
  3. Server calls Postgres           ──► Supabase (PostgREST)
                                              │ validates the signature
                                              ▼
  4. RLS resolves identity + reads MEMBERSHIP from Postgres (not from claims)
                                              ▼
  5. Row visible / mutation allowed — or not
```

### 3.1 Why this is not a downgrade

Making the server the only boundary *could* have meant giving it a service-role key and moving authorization into application code. **It does not.** The server holds a **signing key, not a service-role key** — so Postgres still enforces every read and write through the same RLS predicates, and a compromised maestro-server **cannot escalate past them**.

This is the property worth protecting in any future change: *the server proves who the caller is; the database decides what they may do.* Two independent things. Collapsing them into one — by handing the server a service-role key — would discard the system's main defence-in-depth for a modest convenience gain.

Two further properties carried over unchanged:

**The schema never references `auth.users`.** Identity is anchored on `user_profiles.firebase_uid text primary key`; Supabase's own auth tables are unused. (The column name is now a slight misnomer — it holds *an* identity id, not necessarily a Firebase one.)

**Authorization is database-backed, not claim-backed.** A claim proves who you are; what you may do is read live from membership tables at query time, so revocation is immediate rather than token-expiry-delayed.

### 3.2 ⚠️ Infra constraint: the signing key must be symmetric (HS256)

A consequence of local-first that constrains the implementation, and which is easy to get wrong:

Supabase's asymmetric third-party auth verifies tokens by **fetching the issuer's public keys from a JWKS URL over the internet**. A local-first maestro-server on `localhost:4569` — or on a Tailscale-private host — **is not reachable from Supabase's servers.** JWKS-based issuance therefore cannot work in the local topology.

The workable mechanism is the project's **legacy JWT secret (HS256)**: a shared symmetric secret needs no inbound reachability. Recorded as `SUPABASE_JWT_SECRET` (`06-NEEDS-FROM-USER.md` #2).

Trade-off, stated honestly: a shared symmetric secret means every server instance that can *verify* can also *mint*. Acceptable while maestro-server instances are trusted and operator-run. If the hub ever hosts instances the operator does not control, this must move to asymmetric signing — which in turn requires a publicly reachable issuer, i.e. a cloud deployment.

### 3.3 Prod identity — **SETTLED: Reading B** (user, 2026-07-25)

> Firebase stays as prod identity, but **strictly server-side**: maestro-server verifies Firebase tokens server-to-server and mints its own short-lived Postgres JWTs. Clients, CLI, and agents hold **no** Firebase or Supabase material.

Firebase project + Admin credentials therefore remain **required infrastructure**, held as server-side secrets. Dev identities flow through the same token path — no emulator.

The reasoning that led here, retained because it constrains future changes:

> **A local-first server cannot be an identity authority for other people.**

maestro-server runs on *your machine*. Collab is inherently multi-party. Under Reading A, when Alice shares a space with Bob, whose maestro-server is authoritative for Bob's account? Alice's laptop cannot own Bob's identity — it isn't always on, isn't reachable, and isn't trusted by Bob. Identity for a multi-user system must live somewhere continuously available and mutually trusted.

So Reading A does not merely mean "write an account system" — it means **maestro-server must first become a hosted, always-on service**. That is topology T3, whose compute-isolation problem is explicitly the unbuilt 80% of the work (`04-DEPLOYMENT-TOPOLOGIES.md` §T3). Reading A therefore places a multi-month infrastructure project on the Collab V2 critical path.

Two supporting arguments:

**The directive is already satisfied by B.** *"Everything maestro server"* is a statement about the **client-facing boundary** — clients shouldn't juggle multiple backends. Reading B satisfies that completely: clients see only maestro-server and never a Firebase token. Firebase becomes an implementation detail behind the boundary, exactly like Postgres is.

**Account lifecycle is deceptively expensive.** Sign-up, email verification, password reset, federated sign-in, MFA, breach response — all security-critical, all easy to get subtly wrong, all already working in Firebase. Rebuilding it buys architectural tidiness at the cost of real security surface.

**Note the asymmetry with dev.** Dev auth *is* maestro-native — correctly, because dev is single-user and local, where the server genuinely is the only party. The decided dev model and Reading B compose cleanly: identical code path, differing only in how upstream identity is established (dev: server-issued; prod: Firebase server-to-server).

Reading A remains a coherent end state once a hosted maestro-server exists. It should be a deliberate later migration, not a Collab V2 prerequisite.

### 3.4 Two consequences that config alone cannot deliver

Both follow from *"no Firebase client config ships to clients"*. Flagging them because neither is a settings change, and both will otherwise surface late as surprises.

**(a) The Firebase client config is hardcoded in source, not env-driven.**
`maestro-ui/src/firebase/config.ts` hardcodes every field — `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `databaseURL`, plus a VAPID key — with env vars acting only as *overrides*. The app therefore always falls back to `maestro-5f3fc` and is never "unconfigured".

So removing Firebase config from the client **cannot be done by unsetting variables**; it requires a code change. And it cannot simply be deleted, because **V1 collab (Firestore) is live and still uses it**. The realistic sequence is: keep it for the V1 path, ensure the V2 path never imports it, and remove it only at V1 decommission. Until then, "clients hold no Firebase material" is true of the **V2 path only** — worth stating precisely rather than as a blanket claim.

**(b) Server-side sign-in means the server must broker the OAuth flow.**
If the client never holds a Firebase token, it cannot use the Firebase JS SDK popup flow that the UI uses today. For email/password, maestro-server can call the Firebase Auth REST API directly. For **Google sign-in**, the standard flow hands the *client* a credential — so the server must instead run an **authorization-code flow**: client redirects, server exchanges the code, server holds the tokens.

That exchange requires a **Google OAuth client secret** as a new server-side credential. It is not yet in the secrets store because the sign-in mechanism isn't specified — recorded here so it isn't discovered mid-implementation. If email/password-only is acceptable for V2, this disappears entirely.

**Nothing Firebase is being decommissioned.** Firebase remains prod identity plus RTDB/Storage/FCM.

---

## 4. Credential holders after the change

| Component | Holds | Why |
|---|---|---|
| maestro-ui, CLI, agents, MCP | **nothing** | Never talk to Supabase or Firebase |
| maestro-server | **JWT signing key** | Mints caller-scoped tokens; still bound by RLS |
| Firebase Functions (broker, FCM) | **service-role** via Secret Manager | Trusted server-side workers; must bypass RLS. Never on a client path. |

The first row is the change: the browser previously held a publishable key and could reach Supabase directly. That path is closed, and `load.sh` deliberately **no longer exports `VITE_SUPABASE_*`** — re-adding it would silently reopen it.

Service-role reaches Functions via `defineSecret()` (Secret Manager-backed), **never** via `functions/.env`, which is git-tracked and unignored (`07-VERIFICATION-LOG.md` H1).

---

## 5. Insecure defaults — the deployment checklist

Every item below is safe locally and dangerous when exposed. This is the list to check before any deployment.

| # | Setting | Default | Risk when exposed | Fix |
|---|---|---|---|---|
| 1 | `MAESTRO_AUTH_ENABLED` | **off** | Anyone reaching the port has full control | `=true` + `MAESTRO_AUTH_PASSWORD` |
| 2 | `MAESTRO_GATEWAY_AUTH` | **`dev`** | Trusts client-supplied `x-maestro-uid` — impersonate anyone by setting a header | `=firebase` (pinned in `prod.env`) |
| 3 | `MAESTRO_COLLAB_V2_INSECURE_UID_BYPASS` | ✅ **now pinned `false` in BOTH envs** | Header-spoofable DB identity | Done — dev identity is server-issued |
| 4 | Bypass **migration** `20260724235500` | in-repo, enabled-when-applied | **Latent** — activated by the next `supabase db push` | Revert before any push; verified absent on the live project |
| 5 | `CORS_ORIGINS` | `*` | Any origin calls the API | Explicit allowlist |
| 6 | `MAESTRO_ENFORCE_ALLOWLIST` | `true` ✅ | — | already safe |

**On #3 and #4 — the bypass is now dead by decision, and verified dead in practice.** It made the database trust an unauthenticated `X-Collab-Firebase-Uid` header. Three things now hold:

1. **Decided out of existence.** Dev identity is established by maestro-server itself, so the header path has no remaining purpose. The flag is pinned `false` in *both* environments.
2. **Verified absent on the live project.** RLS rejects writes identically with and without the spoofed header (`42501`).
3. **Continuously checked.** `~/.maestro/secrets/check-services.sh` runs this as a **critical** check on every invocation and prints the exact remediation SQL if it ever comes back active.

The residual risk is purely latent: the migration still sits in the repo and would activate on the next `supabase db push`. It must be reverted before any push. Evidence in `07-VERIFICATION-LOG.md` C2.

**On #2 — the gateway default deserves emphasis.** `dev` mode means a header sets your identity. A gateway deployed without explicitly setting `MAESTRO_GATEWAY_AUTH=firebase` is completely unauthenticated while *appearing* to have authentication. Defaulting an auth mode to the insecure option is a footgun; the safer design is to default to `firebase` and require an explicit opt-in for `dev`. Recorded here as a recommendation.

---

## 6. Shared-credential model in the gateway

Worth understanding before any multi-user deployment: the gateway pools **one** Claude/Codex subscription across all users (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), seeded by copying the operator's own `~/.claude.json`.

Implication: every hub user consumes the operator's subscription under the operator's identity. That's a deliberate cost decision, not a bug — but it means **hub users must be people you trust**, which is exactly why the allowlist defaults to enforced. GitHub credentials, by contrast, are correctly per-user (`GH_CONFIG_DIR` per uid, self-service `gh auth login`).

---

## 7. Auth flows, end to end

**Local single-user (BUILT).** No auth. UI → server over localhost. Agents → CLI → server. Identity is the OS user.

**Collab V2 (PARTIAL — revised).** Client authenticates to **maestro-server only** → server establishes identity (dev: server-issued dev identity; prod: per §3.3) → server mints a short-TTL JWT signed with `SUPABASE_JWT_SECRET` → server calls Postgres → RLS resolves identity and checks membership. The client never holds a Supabase key. *Blocked on the JWT signing secret.*

Note this **removes** the previous dependency on registering Firebase as a Supabase third-party provider: the trusted issuer is now maestro-server, not Firebase. Under Reading B that registration may return for the server-to-server hop, but it is no longer on the critical path.

**Gateway hub (DESIGNED).** Client → Tailscale TLS → gateway → verifies Firebase ID token via Admin SDK → checks allowlist → routes to that user's dedicated `maestro-server` on a private port. Per-user process isolation is the real boundary.

**CLI collab (BUILT).** Refresh token in the **OS keychain** (macOS `security`, Linux `secret-tool`), with an AES-GCM encrypted file fallback only when `MAESTRO_COLLAB_TOKEN_STORE_KEY` is set. Using the platform keychain rather than a dotfile is the right call.
