# Open Decisions

Things to decide **during** the design, each with a recommendation. Some imply small backend
additions — flagged **[backend]**. None block starting the design.

---

## Product / UX decisions

### D1 — One "Spell Studio" vs separate browse/detail/edit surfaces
Do browse (S1), detail (S2), and edit (S3) live as one unified surface or as distinct
modals/panels?
**Recommendation:** a single studio (list on one side, detail/edit on the other) reads more
modern and keeps context, but a focused full-screen editor for S3 is fine too. Your call.

### D2 — How prominent is Mechanism B (one-shot casts) in the new UI?
The redesign is about automations (A). Casts/entities (B) still exist. Do they share the
launcher with a clear toggle, or move to their own entry point?
**Recommendation:** separate entry points with distinct language ("Automate…" vs "Send…"),
sharing the target picker. Avoid one blended list.

### D3 — Ring system: keep concentric rings, or a new active-spell visual?
Concentric color rings per active spell are the current signal. They get busy with 4–5 spells.
**Recommendation:** keep a color identity but pair with an explicit chip/badge; design the
"many active" (overflow) case deliberately. Don't rely on color alone (a11y).

### D4 — Editor density for many rules
A 20-rule spell can't be 20 open forms.
**Recommendation:** collapsed rule = its one-line summary; expand to edit. Add-rule inserts an
expanded card. Consider grouping by event.

### D5 — inject-prompt vs feed-context in the UI
These are subtle. Should the UI expose both, or present a single "message the agent" control
with an advanced "as context" option?
**Recommendation:** one body field + a small toggle "deliver as: prompt / context", with
one-line help. Don't make users learn two action names.

### D6 — Matcher UX
Structured tool-picker for tool events + advanced raw-regex for everything (per FR-3.3/3.4).
**Recommendation:** default to the friendly tool picker; tuck raw regex behind "Advanced".
Note there is a single `matcher` string on the backend — a structured "tool + arg regex"
builder must serialize down to one regex (no separate arg field is persisted).

### D7 — Where does observability (S8) live?
A global activity feed, a per-session panel, or both?
**Recommendation:** a lightweight per-session "recent automation activity" list, plus surfacing
run-command output inline. Full global feed is a [COULD].

---

## Backend additions implied (small, flagged for wiring)

### D8 — [backend] Loop-reset endpoint
FR-6.6 (reset a loop's iteration to 0) has **no server endpoint** today — the UI does it
optimistically/locally. To make it real: add `POST /api/spells/:id/reset-loop`
`{ sessionId, ruleId? }` that zeroes `ruleIterations[ruleId]` (or all) and emits an update.
**Recommendation:** add it; it's small and makes the loop UX honest.

### D9 — [backend] Forward `spell:rule_fired` over WebSocket
The dispatcher emits `spell:rule_fired`, but the WS bridge doesn't forward it to clients yet,
so S8 (observability) has no live data. Add it to the bridge's forward list.
**Recommendation:** add it; it's the data source for "why did this fire" and trust-building.

### D10 — [backend] Optional: rule dry-run / test-fire
FR-7.3 wants authors to test a rule without a live session. Would need
`POST /api/hooks/dispatch?dryRun=1` (or a dedicated endpoint) that runs match+action logic and
returns the outcome **without** side effects.
**Recommendation:** defer to a fast-follow unless you design a prominent test affordance.

### D11 — [backend] Optional: `notify-channel` real routing
`channel` is threaded through the event as a hint, but end-to-end delivery to a specific
channel depends on the relay. If the design leans on multi-channel notify, confirm the relay
honors `channel`.
**Recommendation:** treat channel as best-effort hint in v1; revisit if the design needs
guaranteed per-channel routing.

---

## Non-decisions (locked — don't redesign these)

- The **data model** (multi-rule, discriminated actions, 8 events, capability matrix) is
  shipped and fixed. Design within it.
- **Scheduling** is modeled but inactive — show as "coming soon", don't build controls that
  imply it works.
- **`gate`/tool-blocking** was intentionally dropped. Don't add a "block this tool" action
  unless we decide to bring it back (a separate backend change).
- **Clean-break** already happened; no legacy spell shapes to support.

---

## Hand-back checklist (what to bring when you return with a design)

- Screens for S1–S7 at minimum (S8–S10 welcome). 
- The editor (S3) covering: rule add/remove/reorder/collapse, all 5 action config panels, the
  event→action filtering, matcher (structured + advanced), run-command warning, validation &
  discard states.
- The active-spell treatment (S5) incl. loops, overflow, disabled, disconnected.
- Empty/loading/error/no-targets/risky-confirm states.
- Any new interaction you want that implies a backend change → flag it so it's scoped with the wiring.
