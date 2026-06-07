# Alexa ↔ Maestro Integration — Implementation Plan

**Source design:** `/Users/subhang/Desktop/alexa-maestro-integration.md` (Dexa session, 2026-06-07)
**Plan author:** Coordinator session `sess_1780848143467_7ftd2h936`
**Date:** 2026-06-07
**Status:** Approved architecture, ready for phased implementation

---

## 0. TL;DR

We build a voice-driven control plane for Maestro. A user speaks to Alexa; the existing
`alexa-endpoint` ingress forwards the verified phrase to **a new module inside
maestro-server**, which delivers it to an **auto-seeded "Alexa Coordinator" team member
running in a built-in "Master" project**. The Alexa Coordinator routes the directive to the
target project's coordinator (or spawns one), and the result is announced back through a new
**`POST /api/announce`** server endpoint that wraps Voice Monkey. No Voice Monkey credentials
ever live in a Claude session.

## 1. Architecture (final)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ L0  VOICE                Echo (Alexa, open dexa → "send <phrase>")        │
└───────────────┬────────────────────────────────────────▲─────────────────┘
                │ HTTPS POST                              │ Voice Monkey
                ▼                                         │ /announcement
┌──────────────────────────────────────────────────────────────────────────┐
│ L1  alexa-endpoint/index.js   (PUBLIC, unchanged location)                │
│     • ask-sdk signature + timestamp verification (unchanged)              │
│     • on SendMessageIntent: POST to maestro-server /api/alexa/utterance   │
│     • return ack to Alexa within ~1s ("Got it, I'm on it.")              │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ HTTP (internal, localhost)
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ L2  maestro-server  alexa module  (NEW)                                   │
│     • /api/alexa/utterance  — receives verified phrase                    │
│     • resolves Alexa Coordinator session (well-known lookup)              │
│     • spawns one if missing; injects phrase as session prompt             │
│     • /api/announce  — wraps Voice Monkey, holds VM_TOKEN/VM_DEVICE       │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ existing /api/sessions/:id/prompt
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ L3  Alexa Coordinator session  (lives in Master project)                  │
│     • auto-seeded system team member; coordinator mode                    │
│     • project identification (memory aliases + master projects list)      │
│     • routes to existing project coordinator OR spawns one                │
│     • on completion: `maestro announce "..."` → /api/announce → VM        │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ maestro session prompt | session spawn --skill maestro-orchestrator
                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ L4  Project Coordinator  (per-project orchestrator)                       │
│     • decomposes, spawns maestro-worker sessions, monitors                │
│     • reports completion back to Alexa Coordinator via session prompt     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Locked decisions (from clarification round)

| Decision | Choice |
|---|---|
| L1 → server transport | `alexa-endpoint/index.js` stays as **thin signature-verifying proxy**; maestro-server stays localhost-only |
| Master controller location | **New module inside maestro-server** (not a separate package) |
| "Master" project | **Rename existing "Default" project to "Master"** and set `isMaster: true`; auto-provisioned by server first-run |
| Routing model | **Alexa Coordinator → existing project coordinators** (not direct workers) |
| Routing config | **Team-member memory** of the Alexa Coordinator + live `maestro master projects --json` lookups |
| Alexa Coordinator setup | **Auto-seeded system team member** when Master project is created |
| Voice Monkey credentials | **maestro-server env only**; server exposes `POST /api/announce`; new `maestro announce` CLI primitive |
| Announcement ownership | **Alexa Coordinator** is the sole announcer (no token in project coordinators) |
| Live voice loopback (Phase 4) | **Auto-seed an Alexa Debugger** system team member (`systemKind: 'alexa-debugger'`, stable ID `tm_system_alexa_debugger`); ingress routes utterances to any live debugger session (matched by `systemKind`, server-local) before the coordinator |

### 1.2 Port reconciliation

