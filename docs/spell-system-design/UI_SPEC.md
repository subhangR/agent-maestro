# Spell UI — Master Specification (UI_SPEC)

Integrated output of Movement 2 (Design Team). This is the **source of truth for M3 implementation**, alongside three detail specs:
- `uispec/01-design-system.md` — palette, ring system, type/space/motion (owner: ui-systems)
- `uispec/02-ux-flows.md` — flows, activation, ensembles, states, a11y (owner: ux-flows)
- `uispec/03-components.md` — component inventory, wireframes, props, store map (owner: components)

Ground truth upstream: `DESIGN_BRIEF.md` + the 6 `*.excalidraw` diagrams.

## 1. Vision & principles
A from-scratch spells UI: a fast, keyboard-first **SpellLauncher** for casting; clear **activation state** rendered as additive **concentric rings** on every session box; first-class **ensembles** for multi-session coordination; and inspect/edit surfaces that feel crafted. Accessible (WCAG-AA, both themes, reduced-motion) and engineered to compose with existing tile visuals without clobbering them.

## 2. Design system (see 01)
- **SPELL_COLORS**: fixed 10-entry palette (brass, vermilion, moss, lapis, amber, aubergine, teal, clay, slate, plum), each `{primary,dim,border,text}` with AA-verified hex for warm-paper light + warm-graphite dark. The 9 curated spells are color-mapped; brass/clay/slate reserved for user spells.
- **Ring system**: one `.spell-ring` utility generalizing `coordinator-glow` into a CSS-var-driven inset `box-shadow` stack of up to 4 hairline rings (`--spell-ring-1..4`), `+N` overflow badge past 4, applied via a `SpellRingHost` wrapper on `.pn-st`, `.pn-srail-s`, `.terminalContainer`. Canonical composition rules with `--selected`/`--needsInput`/coordinator-glow in 01 §2.6.
- **Type/space/elevation/icons**: reuse Atelier tokens (Hanken/Newsreader/JetBrains, `--pn-sh-*`, `--pn-r-*`, Lucide). **Motion**: cast-pulse, iter-tick, ensemble-breathing, picker-open — all behind `prefers-reduced-motion`.

## 3. UX flows (see 02)
- **Cast**: `Cmd/Ctrl+Shift+S` opens the launcher; keyboard-first nav, debounced search, focus trap; risky-cast confirm + 5s undo.
- **Activation visibility**: rings on the 3 boxes + inline chip-strip + Spellbook drawer + spell-detail flyout; toggle on/off.
- **Multi-session/ensembles**: single | broadcast | coordinate; ensemble setup (name + roles), SpacesRail grouping, cross-session message, disband.
- **Trigger/hook UX**: flyout switch per spell; failMode friction for gates; loop `maxIterations` stepper.
- **States**: empty/loading/error/no-target/disconnected; locked WCAG-AA + reduced-motion contract.

## 4. Component inventory (see 03)
SpellLauncher (replaces SpellPicker) + SpellCard/SessionTargetChips/CastModeToggle · SpellDetailsView (side-drawer, promotes to modal for edit) · ActiveSpellsPanel (popover off ring badge + inline strip) · SpellRingHost (ring integration) · EnsembleGroup (rail group + dock, shared halo, leader chip, message/disband) · CustomSpellEditor · CustomSkillEditor · TaskSpellAssignment (task-modal section, launcher in "attach" mode).

## 5. Store & file map (consolidated, from 03 §8–9)
- **Stores (replace `useSpellStore`)**: new stores for spell library/definitions, active-spells per session, ensembles, launcher UI state, and editors. M3 must reconcile this with the server contracts in DESIGN_BRIEF (Spell entity, Session.activeSpells, Ensemble).
- **CSS**: new `.spell-ring` utility + spell-surface styles; retire/replace `styles-spells.css`.
- Full create/modify file list in `uispec/03-components.md` §9 and `01-design-system.md` §6.

## 6. M3 hand-off — which feature team builds what
- **ui-borders team**: `.spell-ring` utility + `SpellRingHost` + ring stores + WS wiring (rings on all 3 boxes; `+N`; composition with coordinator-glow).
- **ui-surfaces team**: SpellLauncher, SpellDetailsView, ActiveSpellsPanel, EnsembleGroup, custom editors, TaskSpellAssignment — built against mocked stores first, then wired to server contracts.
- Depends on **foundation team** (Spell entity, Session.activeSpells, activate/deactivate + WS) and **server-dispatch/cli-hooks** for live data.

## 7. Ring contract (CANONICAL — overrides 01/03 if they disagree)
The ring system drifted across specs during design; this is the frozen contract. Implementers follow THIS:
- **CSS vars (per slot, 1..4):** `--spell-ring-N`, `--spell-ring-N-rgb`, `--spell-ring-N-w`. (Prefix normalized across 01/03; no bare `--ring-*`.)
- **Helper:** `spellRingAttrs(activeSpells)` in `maestro-ui/src/utils/spellRings.ts` returns `{ style, 'data-spell-rings', 'data-spell-ring-names', 'data-spell-ring-overflow' }`. `SpellRingHost` SPREADS the whole object onto the host element. `data-spell-ring-names` is CSV (e.g. "Guardian,Test Sentinel,+2") and is the canonical source for the ring tooltip + e2e selectors (ux-flows depends on it). `spellRingStyle()` is a style-only convenience for non-host callers.
- **Stroke / contrast:** solo ring (depth 1) and ring 1 always use `primary` (100%, AA-verified ≥3:1 on both surfaces); rings 2–4 use 42% `border` (disambiguated by hue+position); ensemble outermost ring always `primary`.
- **Overflow:** ring 4 KEEPS the 4th spell's color; `.spell-ring__overflow` "+N" pill renders identically on all 3 hosts, inside the host (top-right on `pn-st`/terminal, bottom-right on `pn-srail-s`). No neutral ring-4, no rail "dot", no negative offsets.
- **Iter-tick:** paints on `.spell-ring__overflow` / `.spell-ring__tick`, never on ring box-shadows; JS path gated by `useReducedMotion()`.
- **Composition:** additive with `--selected`/`--needsInput`/`.coordinator-glow` via the merged `.coordinator-glow.spell-ring` rule (01 §2.6).

## 8. Critic resolution (M2 closed)
Critique `uispec/00-critique.md` verdict was ship-with-fixes. All top-5 + secondary fixes applied: palette reconciled to the frozen 10 IDs; solo-ring contrast fixed; ring var contract unified (above); orphan components named + migration table + legacy types deleted in P1 (03 §8.1/§8.2); iter-tick perf + reduced-motion; focus order + keybind deconfliction (02). Legacy `SpellEntity/SpellEntityType/SpellDefinition/SpellInvocation` deleted in P1 with `Spell` landing same commit; `CustomPrompt` retained only for the on-disk migration window.
