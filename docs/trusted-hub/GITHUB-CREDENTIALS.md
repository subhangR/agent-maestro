# Per-user GitHub credentials in the Trusted-Hub gateway

**Status:** design / decision doc (no code yet). Scope: how to give each Trusted-Hub user
their **own** GitHub identity for their agents' `git` / `gh` operations, under Design A
(process-per-user, single OS user, soft isolation D9).

Companion to `DESIGN-A.md` (esp. §3.5 CredentialSource, §5 trust boundaries, §6 fs layout,
§10 deferred). Verified against the real repo on `feat/trusted-hub-gateway`
(`maestro-gateway/src/{credentials,supervisor,config}.ts`,
`maestro-server/.../PtyHostService.ts`).

---

## 0. TL;DR recommendation

Extend the existing `CredentialSource` seam with a **per-user GitHub credential source**
that injects, per uid, at instance spawn:

- `GH_TOKEN` — the user's GitHub PAT (fine-grained, scoped to *their* repos)
- `GH_CONFIG_DIR=~/hub/<uid>/gh` — per-uid `gh` config dir (isolates `gh` state)
- `GIT_CONFIG_GLOBAL=~/hub/<uid>/git/config` — a gateway-generated per-uid gitconfig that
  (a) sets the user's `user.name`/`user.email` and (b) wires `gh` as the HTTPS credential
  helper so `git push` reuses `GH_TOKEN`
- `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` / `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` —
  belt-and-suspenders correct commit attribution regardless of any repo-local config

Mapping is `uid → {token, name, email}` in a gateway-owned secret file
(`~/hub/secrets/github.json`, mode `0600`, hot-reloaded), **mirroring the allowlist model**.
Owner provisions each allowlisted user's PAT during onboarding (paste-once). This lands
entirely behind the seam — **zero change to `maestro-server` and zero change to the
supervisor** (it already spreads `...this.credentials.resolve(handle.uid)` into the child env).

**Do NOT** override `HOME` per-uid (tempting, but broad blast radius — see §4.2).

**Honest security caveat (§6):** under soft isolation (D9) a per-user token in an
instance's env is **not confidential** from other users' agents (they share the OS user and
can read `/proc/<pid>/environ` and the secrets file). This is the *same* trust assumption we
already accept for the shared Claude login and shared `~/hub/<uid>/` dirs. It buys **correct
attribution + correct per-user push scope today**; true confidentiality is the deferred
hardening (§7), whose target is a **loopback credential-broker helper** that keeps tokens
out of env entirely.

---

## 1. The owner's question, answered directly

> "each user is different, but each user has a different shell profile / user kind of thing, right?"

**No.** In Design A there is exactly **one** OS user (`ubuntu`) and **one** `HOME`
(`/home/ubuntu`). Per-user separation is achieved by **per-uid `DATA_DIR` / `SESSION_DIR` /
`projects/` + per-instance env injection**, *not* by OS accounts or shell profiles (locked
decision A9/D9). Consequently everything that resolves off `HOME` is **shared today**:

| Resource | Resolves from | Shared today? |
|---|---|---|
| `~/.gitconfig` (identity, helpers) | `$HOME/.gitconfig` | **Yes — shared** |
| `~/.config/gh/hosts.yml` (gh auth token) | `$HOME/.config/gh` (or `$XDG_CONFIG_HOME`) | **Yes — shared** |
| git credential store | `~/.git-credentials` / helper | **Yes — shared** |
| `~/.ssh/` (keys, known_hosts) | `$HOME/.ssh` | **Yes — shared** |

So without intervention **every user's agent commits and pushes as the same GitHub
identity** — wrong attribution, and one shared token's scope is granted to everyone.