The design doc references `MAESTRO_API_URL=http://localhost:3000`. Actual ports in the running
stack: maestro-server is **3001 (prod)** and **4569 (staging)** — the server default `PORT` is
`4567`, but the staging stack runs the server on `4569` with the Vite UI on `4568` (UI bound to
the server via `VITE_API_URL=http://localhost:4569/api`). The `alexa-endpoint/index.js` itself
runs on `:3000` behind NPM/Pangolin. Plan target:

- `alexa-endpoint/index.js` keeps `:3000` (public ingress; what Pangolin terminates).
- `alexa-endpoint` calls maestro-server at `:3001` (prod) via `MAESTRO_UTTERANCE_URL` env var.
- For staging dev, point `MAESTRO_UTTERANCE_URL` at `http://localhost:4569/api/alexa/utterance`
  (this is the live staging integration target).

---

## 2. New components inventory

### 2.1 maestro-server changes

| Area | New |
|---|---|
| `src/api/alexaRoutes.ts` | `POST /api/alexa/utterance` (receive verified phrase), `POST /api/announce` (speak text) |
| `src/api/validation.ts` | Zod schemas for utterance + announce payloads |
| `src/application/services/AlexaIngressService.ts` | Find or spawn Alexa Coordinator; inject prompt; emit timeline event |
| `src/application/services/AnnouncementService.ts` | Voice Monkey HTTP client; rate-limit/dedupe layer; resolves device by project (Phase 4) |
| `src/infrastructure/voicemonkey/VoiceMonkeyClient.ts` | Thin fetch wrapper around `api-v2.voicemonkey.io/announcement` |
| `src/infrastructure/bootstrap/MasterProjectBootstrap.ts` | First-run: ensure a Master project exists, with `isMaster: true`, and seed the Alexa Coordinator + Alexa Debugger (`systemKind: 'alexa-debugger'`, stable ID `tm_system_alexa_debugger`) team members if absent. Idempotent on every startup. |
| `src/application/services/AlexaIngressService.ts` (Phase 4) | `findActiveDebuggerSession` resolves debugger team-member IDs via `teamMemberRepo` filtered by `systemKind === 'alexa-debugger'` (server-local, no hardcoded foreign ID) and routes to a live debugger session before the coordinator |
| `src/infrastructure/config/Config.ts` | New env keys: `VM_TOKEN`, `VM_DEVICE`, `ALEXA_ROOT_TEAM_MEMBER_ID` (fixed system ID) |
| `src/types.ts` | `SystemTeamMemberKind` enum extending TeamMember (so the seeded one is non-deletable) |

### 2.2 maestro-cli changes

| Area | New |
|---|---|
| `src/commands/announce.ts` | `maestro announce "<text>" [--device <name>]` → `POST /api/announce` |
| `src/prompting/capability-policy.ts` | Capability `voice:announce` (granted to coordinators and the seeded Alexa Coordinator) |
| `src/prompting/command-catalog.ts` | Register `announce` so coordinators see it in their prompt |
| `src/prompts/identity.ts` | When loaded by the Alexa Coordinator, append voice-specific guidance block |

### 2.3 alexa-endpoint/index.js (external repo) changes

Minimal patch — stays a thin verifier/forwarder:

- In `SendMessageIntent.handle`:
  1. Extract `query` slot.
  2. `POST` to `${MAESTRO_API_URL}/api/alexa/utterance` with `{ query, deviceId, sessionId }` (Alexa session ID for correlation). Timeout: 1.5s. Fire-and-forget on network error (still ack).
  3. Return spoken ack: "Got it, I'm on it."
- Add env: `MAESTRO_UTTERANCE_URL=http://localhost:3001/api/alexa/utterance` (prod) or
  `http://localhost:4569/api/alexa/utterance` (staging — current live target).
- Keep `ExpressAdapter(skill, true, true)` (signature + timestamp verification ON).

### 2.4 Domain model touches

