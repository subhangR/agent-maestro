# tm8 — Security Model (v1: the local node, server + web)

**Status:** DRAFT v1 (2026-07-25) — authored by Vega per AM-2 P0-4 (adopted implementation review). Scope: Phase 1 local node under AM-1/T-D21 (no Tauri; browser UI on 4611/served bundle + tm8-server on 4610 + sidecar PG on 5442; server-side PTY execution). Phase 2 (gateway/hub/hosted) inherits the seams named in §9 and gets its own hardening pass.

**The core fact this document exists for:** tm8 v1 is a *browser-controlled arbitrary-code-execution system*. The web UI spawns agent sessions that run real shells with the user's credentials on the user's machine. RLS answers "who may read/write which graph rows"; everything else here answers "who may reach the server at all, and what can a reached server be made to do."

## 1. Assets and adversaries

**Assets:** the user's filesystem + shell (via PTY), provider API credentials (Claude/etc.), the graph DB (may contain private work), transcripts/logs/backups, git repositories (possibly with push credentials).

**Adversaries in scope for v1:**
- A1 Malicious web page in the same browser (drive-by): CSRF, DNS rebinding, WebSocket cross-origin hijack.
- A2 Other local processes/users on the machine (shared machines): port access, data-dir access.
- A3 Malicious repository content checked out into a project (compromised deps, hooks, prompt-injection payloads in files an agent reads).
- A4 Malicious or compromised agent output (prompt-injected agent attempts privileged CLI/API calls).
- Out of scope v1 (Phase 2+): remote network attackers (server is loopback-only by default), multi-tenant isolation, malicious space members (single-owner node).

## 2. Network binding and transport

- **S1. Loopback-only by default.** tm8-server binds `127.0.0.1:4610`; sidecar PG binds `127.0.0.1:5442`; Vite dev binds `127.0.0.1:4611`. Non-loopback binding (`TM8_BIND`) is an explicit opt-in and **requires token auth (S8) — the server refuses to start non-loopback with auth disabled.**
- **S2. Host-header allowlist** (DNS-rebinding defense): requests must carry `Host: localhost:4610`, `127.0.0.1:4610`, or an explicitly configured hostname; otherwise `403`. Applies to HTTP and the WS upgrade.
- **S3. WS Origin check:** the `/v2/ws` upgrade (and any PTY stream socket) rejects browser origins other than the served UI origin(s) (`http://localhost:4610`, `http://localhost:4611` in dev, configured origins otherwise). Non-browser clients (CLI) send no Origin — allowed, they authenticate per S8.
- **S4. CORS:** same-origin only. No `Access-Control-Allow-Origin: *`, no reflected origins. The UI is served by tm8-server (or the dev server proxies) precisely so cross-origin API access is never needed.

## 3. Browser-facing auth (CSRF posture)

- **S5.** v1 local mode auto-authenticates the owner (T-L7) — but **auto-auth only applies to requests that pass S1–S4** (loopback + Host + Origin discipline). A cross-site form-POST or rebound-DNS request never gets the auto-owner identity.
- **S6.** If cookies are used for the browser session they are `HttpOnly; SameSite=Strict`; state-changing endpoints additionally require a custom header (`X-TM8-Client`) that simple cross-site requests cannot set. Bearer-token clients (CLI, rigs) are exempt from cookie CSRF rules by construction.
- **S7.** The poll-fallback endpoint and all `/v2/*` reads obey the same rules — no "harmless" unauthenticated reads; graph reads leak private work.

## 4. Non-browser clients

- **S8. Token auth for CLI/agents:** `tm8` CLI and spawned agents authenticate with a node-issued bearer token (from `auth_sessions`), delivered to agent sessions via the manifest env, scoped to the agent's `team_member` identity (`can_act_as` resolves through the owner, T-L7). Tokens are revocable (session row deletion) and expire per R6 lifecycle.
- **S9.** The DB claims path stays per R2/T-L11: tm8-server owns the PG connection as a **low-privilege role**, sets `SET LOCAL` claims per transaction; no client ever holds DB credentials; no service-role bypass exists.

## 5. Execution safety (spawn, PTY, worktrees)

