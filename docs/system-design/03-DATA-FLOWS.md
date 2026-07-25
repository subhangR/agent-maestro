# Data Flows

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

The API-level contract (routes, DTOs, event shapes, cursors) is owned by `docs/collab-v2-api-design/`. This doc covers **where data physically lives and how it moves between components** — the layer above their contract.

---

## 1. Local state — the system of record · **BUILT**

```
~/.maestro/data/           (prod)         ~/.maestro-staging/data/   (staging)
  projects/  tasks/  sessions/  team-members/  teams/  spells/  task-lists/
```

One subdirectory per entity type, JSON files, **atomic writes**. `~/.maestro/sessions/` holds per-session transcripts and logs (3,500+ dirs on this machine — this grows without bound and has no retention policy; worth noting as an operational gap).

The entity model: **Project** (container, `workingDir`, `isMaster`) → **Task** (hierarchical via `parentId`/`childrenIds`, many-to-many with sessions) → **Session** (a running agent, tracks `taskIds[]`, `timeline[]`, `docs[]`, `teamMemberSnapshot`) → **TeamMember** (persona: mode, model, permissions, identity prompt) → **Team** (grouped members with a leader, supports sub-teams).

Note `teamMemberSnapshot` on Session: the member's config is **copied** at spawn time, so editing a TeamMember doesn't retroactively rewrite the history of sessions that already ran under the old definition. That's a deliberate and correct immutability choice.

---

## 2. Real-time within the machine · **BUILT**

```
Service mutates entity
   └─► InMemoryEventBus
         └─► WebSocketBridge ──► connected UI clients
              · 50 ms batching window
              · per-entity throttle (sessions 500 ms, tasks 300 ms)
              · client-side filtering by sessionIds / projectId / taskIds
              · immediate bypass for spawn + modal events
```

The bypass matters: spawn and modal events are interactive and must not sit in a batching window.

**Known inefficiency** (from prior investigation, still open): broadcasts send full session objects and clients do not subscribe narrowly, so every client receives everything and filters locally. This is a primary source of UI lag at high session counts.

---

## 3. Agent spawn — the system's most intricate flow · **BUILT**

```
1. UI          POST /api/sessions/spawn  {taskIds, teamMemberId, mode}
2. Server      creates Session; generates MaestroManifest
                 (prompt context, skills, command permissions, identity)
3. Server      emits session:spawn_request over WebSocket  ── immediate, unbatched
4. UI          receives event; spawns a PTY via Tauri
                 with env vars + MAESTRO_MANIFEST_PATH
5. Terminal    runs `maestro worker init`
6. CLI         reads manifest → PromptComposer builds the system prompt
7. CLI         launches claude/codex with that prompt
8. Agent       runs `maestro …` commands ──► back to step-0 server
```

The loop closes: the server writes the manifest, the CLI turns it into a prompt, the agent acts through the CLI, and the server records it. Steps 3–4 mean **the UI owns PTY spawning by default** (`MAESTRO_PTY_HOST=tauri`) — which is exactly why headless/mobile/remote deployments require flipping to `MAESTRO_PTY_HOST=server`. That single flag is the hinge between "desktop app" and "hosted service".

---

## 4. Collab V2 entity graph · **PARTIAL**

Design (authority: `COLLAB_V2_ENTITY_GRAPH_DESIGN.md` + `docs/collab-v2-api-design/01-DATA-MODEL.md`): an entities envelope plus per-kind detail tables, homogeneous hierarchy, one typed edges table, messages anchored to any entity, a points ledger, derived counters, and RLS as authorization.

Physical path — **revised 2026-07-25**:

```
UI / CLI / agents ──► maestro-server /api/collab/v2 ──► PostgREST/RPC ──► Supabase
                        (mints a caller-scoped JWT with the SIGNING key;
                         holds no service-role key — RLS still enforces)
```

Verified deployed and RLS-enforcing. The UI's **direct** Supabase client — already effectively dead code — is now closed by decision: clients hold no Supabase credential, and `load.sh` no longer exports `VITE_SUPABASE_*`. maestro-server is the single client-facing boundary.

