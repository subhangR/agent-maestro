# Multi-Session Spells & Ensembles

Extension to the spell redesign: cast spells across sessions, and form coordinating ensembles.

Decisions: both **broadcast** and **coordinate** cast modes; coordinate creates a **persistent ensemble** with a cross-session channel; **both agents and the user** can initiate; members show **ensemble grouping + a shared-color ring**.

## New design pieces
- **Multi-target invoke** — `SpellInvocationPayload.targetSessionIds: string[]` + `invokerSessionId` (null = UI cast, or the caster session). Server loops targets and stamps `senderSessionId` on each `session:prompt_send`. CLI: `maestro spell invoke <id> --targets s1,s2,s3` (also fixes the existing strict-schema contract bug).
- **`Spell.castMode`** — `single | broadcast | coordinate`. Broadcast = same prompt to every target; coordinate = roles + shared objective + ensemble.
- **`Ensemble`** (new first-class entity) — `{ id, name, color, objective, memberSessionIds[], leaderSessionId?, spellId, createdBy }`, persisted like other repos, with `ensemble:created / updated / disbanded` WS events. Each member gets an `ActiveSpell` tagged `ensembleId` → drives the shared ring + grouping.
- **Cross-session channel** — `maestro ensemble message "<text>"` (and `--to <sessionId>`) routes a prompt to peers with sender attribution, reusing `session:prompt_send`. Coordinate spells can re-sync on hooks via the dispatcher (e.g. each member reports status to the ensemble on Stop).
- **UI** — multi-select sessions in the picker; ensemble grouping section in the sessions list; shared-color ring on members; disband action.

## Diagram

https://excalidraw.com/#json=R5t7dgK2RVdmjUihArYy3,DZj2jRXBIU9WO0BMlJlgvw
