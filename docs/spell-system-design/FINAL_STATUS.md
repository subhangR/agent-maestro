> ## ⚠️ SUPERSEDED (2026-07-04)
> Pre-redesign build status. It documents the dropped **`gate` action + 6-action taxonomy +
> 6 hook events** and a single-action `Spell` as shipped — that model was replaced by the v2
> multi-rule engine (5 actions, no gate, 8 events). Authoritative contract:
> `docs/spell-system-redesign.md` §11; current explainer: `docs/spell-system-explainer.md`;
> library: `docs/spell-library.md`. Kept for historical context only.

# Spell System Build — Final Status

**Branch:** `feat/spell-system-server-dispatch` @ `a01b4b9` (off `feat/spell-system` foundation, off `fix/diagram-doc-detection-and-chips`).
**Typecheck:** maestro-server / maestro-cli / maestro-ui all `tsc --noEmit` exit 0.
**Tests:** new `hook-dispatcher.test.ts` 7/7 pass.

## Conductor movements (all complete)
- **M1 Audit** (Workflow, 4 readers) → go-with-fixes.
- **P0 Spike** → exit-2 PASSED; gate + continue-loop ship native.
- **M2 Design** (5-agent team + critic) → `UI_SPEC.md` + 3 section specs; full new UI.
- **M3 Implementation** (foundation + 4 feature teams + integrator) → all packages green.
- **M4 Review** (Workflow, 40 agents) → NOT ship-ready (2 blockers + fixes) → fixed by 2 disjoint fixers → **re-verified PASS**.

## What shipped
- **Server:** first-class `Spell` entity + `FileSystemSpellRepository` + curated `SPELL_LIBRARY` (9 spells); `Session.activeSpells`; `Task.spellIds`; spell CRUD + activate/deactivate routes + WS events; `HookDispatcherService` + `POST /api/hooks/dispatch` with the 6-action taxonomy (inject-prompt, feed-context, gate, continue-loop, run-command, notify-channel); gate/continue-loop via native exit-2; multi-target invoke; Ensemble entity/service/routes/WS; double-inject fixed; manifest.spells populated at spawn; hook-dispatch ownership check; ReDoS guards.
- **CLI:** `maestro hook dispatch <EVENT>` (fixed-wiring dispatcher, graceful degrade); hook-event bindings in both plugin hooks.json; `manifest.spells` carriage + spawn auto-activate; `maestro ensemble message`; spell invoke/create contract fixed.
- **UI:** SpellLauncher (replaces SpellPicker), SpellDetailFlyout, ActiveSpellsPanel (4 surfaces), SpellbookDrawer (Cmd/Ctrl+Shift+B), EnsembleGroup/Dock/MessageComposer, CustomSpell/SkillEditor, TaskSpellAssignment; concentric-ring borders on all 3 boxes (list tile, Spaces rail, terminal panel) with depth-aware contrast + "+N" overflow; SPELL_COLORS palette; 1090-line authored `sp-*` CSS (token-driven, light+dark, reduced-motion); active-spell read store + write store; legacy types deleted, callers migrated; aria-labels + cast-pulse.

## Deferred / known (NOT blockers — for follow-up)
- UI verified by typecheck only — **NOT run in a browser/app** (`bun run build:ui` skipped: concurrent vite builds SIGTERM each other). Needs a manual visual pass.
- `ActiveSpellRow` still has the destructive enable checkbox (only the chip-menu Pause was removed).
- Iteration-tick has no server `spell:iteration_advanced` event yet; iteration UI is partial.
- `/api/skills` not wired — CustomSkillEditor saves to a local stub (P6).
- `resetIteration` UI is a placeholder (no server endpoint).
- 5 pre-existing server test suites fail at base (`SessionRouteDependencies` missing teamService/ptyHostService) — NOT spell regressions.
- Lower-priority MEDIUM polish items from `m4-review.json` not all addressed.

## Not merged
The work is on `feat/spell-system-server-dispatch`. `feat/spell-system` still points at the P1 foundation (568611c). Fast-forward / PR when ready.