Claude config is the exception: it's already decoupled from `HOME` via the explicit
`CLAUDE_CONFIG_DIR` injection (that's how we pool the subscription). We mirror that trick for
GitHub with git/gh's own env overrides.

---

## 2. Ground truth: the env chain (verified)

The credential env only has to be injected **once**, at instance spawn — it flows down
automatically to every agent tool:

```
gateway process           process.env  (HOME=/home/ubuntu, PATH, …)
  │  supervisor.spawnChild()  →  child env =
  │     { ...process.env, PORT, HOST, MAESTRO_AUTH_ENABLED:false,
  │       DATA_DIR, SESSION_DIR, SERVER_URL,
  │       ...credentials.resolve(uid),      ← THE SEAM (supervisor.ts:113)
  │       ...extraInstanceEnv }
  ▼
per-user maestro-server instance   process.env  (inherits the above)
  │  PtyHostService.spawn():  env = { ...process.env, ...params.env }   (PtyHostService.ts:262)
  ▼
agent PTY (claude / codex)   →  runs `git` / `gh`  →  sees GH_TOKEN, GIT_*, GH_CONFIG_DIR…
```

Key confirmations:
- `CredentialSource.resolve(uid: string)` is **already keyed by uid** (`credentials.ts:17`).
  `SharedCredentialSource` simply ignores the arg. A per-user impl needs no interface change.
- Agents run in `cwd = <project.workingDir>` under `~/hub/<uid>/projects/` — so `git` runs
  inside the user's own repos.
- `HOME` is inherited from the gateway process and **never overridden** in `spawnChild`
  (`supervisor.ts:103-115`), which is why the `HOME`-relative resources above are shared.

---

## 3. How git / gh / ssh actually resolve credentials (so we pick the right knobs)

**Commit identity (author/committer):**
`GIT_AUTHOR_NAME/EMAIL` + `GIT_COMMITTER_NAME/EMAIL` env vars **override everything**. If
unset, git falls back to `user.name`/`user.email` from the global config (`GIT_CONFIG_GLOBAL`
if set, else `$HOME/.gitconfig` + `$XDG_CONFIG_HOME/git/config`), then repo-local. → For
attribution we can win with **env vars alone**, no files required.

**HTTPS push auth:** git does *not* read `GH_TOKEN` itself. It uses a **credential helper**.
Two clean ways to feed a token:
1. **`gh` as the git credential helper** (`gh auth setup-git` writes
   `credential."https://github.com".helper = !gh auth git-credential` into gitconfig). `gh`'s
   helper honors `GH_TOKEN`/`GITHUB_TOKEN` from env → `git push` transparently uses the
   per-user token. **This is the path we pick** (one token var covers both `gh …` and
   `git push`).
2. A raw env-var helper (`credential.helper = "!f(){ echo password=$GH_TOKEN; echo username=x; }; f"`)
   or URL rewrite embedding the token. Works without `gh` installed, but leakier/uglier.

**`gh` CLI:** `GH_TOKEN`/`GITHUB_TOKEN` env **take precedence** over stored `hosts.yml`, so
with the env set the `gh` config dir can even be empty. `GH_CONFIG_DIR` overrides
`~/.config/gh` — we set it per-uid so any `gh auth`/`gh` state a user creates stays isolated.

**Config file targeting:** `GIT_CONFIG_GLOBAL=<path>` **replaces** the single global config
file (it's not additive) — fine, we generate a complete per-uid file. (Inline alternative:
`GIT_CONFIG_COUNT` + `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n` — no file, but noisier env.)

**SSH:** resolves off `$HOME/.ssh` (or `GIT_SSH_COMMAND` / a per-repo `core.sshCommand`).
Per-user SSH would need `GIT_SSH_COMMAND="ssh -i ~/hub/<uid>/ssh/id_ed25519 -o IdentitiesOnly=yes"`.
We prefer HTTPS+token over SSH for L1 (simpler onboarding, no per-key GitHub setup).

---

## 4. Options analysis

### 4.1 Per-user credential model (what identity to hand out)

| Option | Attribution | Push scope | Onboarding friction | Revoke/rotate | Verdict |
|---|---|---|---|---|---|
| **Fine-grained PAT per user** (owner-provisioned) | ✅ per-user | ✅ scoped to user's repos/org | Low: paste one token | Manual (regenerate) | **L1 pick** |
| Classic PAT per user | ✅ | ⚠️ coarse scopes | Low | Manual | fallback if fine-grained unavailable |
| **GitHub App** (install per user, mint installation tokens) | ✅ | ✅ tight, per-install | Med (App + per-user install) | ✅ auto-expiring 1h tokens | **best hardening target** (§7) |
| OAuth device/web flow at login | ✅ | ✅ user-consented | **Lowest** (click "authorize") | ✅ revocable | ideal UX; more infra — deferred |
| SSH deploy/user keys | ✅ (via gitconfig) | ✅ per-key | High (generate + register key each) | Manual | not for L1 |
| **Status quo: one shared token** | ❌ everyone identical | ❌ shared blast radius | none | — | **the bug we're fixing** |

### 4.2 How to *inject* it per-instance (the mechanism)

| Mechanism | What it isolates | Blast radius / risk | Verdict |
|---|---|---|---|
| **Targeted env via `CredentialSource`** — `GH_TOKEN`, `GIT_AUTHOR/COMMITTER_*`, `GH_CONFIG_DIR`, `GIT_CONFIG_GLOBAL` | git identity + gh auth + gh state, surgically | Small, well-understood; no effect on other tooling | **L1 pick** |
| **Override `HOME=~/hub/<uid>`** | *everything* HOME-relative auto-isolates (`.gitconfig`, `.config/gh`, `.ssh`) with no explicit vars | **Large** — also relocates npm/bun/tool caches, ssh known_hosts, shell dotfiles; must pre-seed each `HOME`; interactions with `CLAUDE_CONFIG_DIR`/`CODEX_HOME` (explicit, so *those* stay pooled — good, but everything *else* moves too). Higher surprise surface. | rejected for L1 (revisit only if we want full HOME isolation) |
| Per-session env via UI (`params.env`) | per-session, not per-user | wrong layer — identity is a user property, not a UI/session choice; also puts secrets in session records | rejected |
| Loopback **credential-broker helper** (git helper calls gateway for a short-lived token; nothing in env) | token never in env or instance disk | best confidentiality; more moving parts | **deferred hardening (§7)** |

**Why targeted env over HOME override:** it's the minimal change that fixes attribution +
scope, it composes cleanly with the existing pooled-Claude injection, and it avoids
relocating unrelated per-user state. `CLAUDE_CONFIG_DIR`/`CODEX_HOME` already prove that
explicit per-tool env is the house style here.

### 4.3 Where tokens live + who provisions them

- **Store:** `~/hub/secrets/github.json` — `{ "<uid>": { "token": "...", "name": "...",
  "email": "...", "login": "..." } }` — mode `0600`, gateway-owned, **hot-reloaded** exactly
  like `allowlist.json`. Keyed by Firebase uid so it maps 1:1 to the single Google login
  (mirrors the allowlist → same admin surface).
- **At rest (L1):** plaintext `0600`. This matches the *current* posture of the committed
  Firebase SA key on the box (§10 deferred item: "rotate + purge"). Encryption at rest is a
  §7 hardening item, not an L1 blocker for a trusted team on Tailscale.
- **Provisioner (L1):** the **owner** pastes each allowlisted user's fine-grained PAT into
  the file during onboarding (same moment they add the email to the allowlist). No user
  self-service UI required for L1.
- **Provisioner (later):** user self-serves via GitHub App install or OAuth at first login
  (§7) — that's what makes it truly "share a link, Google login, zero setup."

---

## 5. Recommended L1 design (concrete)

### 5.1 Seam: a composite credential source

Keep `SharedCredentialSource` (pooled Claude/Codex) untouched; add
`GitHubCredentialSource implements CredentialSource` and compose them so `resolve(uid)`
returns the union. The supervisor is unchanged — it already does
`...this.credentials.resolve(handle.uid)`.

```
resolve(uid):
  shared  = SharedCredentialSource.resolve(uid)      // CLAUDE_CONFIG_DIR, CODEX_HOME
  gh      = GitHubCredentialSource.resolve(uid):
    rec = githubSecrets[uid]            // {token,name,email,login}, hot-reloaded
    if !rec: return {}                  // graceful — user just has no git identity yet
    ensurePerUidGitconfig(uid, rec)     // write ~/hub/<uid>/git/config (idempotent)
    return {
      GH_TOKEN:            rec.token,
      GH_CONFIG_DIR:       ~/hub/<uid>/gh,
      GIT_CONFIG_GLOBAL:   ~/hub/<uid>/git/config,
      GIT_AUTHOR_NAME:     rec.name,   GIT_AUTHOR_EMAIL:    rec.email,
      GIT_COMMITTER_NAME:  rec.name,   GIT_COMMITTER_EMAIL: rec.email,
    }
  return { ...shared, ...gh }
```

Per-uid gitconfig (`ensurePerUidGitconfig`) contents:

```ini
[user]
    name  = <rec.name>
    email = <rec.email>
[credential "https://github.com"]
    helper = !gh auth git-credential      # gh honors GH_TOKEN → git push works
[url "https://github.com/"]
    insteadOf = git@github.com:            # normalize ssh remotes to https so token path is used
```

New config knobs (`config.ts`, all env-driven like the rest): `MAESTRO_GITHUB_SECRETS_PATH`
(default `~/hub/secrets/github.json`), and a feature flag
`MAESTRO_GITHUB_PER_USER` (default off → today's behavior; on → inject).

### 5.2 Filesystem additions (extends DESIGN-A §6)

```
~/hub/
  secrets/
    github.json                 # uid → {token,name,email,login}  (0600, gateway-owned)
  <uid>/
    git/config                  # per-uid GIT_CONFIG_GLOBAL (generated, idempotent)
    gh/                          # per-uid GH_CONFIG_DIR
```

### 5.3 What this guarantees

- **Attribution:** every commit carries the acting user's name/email (env overrides win even
  over a repo's own `user.*`).
- **Push scope:** pushes authenticate with *that user's* fine-grained PAT → they can only
  reach repos their token allows; no shared blast radius.
- **Both `git` and `gh`** work: `gh` reads `GH_TOKEN` directly; `git push` reaches the same
  token via the `gh` credential helper.
- **No `maestro-server` change, no supervisor change** — purely the seam + gateway config +
  a secrets loader (a sibling of the allowlist loader).

### 5.4 Onboarding UX (L1)

1. Owner adds `user@gmail.com` to `allowlist.json` (already the flow).
2. Owner adds one row to `github.json`: the user's fine-grained PAT + display name + email.
3. User visits the link → Google login → their instance spawns with their GitHub identity
   already wired. **Zero local setup for the user.**

The only non-zero step is the owner obtaining each PAT once. The friction-eliminating
successor (user clicks "Connect GitHub" → OAuth/App install, no PAT handling) is §7.

---

## 6. Security posture under soft isolation (D9) — read this

Design A runs all instances as **one OS user**; a user's agent *can* read another user's
`~/hub/<uid>/` and the shared cred dir (DESIGN-A §5). Injecting per-user tokens does **not**
change that boundary. Specifically, a malicious/compromised agent could:

- read `/proc/<other-instance-pid>/environ` → another user's `GH_TOKEN`;
- read `~/hub/secrets/github.json` → **everyone's** tokens;
- read another user's `~/hub/<uid>/gh/` or `git/config`.

**So per-user tokens under D9 buy correctness (attribution + scope), not confidentiality.**
This is deliberately consistent with what the design already accepts: the pooled Claude login
and every user's `DATA_DIR` are likewise readable across the trusted team. For a ~10-person
trusted team on Tailscale, that's the accepted posture *now* — the same "trust the team,
harden at the move" stance as A9/§10.

**Mitigations already worth doing in L1 (cheap):** fine-grained PATs scoped to the minimum
repos/permissions (least privilege limits blast radius even if a token leaks), and `0600` +
gateway-owned secrets file (keeps it off the browser/API surface).

---

## 7. Deferred / hardening path (matches DESIGN-A §10)

| Item | What it buys | When |
|---|---|---|
| **Loopback credential broker** — git credential helper injected as a *command* that calls the gateway over loopback with the instance's proven uid; gateway returns a short-lived token. **Token never in env or instance disk.** | Real confidentiality even under one OS user; closes the `/proc/environ` + secrets-file leaks | first hardening pass; natural extension of the CredentialSource seam |
| **GitHub App + installation tokens** (1h, auto-rotated by the broker) | Expiring creds, per-install scope, easy revoke, true self-serve onboarding | when moving off owner-provisioned PATs |
| **OAuth device/web flow at login** (uid ↔ GitHub identity self-linked) | Zero-touch onboarding, user-consented scopes | UX polish after broker exists |
| **Encrypt secrets at rest** (age/OS keyring) + rotate | Defense-in-depth for the store | with the SA-key rotation (§10) |
| **Per-user SSH** (`GIT_SSH_COMMAND` + per-uid keys) | For teams/repos that require SSH | only if a repo needs it |
| **Hard isolation** (per-user OS accounts / container / microVM) | Makes env + `/proc` + fs genuinely private | "the move" / if the team stops being fully trusted (DESIGN-A §10) |

The L1 env-injection design is **forward-compatible** with all of these: the broker, App
tokens, and OAuth all slot in behind the *same* `CredentialSource.resolve(uid)` seam — the
supervisor and server never learn the difference.

---

## 8. Non-goals for this doc

- No code in this pass (design/decision only).
- No VPS/deploy changes.
- Codex GitHub identity: same mechanism (Codex agents inherit the same instance env, so
  `GH_TOKEN`/`GIT_*` cover them too) — no extra work; Codex login itself is separately
  deferred (Claude-only pooling today).
