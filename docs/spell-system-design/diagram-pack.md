> ## ⚠️ SUPERSEDED (2026-07-04)
> These diagrams depict the dropped **`gate` action / 6-action taxonomy** and per-spell
> single-action / gate fail-mode model. v2 replaced it with the multi-rule engine (5 actions,
> no gate, per-rule loops, 8 events). Authoritative: `docs/spell-system-redesign.md` §11;
> current explainer: `docs/spell-system-explainer.md`. Kept for historical context only.

# Spell System Redesign — Design Diagrams

Visual design pack for the spell-system overhaul. Each diagram is an editable Excalidraw board (open the link, then File → Save to keep your own copy).

Locked design decisions: per-spell-type activation; spells attach on task **and** live-cast; full library (curated + custom spells + custom skills); concentric-ring borders on all three session boxes; color fixed on the spell from a palette; per-spell gate fail-mode; real loop scaffolds in v1; skills stay file-based but link to spells via `skillRef`.

---

## 1. Architecture (server / CLI / UI)
How the spell system spans the three packages and where each new piece lives: UI (SpellPicker, useSpellStore, ring borders) → server (SpellService + SPELL_LIBRARY, spellRoutes, WebSocketBridge, FileSystemSpellRepository, `Session.activeSpells`, `Task.spellIds`, SkillWriter) → CLI/Claude (plugin hooks.json, `maestro hook dispatch`, Claude Code PTY).

https://excalidraw.com/#json=WQCGNkaRnHHM5WGuZI9ly,34ByhGAlzK_ED5Q0bMyuJA

---

## 2. Activation Engine — fixed wiring, dynamic behavior
The core reliability mechanism. Because Claude reads `hooks.json` once at start, every hook event is bound once to a single `maestro hook dispatch <EVENT>` command. On fire, the dispatcher asks the server which active spells match the event, and runs each action. Toggling a spell on/off is pure server-state mutation — no config edits, works on running sessions, reliable even with no UI connected.

https://excalidraw.com/#json=gaoHqdD-0EuCvpYdX5efh,YP1CrIv1y-igQfBaAPBUMg

---

## 3. Data Model — Spell / ActiveSpell / Task
The new first-class `Spell` entity (color, action, loopType, trigger, failMode, maxIterations, skillRef, isDefault), seeded by curated `SPELL_LIBRARY` + user custom spells into one `FileSystemSpellRepository`. `Task.spellIds` references spells; `Session.activeSpells[]` holds per-session `ActiveSpell` bindings (spellId → Spell). Skills stay file-based and are referenced via `skillRef`.

https://excalidraw.com/#json=shrjtDKgRP1zZwYDIlGVh,tQRurS6HL0jVgat2uydSVw

---

## 4. Spell Actions → Claude Hook Protocol
The action taxonomy mapped to Claude's hook return protocol: inject-prompt (PTY), feed-context (stdout), gate (PreToolUse exit 2 + reason, honors failMode), continue-loop (Stop exit 2 with iteration cap), run-command, notify-channel. Plus the four v1 loop scaffolds. **Feasibility gate:** must verify the bundled Claude build honors exit-2 gating/continuation before building gate + loop spells.

https://excalidraw.com/#json=GY2OnoCwe7Ou7fIAHFyU4,3GT7OTU-dbWoQR7md3CDqw

---

## 5. Lifecycle + UI Borders + Build Phases
End-to-end: assign spells on a task → spawn collects spellIds server-side into `manifest.spells` → session auto-activates → (also live-cast path) → WS `spell:activated` → UI active-spell color map → concentric-ring borders (cap 4, then "+N"). Includes the six-phase build sequence.

https://excalidraw.com/#json=BBAjt6v7BtwvCl4thZwMc,wUMrsQd21Afpu1vqTZEDKQ
