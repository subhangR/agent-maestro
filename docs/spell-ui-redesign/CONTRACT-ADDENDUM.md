# Contract Addendum — LOCKED (build against this in parallel)

This freezes the small new backend additions so BE / CLI / UI can build in parallel.
Everything else in `04-backend-contract.md` is already live and unchanged.

## Addition 1 — Loop-reset endpoint (D8, FR-6.6)

**Route:** `POST /api/spells/:id/reset-loop`
**Body:** `{ sessionId: string /* non-empty */, ruleId?: string }`
**Behavior:** on the session's `activeSpells` entry for `:id`, zero the loop counter(s):
- if `ruleId` given → set `ruleIterations[ruleId] = 0`
- if omitted → reset ALL keys → `ruleIterations = {}`
Persist the session, then emit `spell:loop_reset`.
**Returns:** `{ spell: Spell, sessionId: string, activeSpell: ActiveSpell }`
**Errors:** 404 if spell not found; 404 if session not found; 404/400 if the spell is not
active on that session; 400 if `sessionId` empty.

Service method to add:
`SpellService.resetLoop(spellId: string, sessionId: string, ruleId?: string): Promise<{ spell; sessionId; activeSpell }>`
Validation schema: `resetLoopSchema = { sessionId: z.string().min(1), ruleId: z.string().optional() }`.

## Addition 2 — WebSocket forwarding of firing + reset events (D9, FR-7.1, FR-6.6)

Forward two events the dispatcher/service emit but the bridge does not yet relay:

- `spell:rule_fired` — payload (already emitted by `HookDispatcherService.emitRuleFired`):
  `{ sessionId, spellId, ruleId, event, action, outcome: 'ok'|'error', timestamp }`
- `spell:loop_reset` — new, emitted by `resetLoop`:
  `{ spellId, sessionId, ruleId: string|null, activeSpell: ActiveSpell, timestamp }`

WS bridge changes (`maestro-server/src/infrastructure/websocket/WebSocketBridge.ts`):
1. Add both to `IMMEDIATE_EVENTS`.
2. Add both to the broadcast forward allowlist (the `spell:invoked/activated/deactivated` list).
3. **Fix the `spell:` subscription filter** to also match a singular `sessionId` field —
   these two payloads use `sessionId` (not `sessionIds[]`/`targetSessionId`). Resolve target
   ids as: `data.sessionIds ?? (data.targetSessionId ? [data.targetSessionId] : (data.sessionId ? [data.sessionId] : []))`.

## UI store wiring (consumers of the above)

- `useActiveSpellsStore`: on `spell:loop_reset`, replace that active spell's `ruleIterations`
  from `activeSpell` (authoritative), superseding the existing optimistic `resetRuleIterations`.
- New rule-fired activity: consume `spell:rule_fired` (per-session recent-activity feed, S8).

## CLI REST usage (headless surface)

The CLI drives everything over existing REST + the two additions:
- create → `POST /api/spells` (CreateSpellPayload); list → `GET /api/spells`;
  show → `GET /api/spells/:id`; edit → `PUT /api/spells/:id`; delete → `DELETE /api/spells/:id`
- activate → `POST /api/spells/:id/activate {targetSessionIds[], invokerSessionId?}`
- deactivate → `POST /api/spells/:id/deactivate {targetSessionIds[]}`
- active list → `GET /api/sessions/:id` then read `.activeSpells`
- reset-loop → `POST /api/spells/:id/reset-loop {sessionId, ruleId?}`
- fire → `maestro hook dispatch <event>` (existing hook route → dispatcher)
- one-shot cast (Mechanism B) → `POST /api/spells/invoke` (unchanged)

## Non-goals (do NOT build)

- Dry-run/test-fire endpoint (D10) — deferred.
- notify-channel per-channel guaranteed routing (D11) — best-effort hint only.
- Scheduling — modeled but rejected on save; show disabled only.
- `gate`/tool-blocking — dropped, do not reintroduce.
</content>