- No new entity. Reuses Project, Session, TeamMember.
- **Project**: existing `isMaster` flag now describes the Master system project. The current `Default` project is renamed to `Master` and gets `isMaster: true`. The existing `Agent-maestro` master flag is preserved (multiple `isMaster` projects are already allowed by the model — confirm in `Project` schema during implementation).
- **TeamMember**: introduce a `systemKind?: 'alexa-coordinator'` discriminator so the seeded entity:
  - Cannot be deleted via normal flow.
  - Is recreated on startup if missing.
  - Carries a stable, well-known ID (`tm_system_alexa_coordinator`) so the ingress can look it up without configuration.

---

## 3. Routing logic (inside Alexa Coordinator)

The Alexa Coordinator is a Claude session — routing logic lives in its **identity prompt** and
its **team-member memory**, not in code. The prompt instructs it:

1. **Resolve project list:** run `maestro master projects --json`.
2. **Apply alias memory:** check team-member memory entries for `alias:<phrase> → <projectId>` mappings.
3. **Keyword match:** lowercase utterance, match against project `name` and known aliases.
4. **LLM disambiguation:** if 0 or >1 matches, ask itself (it's a Claude session) using
   `maestro master context` as additional context.
5. **Clarify if still ambiguous:** `maestro announce "Did you mean X or Y?"` — accept follow-up
   utterance in Phase 4 (Phase 1–3 just default to a configured fallback project).
6. **Find or spawn project coordinator:**
   - `maestro session list --project <pid> --json` filtered to coordinator role.
   - If present: `maestro session prompt <SID> --message "<directive>"`.
   - Else: `maestro session spawn --project <pid> --skill maestro-orchestrator --subject "Voice directive" --message "<directive>"`.
7. **Wait for completion signal** (project coordinator reports back via `maestro session prompt`
   to the Alexa Coordinator's own SID).
8. **Announce:** `maestro announce "<short spoken summary>"`.

### Memory seeding

On Alexa Coordinator creation, seed memory with bootstrap aliases — e.g.:

```
alias: "will" → proj_<will-id>
alias: "level up" → proj_<levelup-id>
alias: "auto grade" → proj_<autograde-id>
```

Memory is updated over time when the user corrects routing ("not Will, I meant LevelUp" →
append corrected alias).

---

## 4. Announcement contract

### 4.1 Server endpoint

`POST /api/announce`

```json
{ "text": "Done. Added habit morning run in Will.", "device": "yolo" }
```

- `device` optional, defaults to `process.env.VM_DEVICE`.
- Server calls Voice Monkey `GET /announcement` with `token`, `device`, `text`.
- Returns `{ success: boolean, vmResponse: any }`.
- Records the announcement in the calling session's timeline (`announcement_sent` event).
- Rate-limit per session: max 6/min (Voice Monkey has its own limits; ours is friendlier).

### 4.2 CLI

```
maestro announce "<text>" [--device <name>]
```

Capability: `voice:announce`. Default-on for coordinators; off for workers (workers report to
coordinators; coordinator announces). Override per team member via capability config.

### 4.3 Conventions enforced via Alexa Coordinator identity prompt

- Announce only on **terminal states**: completion, blocked-needs-input, hard failure.
- Spoken-friendly: no IDs, no code, no jargon.
- Keep < 25 words; otherwise summarize.

---

## 5. End-to-end happy path (post-implementation)

```
User: "Alexa, open dexa" … "send in will add a habit called morning run"

1. Echo  → POST /alexa             (SendMessageIntent, query="in will add a habit ...")
2. alexa-endpoint/index.js          → verify sig → POST :3001/api/alexa/utterance
3. alexa-endpoint                    → respond to Alexa: "Got it, I'm on it."          (<1s)
4. maestro-server alexa module      → look up well-known Alexa Coordinator session
                                     → if absent, spawn (Master project, system tm id)
                                     → POST /api/sessions/<alexa-sid>/prompt
                                       message = "in will add a habit called morning run"
5. Alexa Coordinator (Claude)
    a. maestro master projects --json
    b. memory lookup → "will" → proj_will
    c. maestro session list --project proj_will --json   → no coordinator
    d. maestro session spawn --project proj_will --skill maestro-orchestrator \
         --subject "Voice directive" --message "add a habit called morning run"
6. Will Project Coordinator
    a. maestro task create "Add habit: morning run"
    b. does it (or spawns worker)
    c. maestro session prompt <alexa-sid> --message "Done: habit 'morning run' added in Will."
7. Alexa Coordinator
    a. maestro announce "Done. Added habit morning run in Will."
8. /api/announce → Voice Monkey → Echo speaks the summary.
```

---

## 6. Phased delivery

### Phase 0 — Server scaffolding (target: 1 day)

- [ ] Add `alexaRoutes.ts` skeleton: `POST /api/alexa/utterance`, `POST /api/announce` (both return 501 initially).
- [ ] Add Zod validation schemas.
- [ ] Add `VoiceMonkeyClient` + `AnnouncementService`; implement `/api/announce` end-to-end.
- [ ] Add `maestro announce` CLI command.
- [ ] Smoke test: `maestro announce "hello world"` → hear it on the Echo.

**Exit criteria:** human can call `maestro announce` from any session and the Echo speaks.

### Phase 1 — Master project + Alexa Coordinator seeding (target: 1–2 days)

- [ ] `MasterProjectBootstrap` runs on server startup.
- [ ] Renames existing `Default` project to `Master`, sets `isMaster: true`. Idempotent (guard on a one-time migration marker in config).
- [ ] Adds `systemKind` field to TeamMember; create non-deletable Alexa Coordinator with stable ID `tm_system_alexa_coordinator`.
- [ ] Identity prompt for the Alexa Coordinator (routing instructions, announcement rules, memory usage).
- [ ] `AlexaIngressService.findOrSpawnAlexaCoordinator()` — spawns session into Master project if none active.
- [ ] Implement `/api/alexa/utterance` — calls `findOrSpawn`, then `/api/sessions/:id/prompt`.

**Exit criteria:** `curl -X POST localhost:3001/api/alexa/utterance -d '{"query":"hello"}'` lands as a prompt in a live Alexa Coordinator session.

### Phase 2 — Alexa ingress wiring + L1 proxy (target: 0.5 day)

- [ ] Patch `alexa-endpoint/index.js`: forward verified `query` to `${MAESTRO_API_URL}/api/alexa/utterance`, return fast ack.
- [ ] Add `MAESTRO_API_URL` to alexa-endpoint env / Docker.
- [ ] Smoke test: spoken phrase → Alexa Coordinator timeline shows the prompt.

**Exit criteria:** "Alexa, open dexa … send hello" → Alexa Coordinator session receives `"hello"` as a prompt within ~2s of speaking.

### Phase 3 — Routing + announcement (target: 2 days)

- [ ] Seed Alexa Coordinator memory with project aliases (use `maestro team-member memory append` in `MasterProjectBootstrap`).
- [ ] Coordinator identity prompt: complete routing logic (master projects lookup, memory aliases, LLM disambiguation, fallback to a default project).
- [ ] Coordinator instructed to call `maestro announce` on terminal states.
- [ ] Project coordinator instructed (via spawn message) to report completion back to the spawning session — already in `maestro-orchestrator` skill, verify wording is voice-aware.
- [ ] Smoke test: end-to-end loop on one project (Will).

**Exit criteria:** spoken instruction → routing → action → spoken result, single project.

### Phase 4 — Multi-project + hardening (target: 2–3 days)

- [ ] Routing works for ≥3 projects (Will, LevelUp, autograde).
- [ ] Blocker announcements ("The Will task is blocked — it needs your database password").
- [ ] Hard-failure announcements ("Sorry, that failed: …").
- [ ] Per-project default Voice Monkey device (`Project.voiceDevice` field — optional; only if multi-Echo).
- [ ] Allowed-verb guard or destructive-action confirmation (deny `delete project`, `drop table`, etc. unless re-confirmed).
- [ ] Supervisor: maestro-server monitors the Alexa Coordinator session; if it dies, respawn on next utterance (already covered by `findOrSpawn`, but add a periodic warmup).
- [ ] Timeout UX: if no terminal state in 10 min, announce "Still working on …".

**Exit criteria:** any of the seeded projects reachable by voice; clean failure modes.

---

## 7. Risks / open items

1. **`Project.isMaster` semantics with two masters.** Need to confirm the current model supports two `isMaster=true` projects (Master and Agent-maestro). Today `Agent-maestro` is master; renaming `Default` → `Master` may need a migration path. Check `Project` Zod schema and `FileSystemProjectRepository` before Phase 1.
2. **Renaming Default → Master is data-mutating.** Bootstrap must be idempotent and never destructive. Strategy: if a project named `Master` exists, leave it; if a `Default` exists and no `Master`, rename and flip the flag; otherwise no-op.
3. **Capability for `voice:announce`.** Need to extend `capability-policy.ts` to recognize the capability and emit it for the Alexa Coordinator. Verify the seeded team member receives it.
4. **Spam / loop guard on `/api/announce`.** A misbehaving Claude session could spam the Echo. Per-session rate limit (≤6/min) is in Phase 0; revisit thresholds in Phase 4.
5. **Voice Monkey downtime.** If `/api/announce` fails, server should retry once and log a timeline event; no spoken fallback exists.
6. **Signature verification posture.** `alexa-endpoint` keeps ask-sdk verification ON. The new server route `/api/alexa/utterance` is **localhost-only** — but Pangolin/NPM topology must enforce that maestro-server is not publicly reachable. Document this in `Phase 2`.
7. **Multi-utterance / conversational state.** Out of scope for v1 per the source doc; revisit in v2.
8. **Echo session id vs Maestro session id collision.** Alexa's `sessionId` is its own — pass it through as `alexaSessionId` to avoid confusion in the timeline.

---

## 8. Test plan summary

- **Unit:** `VoiceMonkeyClient` (mocked fetch), `AnnouncementService` (rate limit, dedupe), `AlexaIngressService` (spawn-if-absent, idempotency), `MasterProjectBootstrap` (idempotent rename).
- **Integration (Jest, in maestro-server):** `POST /api/announce` happy path + 429, `POST /api/alexa/utterance` finds-or-spawns and prompts, `MasterProjectBootstrap` on a fresh data dir.
- **CLI (Vitest):** `maestro announce` happy path + capability denial for workers.
- **Manual end-to-end (per phase exit criteria):** see Phase sections above.

---

## 9. Out of scope (v1)

- Multi-turn voice conversations / barge-in.
- Multi-user separation (single owner).
- Replacing the Agents UI; this remains a parallel voice front door.
- Cross-Echo routing (one default device in v1; per-project devices land in Phase 4 only if needed).
- Voice-driven project creation / team-member management.

---

## Appendix A — Files touched (cheat sheet)

```
maestro-server/
  src/api/alexaRoutes.ts                     [NEW]
  src/api/validation.ts                      [+schemas]
  src/api/index.ts (or router.ts)            [+register route]
  src/application/services/AlexaIngressService.ts      [NEW]
  src/application/services/AnnouncementService.ts      [NEW]
  src/infrastructure/voicemonkey/VoiceMonkeyClient.ts  [NEW]
  src/infrastructure/bootstrap/MasterProjectBootstrap.ts [NEW]
  src/infrastructure/config/Config.ts        [+VM_TOKEN, VM_DEVICE, ALEXA_ROOT_TEAM_MEMBER_ID]
  src/types.ts                               [+systemKind on TeamMember]
  src/container.ts                           [+wire services + bootstrap]
  test/alexa/*.test.ts                       [NEW]

maestro-cli/
  src/commands/announce.ts                   [NEW]
  src/index.ts                               [+register command]
  src/prompting/capability-policy.ts         [+voice:announce]
  src/prompting/command-catalog.ts           [+announce]
  src/prompts/identity.ts                    [+alexa-coordinator guidance block, conditional]
  tests/commands/announce.test.ts            [NEW]

alexa-endpoint/   (external repo)
  index.js                                   [forward to /api/alexa/utterance, fast ack]
  .env                                       [+MAESTRO_API_URL]
```