### Realtime — **revised**

Canonical **`WorkspaceEvent`** relayed by maestro-server:

```
Postgres change / server-side mutation
        └─► maestro-server  (canonicalises to WorkspaceEvent)
              ├─► LOCAL  : existing WebSocket bridge  (same one that carries
              │            session/task events — one transport, not two)
              └─► CLOUD  : SSE
```

Clients subscribe to **maestro-server**, never to Supabase Realtime or RTDB. This reuses the WS bridge that already exists and works (§2), rather than introducing a second realtime system alongside it.

**Current state is still PARTIAL:** what exists today is a **~5-second poll with full-reload fan-out**. Any doc describing Collab V2 realtime as built is inaccurate — the event relay above is the target, not the present.

---

## 5. Presence · **BUILT**

Firebase RTDB, verified live with three roots: `gatewayPresence`, `presence`, `spacePresence`. Rules require `auth != null` and constrain writes to `auth.uid === $uid`.

The discipline here is good and worth preserving: **RTDB holds only ephemeral state.** Durable entities are never mirrored into it. Presence is the one thing whose loss costs nothing, which is why it's the one thing allowed in a non-authoritative store.

---

## 6. Attachments · **BLOCKED**

Intended flow — clients never touch the bucket directly:

```
Client ──► Functions broker ──► verifies membership in Postgres (service-role)
                            ──► issues short-lived signed URL
                            ──► Storage Rules deny all direct client access
Postgres holds metadata + path; the bytes live in Storage under spaces/{spaceId}/…
```

The design is sound. **It cannot run: no Storage bucket exists on the Firebase project** (`07-VERIFICATION-LOG.md` N1). `collabStorageBroker.ts` is dead code against the current backend until provisioning happens.

---

## 7. Notifications · **DESIGNED**

```
Postgres notification_outbox  (table EXISTS — verified live)
      │ drained by a Firebase Function, FOR UPDATE SKIP LOCKED
      ▼
    FCM ──► device
Device tokens: Firestore fcmTokens/{token} = {uid, platform, updatedAt}; stale ones auto-deleted
```

Transactional-outbox is the right pattern — notification *intent* commits atomically with the data change, and delivery is a separate, retryable concern. The table is deployed; the drainer needs the service-role key (`06-NEEDS-FROM-USER.md` #3).

---

## 8. Configuration flow

Worth documenting because it's non-obvious and bites people:

```
~/.maestro/secrets/{common,secrets,<env>}.env
        │  source load.sh <env>   (maps canonical names → per-package names)
        ├──► VITE_API_URL                    maestro-ui — points at maestro-server ONLY
        ├──► MAESTRO_SUPABASE_* + _JWT_SECRET  maestro-server (sole Supabase client)
        └──► GOOGLE_APPLICATION_CREDENTIALS / MAESTRO_FIREBASE_*   admin paths
```

`VITE_SUPABASE_*` is **deliberately not exported.** Clients get a maestro-server URL and nothing else; re-adding those vars would silently reopen the direct-to-Supabase path that the 2026-07-25 boundary decision closed.

**The server does not load dotenv itself.** It reads only `process.env`, so variables must be injected by whatever launches it. Historically `maestro-server/scripts/run-dev.mjs` bridged this by reading `maestro-ui/.env.local` and re-mapping `VITE_SUPABASE_*` → `MAESTRO_SUPABASE_*`. The secrets store now supersedes that as the canonical source; see `05-ENVIRONMENTS-AND-SECRETS.md`.

Firebase **client** config is a special case: every field is **hardcoded** in `maestro-ui/src/firebase/config.ts` with env vars only as overrides. So the app always falls back to `maestro-5f3fc` and is never "unconfigured". These are public Web-SDK values, so this is acceptable — but it does make `maestro-ui/.env.local`'s stated role of "protecting Firebase config" misleading, since the same values are committed in source.
