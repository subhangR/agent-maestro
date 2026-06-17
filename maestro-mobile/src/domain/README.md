# `domain/` — the shared vocabulary (owner: 📐 Lexicon)

Pure TypeScript. No React, no fetch, no WebSocket, no platform APIs. Everything
downstream — Conduit (`services/api/`), Pulse (`services/realtime/`), Ledger
(`state/`), Forge (`features/`), Palette/Bedrock — imports its entity shapes,
enums, wire contracts, and display helpers from **here and nowhere else**.

> **Rule #1 — never invent an entity shape outside `domain/`.** The
> maestro-server is the source of truth and is immutable. We model what it
> *does* return, not what we wish it returned. Where the Atelier design wants a
> different shape, that translation is an explicit function in `derive/`.

## Layout

```
primitives.ts   EpochMs / Iso8601 / IsoDate / JsonValue / JsonObject (timestamp footgun lives here)
ids.ts          branded ids (TaskId, SessionId, …) + asX() boundary casts — opt-in, NOT inside entities
enums.ts        every closed union + normalizeMode/isWorkerMode/isCoordinatorMode (verbatim from server)
entities/       persisted server objects, mirrored field-for-field
contracts/      rest.ts (payloads + response envelopes) · ws.ts (envelope + event map + RealtimeEvent) · pty.ts
schemas/        zod v4 boundary validation — spawn.ts, wsEnvelope.ts (OPT-IN import, NOT in the barrel)
derive/         server → Atelier display reconciliation (sessionStatus / agentTool / mode)
__sync__/       compile-time drift guard (dev-only, never bundled)
index.ts        barrel: primitives · ids · enums · entities · contracts · derive  (NOT schemas)
```

## The three things this layer gets right

1. **Timestamp fidelity (do NOT normalize).** The server is intentionally mixed:
   epoch-ms `number` on Task/Session/DocEntry/TaskList/TaskGraph, ISO-8601
   `string` on TeamMember/Team/ModelProfile. `EpochMs`/`Iso8601` make the
   difference visible at every field. Normalizing here would diverge from the wire.

2. **The canonical session-status union.** `derive/sessionStatus.ts` exports
   `UiSessionStatus` (8 display states) and `toUiSessionStatus(session)` over the
   6 server statuses. `run` ⇐ `working`; `wait` ⇐ `needsInput.active`. **Render
   from `toUiSessionStatus`, never from raw `status`**, or the "needs input" dot
   is lost. Tab membership (`isActiveTab`/`isCompletedTab`/`isArchivedTab`,
   `sessionTab`) also lives here — `archivedAt` wins over `humanCompletedAt`.

3. **The WS envelope + Array.isArray rule.** `contracts/ws.ts` types the envelope
   `{type,event,data,timestamp}` (server guarantees `type===event`).
   `schemas/wsEnvelope.ts → parseWsMessage(raw)` always returns an array
   (wrapping the single immediate-event case), safe-parses, and **drops unknown
   event names** so a server version bump never crashes the client. Pulse calls
   only this — never `JSON.parse` directly.

## Keeping in sync with the server

- **Hand-mirror with provenance.** Every entity/enum file carries a
  `// Mirrors maestro-server/src/types.ts <X>` header.
- **Compile-time drift guard.** `__sync__/server-drift-guard.ts` `import type`s
  the server source and asserts **mutual assignability** for every entity, enum,
  payload, and the event map. It runs under its **own** gate:

  ```bash
  npx tsc -p tsconfig.drift.json --noEmit   # drift gate — reaches into ../maestro-server
  npx tsc --noEmit                          # app gate — excludes __sync__, never sees the server
  ```

  Isolation contract (Sentinel-enforced): the app `tsconfig.json` **excludes**
  `src/domain/__sync__`, and Metro `blockList`s `__sync__` + `../maestro-server`,
  so server (CJS) type-errors never enter the app gate and server code never
  ships in the RN bundle. A real mirror-vs-server mismatch fails **only** the
  drift gate. When `maestro-server/src/types.ts` changes, re-run the drift gate;
  fix the mirror until green.

  > Standardized on `__sync__` (PROJECT_STRUCTURE.md's `__drift__` wording is
  > stale — the tsconfig + metro configs reference `__sync__`).

## Reality notes vs `planning/domain-types.md`

This worktree's server (`feat/mobile-app` base) has **no** rich Spell entity
(action/loopType/trigger/failMode/color), **no** `SPELL_COLORS`, and **no**
`Ensemble` — those live on a different branch. We mirror only the spell types
THIS server delivers (`SpellDefinition`, `SpellEntity`, `SpellInvocation*`,
`CustomPrompt`). `derive/spellColor.ts` and an `Ensemble` entity are therefore
**not shipped** — adding them would mean inventing shapes the server can't
confirm. Re-introduce them only when/if the server gains them.

`endpoints.ts` and any auth schemas are intentionally out of v1 (Conduit keeps
free-form client methods typed by `contracts/rest`; v1 is no-auth, future seam is
`?token=` only — cookie/Bearer are not modeled).