- **S10. Spawn only through the catalog.** `execution.spawn` is the sole session-creation path (work_session is excluded from `entities.create`), so RLS + capability gating + the command ledger see every spawn. Governance minimums: per-node concurrent-session cap (config, default 8) → `limit_exceeded`; `execution.terminate` is the universal cancellation path; every `execution.*` command lands in `command_ledger` (audit).
- **S11. Path discipline.** Session cwd/worktree paths are **server-computed** from the project's registered `workingDir` — never accepted raw from the client. Computed paths must resolve (after symlink resolution) inside the project root or the node's worktree area; otherwise `invalid_input`. Same rule for transcript/blob write paths (§7).
- **S12. Project trust levels.** A `project` carries `trust: trusted|untrusted` (AM-2). Spawning into an `untrusted` project requires an explicit per-spawn confirmation flag (`confirmUntrusted: true`); manifests for untrusted projects note the trust level so agent prompts can warn. v1 does not sandbox — trust is informed consent, and that is stated honestly in the UI copy.
- **S13. Prompt injection containment (v1 posture):** agents act with their own `team_member` identity and its command permissions — never with a broader identity; the compat adapter + graph CLI enforce per-persona `command_permissions` server-side (not just in the prompt). Destructive graph ops an agent's persona lacks are `forbidden` regardless of what the model asks for.
- **S14. Streams.** PTY attach requires `execution.streams.attach` authorization resolved through the graph (T-L10; `share_mode` + membership). Stream sockets obey S2/S3/S8. Frames never touch the DB; `drive` (input) mode is a later, separately-gated permission tier — v1 grants input only to the spawning owner.

## 6. Secrets

- **S15. Secrets never enter Postgres.** Provider API keys live in the OS environment / keychain and are injected into agent processes at spawn time by the execution block; `session_manifests` stores *references* (env var names), never values. Consequence: pg_dump backups are secret-free by construction.
- **S16. Redaction.** Transcript artifacts and server logs pass a redaction filter (known credential patterns: `sk-`-style keys, bearer headers, `AWS_`/`ANTHROPIC_`/`OPENAI_` env values seen in the clear) before storage. Redaction is best-effort and stated as such; S15 is the real defense.

## 7. Blob I/O safety (files.*)

- **S17.** Blob storage lives under the node data dir at `blobs/spaces/<spaceId>/<uuid>` — server-generated names only; client-supplied filenames are metadata, never paths. Upload requires the same membership RLS as the graph (invariant: graph RLS and blob authz never disagree); size limits and checksum verification on `uploadComplete`; MIME is stored as declared but served with `X-Content-Type-Options: nosniff` and a conservative `Content-Disposition` for non-media types.
- **S18.** Backups include blobs + registry + transcripts (AM-2): the scheduled backup job pairs `pg_dump` with a blob-dir snapshot; restore is a tested path (G1B acceptance), not a hope.

## 8. Data-dir hygiene

- **S19.** `~/.tm8*` created `0700`; PG `--auth=trust` is acceptable only because PG binds loopback and the dir is user-private — hosted compositions (Phase 2) use password/peer auth provisioned by the gateway.
- **S20.** Single-instance locking (R15) prevents two servers sharing one data dir; the lock file records pid+port for honest `doctor` diagnostics.

## 9. Phase 2 seams (named, not built)

Remote-facing auth surface (gateway) authenticates against the identity block (R1); bridge JWTs at verifying boundaries (R2); hosted-workspace quotas/isolation (process-per-user per maestro-gateway Design A); bridge fetch-blob authorization. None of this is reachable in v1: there is no remote surface (S1).

## 10. Acceptance (folds into gate G1A)

1. Server refuses non-loopback bind without auth; refuses bad Host; WS upgrade rejects foreign Origin (scripted negative tests in tools/conformance security suite).
2. Cross-site form-POST and rebound-Host mutation attempts fail (403/401) — rig-scripted.
3. Spawn path traversal attempts (`../`, symlinked project dir) → `invalid_input` (test).
4. Untrusted project spawn without `confirmUntrusted` → `forbidden` (test).
5. Manifest for a session with provider creds present in env contains no secret values (test greps manifest JSON).
6. Concurrency cap → `limit_exceeded`; terminate mid-run → single-writer transition to `exited` + ledger rows for both commands (test).
7. Blob upload with wrong checksum rejected; download without membership → `forbidden` (test).
