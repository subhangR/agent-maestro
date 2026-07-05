# 00 — Design Critique (Spell System UI Redesign)

**Reviewer:** `design-critic` (adversarial quality gate, spell-design team)
**Scope:** `UI_SPEC.md` + `uispec/01-design-system.md` + `uispec/02-ux-flows.md` + `uispec/03-components.md`, reconciled against `DESIGN_BRIEF.md` and the six `*.excalidraw` diagrams.
**Spot-checks:** `maestro-ui/src/styles-coordinator-glow.css`, `maestro-ui/src/stores/useSpellStore.ts` (graphify), `maestro-ui/src/components/maestro/SpellPicker.tsx` (graphify), `maestro-ui/src/app/types/maestro.ts` (graphify: `SpellEntity` L855, `SpellEntityType` L847), `maestro-server/src/types.ts` `SpellEntity` L590, `maestro-ui/src/components/maestro/SessionListItem.tsx`.
**Quality bar applied:** stunning · properly engineered · WCAG-AA · light+dark · no jank · additive with existing tile visuals.

The work is strong on conceptual model and a11y intent, but it is not yet shippable: there are three serious cross-document **name/contract drifts**, two real **legibility/feasibility** flaws in the ring system, and a small set of **a11y and engineering bombs** that will surface in QA. Below are the gaps, ordered for action.

---

## 1. Cohesion gaps (cross-doc + client/server drift)

### 1.1 Palette IDs disagree across `01` and `03` — blocking
**Severity:** P0 (must fix before any code is written).

- `01-design-system.md` §1.2 ships the **frozen** 10-id palette: `brass, vermilion, moss, lapis, amber, aubergine, teal, clay, slate, plum`.
- `03-components.md` §0 lists a **different 8-id palette** in the token table: `amber, violet, emerald, rose, cyan, indigo, gold, slate`.
- `03-components.md` §6 (CustomSpellEditor wireframe) again uses `amber · violet · emerald · rose · cyan · indigo · gold · slate`.
- `02-ux-flows.md` is mostly id-agnostic but its example chip color `● purple` (§4.3, §4.4) maps to neither set, and `● cyan / ● teal / ● amber / ● violet` references in the picker wireframe (§2.2) align with `03`, not `01`.

This is a hard contradiction. Every reference in `03` to `--spell-color-amber` / `--spell-color-violet` / `--spell-color-emerald` etc. will resolve to *nothing* because `01` only exports `--spell-<brass|vermilion|moss|lapis|amber|aubergine|teal|clay|slate|plum>-{primary,dim,border,text}`.

**Fix (P0):**
- Author the redesign palette ONCE in `01-design-system.md` §1.2; remove the alternate set from `03-components.md`.
- In `03 §0` rename the table row to `--spell-<id>-primary` / `--spell-<id>-dim` / `--spell-<id>-border` / `--spell-<id>-text` (one row per quadruple, not one row per id). Drop the invented `--spell-on-color-<name>` token — it doesn't appear in `01` and is unnecessary because `text` already covers it.
- Update `03 §6` swatch row to the curated subset from `01 §1.3` (the 7 library-assigned + `brass`/`clay`/`slate` only when `userDefaultOnly` — `01` is explicit they should not appear in the swatch).
- Update `02 §2.2` example chips and §4.3 "Color ● purple" to use a real id (likely `aubergine` or `plum`).

### 1.2 Ring CSS-var names disagree
- `01 §2.2` defines `--ring-1`, `--ring-1-rgb`, `--ring-1-w` (no `--spell-` prefix on the per-ring vars; only on palette vars `--spell-<id>-*`).
- `01 §1.4` and `03 §0` use the prefixed form `--spell-ring-1` … `--spell-ring-4` and `--spell-ring-width`, `--spell-ring-gap`.
- `02 §3.1` describes both: it says "CSS variables `--spell-ring-1`..`--spell-ring-4`" but `01 §2.2`'s utility reads `var(--ring-1, transparent)`.

Pick one and propagate. **Recommendation:** prefix all ring vars `--spell-ring-N`, `--spell-ring-N-rgb`, `--spell-ring-N-w` (matches the rest of the namespace and avoids future collisions with other "ring" features). Rewrite `01 §2.2` and the JS helper `spellRingStyle()` to write `--spell-ring-N*` not `--ring-N*`.

### 1.3 Ring-host data attribute / API drift
- `02 §3.1` and `03 §0`/`§4.2` rely on `data-spell-rings="{count}"` and `data-spell-ring-names="amber,cyan,violet[,+N]"` as **the** contract (used for tooltips, e2e selectors, "+N" branching).
- `01 §2.3`'s `spellRingStyle()` helper writes **only** CSS variables — no `data-*` attributes — and never mentions the attribute contract.
- `01 §2.5` paints the 4th ring with `var(--pn-ink-3)` neutral when `>4`, while `03 §4.6` keeps ring 4 as the spell's color and adds a `+N` badge. Two different visual specs for overflow.

**Fix:**
- Add a single attribute writer in `spellRings.ts` (or in `SpellRingHost`) that emits BOTH the inline `--spell-ring-N*` vars and `data-spell-rings` + `data-spell-ring-names`. Document that contract in both `01 §2.3` and `03 §0`.
- Pick ONE overflow visual. Recommended: keep ring 4 as the 4th spell's color (per `03`) — preserves identity for the 4th cast — and *also* render `+N`. The neutral-4th-ring idea in `01 §2.5` loses one identity for one number, which is a bad trade.

### 1.4 The flow vs component name-mismatch matrix
| `02 §1` surface name           | `03` component name                | Status |
|---|---|---|
| Cast Sheet / SpellLauncher     | `SpellLauncher`                    | ok     |
| Spellbook drawer               | `SpellbookDrawer` (`<ActiveSpellsPanel anchor="spellbook">`) | ok |
| Spell detail flyout            | `SpellDetailsView` (mode `flyout`/`modal`) | ok |
| Active-spell chip-strip        | `ActiveSpellsPanel` anchor `header-strip` rendering `ActiveSpellChip` | **`ActiveSpellChip` is mentioned in §3.2 but not in the §9 file map** — orphan |
| Undo toast                     | *Not in §4 inventory, not in §9 file map* — only mentioned as "global toast service" in `03 §1.10` | **missing component** |
| Concentric rings host          | `SpellRingHost`                    | ok     |
| Ensemble wrapper               | `EnsembleGroup` (in-rail) + "standalone dock" (no component name) | **dock missing** |
| Cross-session message compose  | *No component name in `03`*       | **missing component** |
| Risky-cast confirmation banner | Lives inside `SpellLauncher.state === 'confirm-risky'` | ok |
| Spell detail flyout footer "?" key-help popover | Not in `03` | minor |

**Fix:** add three entries to `03 §4`/`§5`/`§9` file map: `ActiveSpellChip.tsx`, `EnsembleDock.tsx` (standalone), `EnsembleMessageComposer.tsx`, and an explicit `UndoToast.tsx` (even if it composes a global toast primitive). Currently `03` says these surfaces exist but never names the file.

### 1.5 Client store ↔ server entity drift vs `DESIGN_BRIEF`
DESIGN_BRIEF freezes the server contract:
- `Spell` entity {id, name, description, icon, **color** (from fixed `SPELL_COLORS`), action, loopType, trigger{hookEvent,matcher,enabled}, failMode, maxIterations, skillRef?, isDefault}
- `Session.activeSpells: ActiveSpell[]` {spellId, color, enabled, hookEvent?, matcher?, iteration, ensembleId?, castAt, castBy}
- `Ensemble` {id, name, color, objective, memberSessionIds[], leaderSessionId?, spellId, createdBy}
- Action taxonomy enum (FROZEN): `inject-prompt | feed-context | gate | continue-loop | run-command | notify-channel`

Drift found:
- **`03 §1.4`/`§1.7` chip lists**: action chips are `gate | loop | inject | notify | cmd | context` — uses informal short names ("loop", "inject", "cmd") that don't match the frozen enum. UI strings can be friendlier but the code must use the enum verbatim; spec should mention this mapping explicitly.
- **`02 §2.4`** uses `inject-prompt | gate | continue-loop | feed-context | run-command | notify-channel` — correct, matches the enum.
- **`03 §1.4` LauncherLocalState**: `castMode: 'single' | 'broadcast' | 'coordinate'` — matches DESIGN_BRIEF.
- **`02 §4.5` cross-session message**: claims server reuses `session:prompt_send`. `DESIGN_BRIEF` says **multi-target invoke** stamps `senderSessionId` and `invokerSessionId` but does NOT spec the `ensemble message` payload as reusing `session:prompt_send`. This is a forward-looking assumption that may not survive M3. Flag as TBD in `02 §4.5`.
- **`ActiveSpell.castBy`** is in `DESIGN_BRIEF` but never surfaced in `02 §3.2` Spellbook rows (you'd want "Cast by …" so users know if it was self/agent/ensemble). Add a column.
- **`SpellEntity`/`SpellEntityType` already live in `maestro-ui/src/app/types/maestro.ts`** (L847/L855) as the legacy custom-prompt entity model. The new `Spell` type will conflict by name. `03 §8` says `useSpellStore` is "deleted" but does not say the legacy `SpellEntity` / `SpellEntityType` types are deleted or renamed — leaving them in place will silently shadow the new `Spell` import in TS files that lazy-import from `app/types/maestro`. Add an explicit "delete and rename" instruction to `03 §8`.
- The five new stores (`useSpellLibraryStore`, `useSpellLauncherStore`, `useSpellActivationStore`, `useEnsembleStore`, `useSkillStore`) align with the server entities. ✓ But `useSpellActivationStore.activeSpellsBySession` should be specced as a **selector keyed on `useSessionStore.sessions[id].activeSpells`** (since server persistence puts it on Session), not a parallel mirror store, OR `03 §8` must spell out the WS-driven sync contract — currently both options are implied in different paragraphs.

### 1.6 UI_SPEC master ↔ children drift
- `UI_SPEC.md §2` references `SPELL_COLORS` "10-entry palette (brass, vermilion, moss, lapis, amber, aubergine, teal, clay, slate, plum)" — this matches `01`, contradicts `03`. UI_SPEC.md is correct; `03` is the one to align.
- `UI_SPEC.md §4` lists "SpellRingHost (ring integration)" but `01 §6 file manifest` does NOT include `SpellRingHost.tsx` — only the CSS/utility file. `03 §9` correctly puts it under `components/spells/`. Tighten `01 §6` to acknowledge `SpellRingHost.tsx` lives in `03`'s file map.
- `02 §0` refers to `01-tokens.md` (old name) — the actual file is `01-design-system.md`. Same for `03 §0` referencing `01-tokens.md`. Rename references.

---

## 2. Quality / aesthetic gaps ("stunning + properly engineered")

### 2.1 1px hairline rings at 2px gap will read as a buzz, not a ring stack
**Severity:** P1 (legibility).

Math from `01 §2.3`: ring widths are `1, 4, 7, 10 px` (i.e., `k*(1+2)-2`). Visible band is the **last px of each** (because `inset 0 0 0 Npx` paints solid from edge to N). At 4 stacked rings on a `pn-srail-s` 40×40 tile with `border-radius: 10px`, the innermost ring at offset 10px from edge occupies a content rect of `20×20`. That's fine. **But** on `pn-st` (a dense list tile, no radius, full-bleed against `pn-line`), four 1px rings + three 2px gaps = 10px chrome on every side. With Atelier's existing `pn-st` padding (per kit.tsx and `pn-st` conventions, ~8–10px vertical), the **rings will overlap or visually merge with content text**. At 1px on warm-paper light at 42% alpha (`border` token), several palette entries (`slate #4F5360 @0.42` → 5.3:1 visible-stroke, but `lapis #3F6C90 @0.42` → ~3.4:1, `teal #1F7A75 @0.42` → ~4.1:1, `moss #3E8E5A @0.42` → ~3.2:1) are right at or just above the 3:1 graphic threshold — and the *gap between adjacent rings* is `--pn-paper`/`--pn-surface` itself, so adjacent like-hue rings on a low-saturation paper background will visually fuse.

**Fix:**
- `pn-st` should opt to **2px stroke for the outermost ring + 1px for inner rings** (visual weight matches the tile's existing `border-bottom` of 1px so it doesn't feel "thinner than the chrome"). Add a `--spell-ring-1-w` override token in `01 §2.4 A`.
- Increase `--spell-ring-gap` from 2px → 3px on `pn-st`. Keep 3px on terminal. Keep 2px only on rail.
- Add a "min-spec contrast" verification step: each ring uses **`primary`** (not `border`) when it is solo (1 ring active) for a single-tile, falling back to `border` when ≥ 2 stacks. (Solo = identity is the only signal; alpha can be lower when there are siblings to distinguish from). This contradicts `01 §2.6` "Status remains status" but does NOT encode runtime state — it encodes "stack depth", a visual property. Re-derive the rule in `01 §5 stacking`.
- Alternatively, drop the cap to **3 rings + always +N** on `pn-st`. The cap-4 idea works on the rail/terminal; on the tile the tile is the narrowest of the 3 hosts and 4 rings is over-engineered. The `+N` affordance is already the relief valve.

### 2.2 The `+N` affordance is incongruent across hosts
`01 §2.5` puts the badge at `top: -6px; right: -6px` (i.e., **outside** the host) — but `pn-st` cannot overflow because list items must clip for scroll; the badge will be cut off. `01` then says `html[data-redesign] .pn-st .spell-ring__overflow { top: 6px; right: 6px; }` (inside). Two visual languages = one feels designed, the other improvised.

`03 §4.5` quietly contradicts again: "The '+N' badge is omitted in the rail (space-constrained) and replaced by a single dot indicator." So we now have:
- `pn-st`: pill `+N` inside top-right corner.
- `pn-srail-s`: dot indicator (size? color? not specced).
- `.terminalContainer`: pill `+N` floating outside top-right.

This is three different overflow visuals. It will feel sloppy.

**Fix:** specify the rail variant as a **+N micro-pill at 9px font / 12px height / `--pn-ink` background**, sitting half-inside the bottom-right corner of the rail tile. Same shape language across hosts. Keep position internal on all three (pn-st `top:4px right:4px`; rail `bottom:2px right:2px`; terminal `top:8px right:8px`). Drop the negative-offset `01 §2.5` rule.

### 2.3 Density and "first cast" feel
`03 §1.2` wireframe shows the sidebar Recents/Library/Skills with truncated icon glyphs `◐ ◑ ⬢ ☆ ⚙ 🧭 🛡 📡 🪄 🧪` and the body cards using `◐ CRITIC REFINE [loop]` shouting. This breaks Atelier's "warm-editorial" anti-shouting pact (`01 §0` and `01 §7 deliberate non-goals`: no neon, no shouting). Convert all-caps card titles to sentence-case (`Critic refine`), keep eyebrow `[LOOP]` chip uppercase only at `--spell-type-meta` 10px (which is the right place for uppercase). The wireframe also conflates emoji-as-icon with Lucide-as-icon (`🪄`, `🧪`); `01 §3.4` declares Lucide names — use `sparkles`, `flask-conical`, etc. throughout the wireframes.

### 2.4 Hover-preview delay on `SpellLauncher`
`03 §1.10` says hovered cards open the details drawer after **120ms** delay. This is too aggressive — it will fire on flyover during list scroll. Increase to 250–300ms (matching `02 §3.3` row-tooltip 600ms, hover-card 400ms; tighten to a single ~300ms hover hold for parity).

### 2.5 Ensemble visual: dashed rect + breathing is *one* good idea, but it lacks header anchorage
`01 §3.5` puts the ensemble name as a small `position: absolute; top: -7px` label, breaking the dashed frame. Nice idea. But `02 §4.4` adds a **fully-decorated header strip** with leader badge, kebab, action row inside the wrapper. They're describing two different visual treatments. Pick one. Recommendation: header strip wins (more discoverable, easier to hit; the absolute label is too small for the actions specced). Update `01 §3.5` to use a flush-top header strip with the dashed frame around the **child stack only**, not the whole wrapper.

---

## 3. Accessibility holes

### 3.1 Concrete WCAG contrast failures (verified math against `01 §1.2`)
On warm-paper light `#FBFAF6`:
- `lapis primary #3F6C90` vs `#FBFAF6` = ~4.8:1 ✓ for text (passes the 4.5 AA bar — `01` claims `text=#2E5478 → 5.6` and that does pass). Ring stroke uses `border = rgba(63,108,144,0.42)` which when alpha-blended on `#FBFAF6` lands ≈ `#A5B1BD` → contrast ~2.0:1 against `#FBFAF6`. **Fails the 3:1 UI-graphic threshold for a 1px stroke that is the only signal of state.** WCAG 1.4.11 (non-text contrast) applies because the ring **is** the affordance.
- Same calc for `moss border` ≈ `#A5BCAD` → 1.7:1, **fails**.
- Same calc for `teal border` ≈ `#A4BCBA` → 1.8:1, **fails**.
- `aubergine border` ≈ `#B0A0B4` → 2.0:1, **fails**.
- `vermilion border` and `clay border` ≈ 2.4–2.6:1 → **fails**.
- Only `slate border` and `plum border` come close to 3:1 on light.

`01 §1.2` claims "primary verified ≥ 3:1 (large-text / UI-graphic threshold)" — that's **primary** not **border**. The ring is specced to use `border` (42% alpha) when solo, per `01 §2.3` `spellRingStyle()`. This is a meaningful WCAG-AA failure that the doc itself disguises.

**Fix (P1):**
- Default solo rings to **`primary`** (100% alpha), not `border`. Use `border` only for adjacent stacked rings where each ring's color is "softened" so multiple don't fight.
- Re-run the AA verification table against the *resolved on-surface composite color* (not just `primary` hex against `--pn-surface`). Add the column to `01 §1.2`.

On warm-graphite dark `#1B1810`:
- Most dark `primary` values land ≥ 4:1 against `#1B1810` ✓. Dark `border` at ~46% alpha lands ≈ 2.3–2.8:1 → also fails 3:1 stroke threshold.

### 3.2 Reduced-motion coverage gaps
`01 §4` lists the rules under one `prefers-reduced-motion: reduce` block but the iteration-tick width-bump (`01 §4.3`) is implemented as a `requestAnimationFrame` JS animation — the `reduce` CSS query does NOT disable it. Must add a `useReducedMotion()` guard in `SpellRingHost` that short-circuits the JS tick. `03 §4.6` "iterating spell" says "Respect `prefers-reduced-motion` — falls back to a static slightly-brighter ring" — good intent, but `01 §4.3` says "the component schedules a 280ms requestAnimationFrame loop". The two must reconcile: declare the JS bump as opt-in, gated by `useReducedMotion()`.

Also missing from the `reduce` block:
- `.spell-ring--just-cast::before` cast pulse — listed in §4.1 keyframe, not in the `reduce` selector list in §4. Add `.spell-ring--just-cast::before`.
- `02 §6.5` undo-toast slide 150ms — not in the reduced-motion list.

### 3.3 Focus order / ARIA
- `02 §2.5` says Tab cycles `search → targetChips → modeRadios → libraryList → footer buttons`. But `03 §1.6` puts targets in the **footer**, after the body library. So Tab from a focused row should go to footer (targets) then CTA buttons. This contradicts `02`'s order (`targetChips` immediately after `search`). Pick the DOM order that matches reading order; recommendation: **search → mode radios → library → targets → cancel/cast** (because the user picks a spell first, then confirms targets and casts). Update `02 §2.5` to match.
- `02 §3.1` says "Hovering any of the 3 boxes for >400ms shows a tooltip". A pure-hover tooltip has no keyboard equivalent — `02 §7` does say "Every mouse action has a keyboard equivalent". Spec the focus-visible behaviour: focus on the ring host opens the same tooltip (`aria-describedby` link).
- `03 §1.10 disabled (Cast)` says CTA disabled when no spell focused; per WCAG, disabled buttons must still be reachable and announce a hint. `02 §6.4` does specify the tooltip "Add a target session first" but `03` does not echo this for the no-spell case. Add: "Cast button uses `aria-disabled='true'`, remains in tab order, tooltip explains why."
- `03 §1.11` binds `1..9` for "Quick-select target by index". But `02 §2.3` binds `1/2/3` for **castMode switch** when search is empty. **Conflict.** Pick one. Recommendation: `1..9` for targets is more useful; move castMode to `B/C/S` (which `03` already lists) and drop `1..9` from `02`.
- `02 §2.3` "`,` (comma) in search adds the typed string as a target" — confusing semantically (Tab/Enter would be more discoverable). Drop or move behind a hint.

### 3.4 Keyboard trap risk
`02 §2.5 Focus trap` says sentinels wrap the dialog. Good. But `03 §2.2` says SpellDetailsView opens as **non-modal flyout** with `aria-modal="false"` and "click-outside dismisses". When stacked over the SpellLauncher (`aria-modal="true"`), this creates a confusing focus model: the flyout has focus but the parent traps it. Spec the **stacked behaviour**: while flyout is open, the parent's focus trap is suspended; on flyout close, focus returns to the previously-focused launcher element AND re-enables the parent's trap. Currently this is implicit and easy to get wrong.

### 3.5 Screen reader strings
`01 §5` aria-label is `"Session foo — 3 spells: lint-gate, plan-execute, watch"`. `02 §7` says `"Session foo — 3 spells: lint-gate, plan-execute, watch"` then appends `" (in ensemble \"refactor-squad\")"`. `03 §0` says `aria-label="3 active spells: Critic refine, Test failure gate, Lint-fix"` (no session name). Pick one. Recommendation: `01`/`02`'s form (session name + count + names; ensemble suffix when applicable). Update `03 §0`.

Also: the `+N` overflow is `aria-label="Show N more spells"` in `01 §5`, but neither `02` nor `03` specs what the popover/Spellbook surface announces on open. Add an `aria-live="polite"` announcement: "Showing N additional spells for session foo".

### 3.6 Color identity vs disabled state collision
`03 §4.6` renders disabled spells as a "40% opacity stripe pattern (CSS `repeating-linear-gradient` token)". On a 1px hairline ring, a striped gradient is invisible. Drop the stripe; use **dashed** (matching `02 §3.1` "disabled active-spells render as a dashed ring in the same color at 40% opacity"). Reconcile.

---

## 4. Engineering risks

### 4.1 CSS specificity collision with existing `.coordinator-glow` (verified)
The legacy rule (`styles-coordinator-glow.css:11`) lives at the **root cascade**, plain `.coordinator-glow` selector (specificity 010), `:root` only declares the color vars — no `:root` prefix on the selector. The spec's override `html[data-redesign] .coordinator-glow.spell-ring { box-shadow: …; }` has specificity 030 (`html` + 2 classes). That wins, ✓. **BUT** `01 §2.4-C` repeats `html[data-redesign] .coordinator-glow.spell-ring` twice for two different declarations (`--spell-ring-halo` and the merged box-shadow). The second occurrence wins by source order but the duplication is fragile — if anyone adds a third rule, ordering surprises. Merge into a single rule block.

Also: the legacy rule's `:root` vars (`--coordinator-glow-color`, `--coordinator-glow-color-rgb`) exist as `:root`-scoped, not `html[data-redesign]`-scoped. `01 §2.4-C` uses `rgba(var(--coordinator-glow-color-rgb), 0.18)` — this WILL resolve under redesign (vars cascade), ✓. Verified.

Risk: if the `[data-redesign]` flag is ever removed for any subtree, the override silently disappears and `.coordinator-glow` reverts to the legacy 1px stroke that **draws inside** ring 4. Add a defensive rule: `.coordinator-glow.spell-ring { box-shadow: …; }` (no `html[data-redesign]` prefix) so any consumer using both classes gets the merged shape regardless of cascade scope.

### 4.2 `pn-st--selected` / `pn-st--needsInput` collision
`01 §2.6` claims background vs box-shadow don't conflict — true. But `kit.tsx` Atelier `pn-st--needsInput` (per graphify community of `SessionListItem`) is also responsible for a wait-pulse animation. The spec's ring-fade `transition: box-shadow 180ms` will run **simultaneously** with the needsInput pulse; in QA this may look noisy. Spec: when `data-spell-rings > 0`, suppress the needsInput tile-level pulse and let the chip-strip carry the state instead. Or define the pulse to run only on the inner content (`.pn-st__inner`), not the root `.pn-st`. Either is fine; pick one in `01 §2.6`.

### 4.3 Performance (re-render per keystroke + iter tick)
- The Cast Sheet library list with virtualization "over 50" (`03 §1.6`) is sane. But `02 §2.4` debounces the search at **150ms**. With React 18 concurrent mode + `useDeferredValue` you can drop the debounce entirely; spec it as `useDeferredValue(query)` to keep typing buttery on slow disks. Add a note in `03 §1.4` to use deferred values.
- `01 §4.3` iteration tick uses `requestAnimationFrame` to mutate `--spell-ring-N-w`. This forces a layout/paint of every shadow on every frame (browsers recompute the entire `box-shadow` list per inset stroke change). With 4 rings × 60fps × 280ms = ~67 paints. On `pn-st` tiles that are list-virtualized at ~30 visible items, you can multiply by N. **Risk:** janky scroll while ANY loop spell is iterating. Spec: **CSS keyframe with `will-change: box-shadow` on the host for 280ms**, then remove `will-change`. Or move the tick to the `OverflowBadge` (a single absolutely-positioned element painting on its own layer) and leave rings static. Recommended: option B (the tick visual changes from "ring breathes" to "badge pulses"). Update `01 §4.3` accordingly.
- `SpellRingHost` subscribes to `useSpellActivationStore.activeSpellsBySession(sessionId)` per row (`03 §4.2`). With Zustand, this is fine *if* the selector is referentially stable. Spec: use `useStoreWithEqualityFn(store, selector, shallow)` — currently unspecified. Add a perf note in `03 §4.2`.
- `01 §2.5` overflow badge has `box-shadow: var(--pn-sh-sm)` plus host's own shadow stack. Browsers don't promote `box-shadow` to its own layer by default; with 30+ visible tiles all bearing 4 shadows + overflow, scrolling cost is real on a Tauri webview. Mitigation: only mount the overflow badge when the host is in the viewport (use `IntersectionObserver` or rely on virtualization).

### 4.4 Feasibility in Tauri/React/Zustand
- `02 §2.7` undo issues `POST /api/spells/deactivate` per `ActiveSpell` — for a 20-target broadcast this is 20 sequential network calls within 5s. Spec a **bulk deactivate endpoint** (`POST /api/spells/bulk-deactivate`) or batch on the client with `Promise.allSettled`. Flag for backend.
- `02 §3.2` chip strip + Spellbook drawer + ring host all subscribe to the same store. WS event `spell:activated` will trigger 3 re-renders. Currently no contract for batching. Spec: use the existing 50ms message batching + per-entity throttling (sessions: 500ms) per the server's WS bridge — but `01`/`02`/`03` are silent on this. Add a note to `03 §8` saying activation events ride the existing bridge throttle.
- `03 §2.2` flyout `aria-modal="false"` over launcher `aria-modal="true"` — Radix and React-Aria both **don't** support nested dialogs with different `aria-modal` correctly out of the box. If you're using a custom dialog, spec the focus-management contract explicitly (see §3.4 above). If you're using Radix/HeadlessUI, flag this as a known limitation in `03 §2.2`.
- `02 §4.5` "ensemble compose" inline dialog reuses `session:prompt_send`. The server's WS bridge per-session throttle is 500ms (per `CLAUDE.md`); a coordinate cast that fires 4 prompts immediately will hit that throttle. Either bypass (the spec already says spawn/modal events bypass) or accept up to 500ms staggering. Note in `02 §4.5`.
- The legacy `useSpellStore` is imported in 4 graphed locations (`SpellPicker`, `TerminalStrip`, `useSpellInvocation`, `useSpells`). `03 §8` deletes it. The hand-off must list all 4 callsites for the components team. Add an "Existing callers to migrate" subsection to `03 §8`.

### 4.5 `SpellEntity` / `SpellEntityType` legacy types in `app/types/maestro.ts`
The UI's `SpellEntity` (L855) and `SpellEntityType` (L847) are the *legacy* fire-and-forget model. The new `Spell` type from DESIGN_BRIEF is a strict superset by name but a different shape. The spec doesn't say what happens to these — if both ship, TS imports `Spell` will silently shadow or collide. **Action:** add to `03 §8`: "Rename legacy `SpellEntity` → `LegacyCustomPrompt` and `SpellEntityType` → `LegacyCustomPromptType`, OR delete both if the migration also retires `CustomPrompt`. Decide explicitly."

### 4.6 `useSpellInvocation` hook is not addressed
Graphify shows `useSpells.ts` and `useSpellInvocation.ts` both depend on `useSpellStore`. `03 §8` deletes the store but says nothing about these hooks — they will break. Spec: list them in the "deleted/migrated" subsection.

---

## 5. Verdict

**Ship-with-fixes — leaning toward "needs-rework on `03-components.md`".**

The vision in `UI_SPEC.md` and the systems work in `01-design-system.md` are strong: the ring-as-identity move is conceptually correct, the palette has been built with theme math in mind, and the `prefers-reduced-motion` contract is principled. `02-ux-flows.md` is the strongest of the three — it sweats the focus-trap, the risky-cast, the undo, and the no-target empty state.

`03-components.md` is the weakest link: it asserts a *different palette*, *different token names*, and *different overflow visuals* than `01` from the very first table, then leaks orphan components (UndoToast, ActiveSpellChip, EnsembleDock, EnsembleMessageComposer) that the flows depend on. Until `03` is reconciled with `01` and the missing components are named in the file map, an implementation team will silently invent the gaps.

The ring system also needs one round of legibility tuning before it can hit the "stunning" bar: 1px @ 42% alpha on warm-paper does not reach the 3:1 graphic-contrast threshold for the majority of the palette, and the cap-4 on the dense `pn-st` tile will overcrowd content. Both are fixable in tokens — no concept change required.

### Top 5 fixes (do these first, in order)

1. **Reconcile palette IDs in `03 §0`/`§6` to match `01 §1.2`'s 10-id frozen set** (and remove `--spell-on-color-<name>`). Single source of truth in `01`. *Files: `uispec/03-components.md` §0 token table, §1.4/§1.7 chip lists, §6.2 swatch wireframe.*

2. **Solo rings draw with `primary` (100% alpha), not `border` (42%)** — current spec fails WCAG-AA 1.4.11 (non-text contrast) for 6 of 10 colors on warm-paper. Update `01 §2.3` `spellRingStyle()` to switch to `border` only when ≥ 2 rings are stacked. Add the resolved-on-surface contrast column to `01 §1.2`.

3. **Unify the ring CSS-var contract:** prefix all ring vars `--spell-ring-N`, `--spell-ring-N-rgb`, `--spell-ring-N-w`. Have `spellRingStyle()` write both inline style vars **and** `data-spell-rings` + `data-spell-ring-names`. Pick ONE overflow visual (recommend ring 4 keeps the 4th spell's color + an in-corner `+N` pill on all three hosts). *Files: `01 §2.2`, `01 §2.3`, `01 §2.5`, `03 §0`, `03 §4.5`.*

4. **Name the missing components in `03 §9` file map**: `ActiveSpellChip.tsx`, `UndoToast.tsx`, `EnsembleDock.tsx`, `EnsembleMessageComposer.tsx`. Add a "Existing callers to migrate" subsection in `03 §8` listing `SpellPicker.tsx`, `TerminalStrip.tsx`, `useSpells.ts`, `useSpellInvocation.ts`, plus the legacy `SpellEntity`/`SpellEntityType` decision (rename to `LegacyCustomPrompt*` or delete).

5. **Move iteration-tick animation off the rings**: spec it as a pulse on the `OverflowBadge` (or a single inner ring layer with `will-change: box-shadow`), guarded by `useReducedMotion()` in JS. Current spec (RAF loop mutating ring-N width every frame) will jank list scroll when any loop spell is iterating across virtualized rows. *File: `01 §4.3`, plus the implementation note in `03 §4.2`.*

### Secondary fixes (next pass)

6. Specify the `pn-st` ring tuning (outer 2px, inner 1px, gap 3px) in `01 §2.4-A`. Consider dropping to a 3-ring cap on tiles.
7. Reconcile reduced-motion list: add `.spell-ring--just-cast::before` and undo-toast slide.
8. Reconcile aria-label string (recommend `01`/`02`'s form with session name) — apply to `03 §0`.
9. Resolve castMode key vs target index conflict in `02 §2.3` vs `03 §1.11`.
10. Stacked-dialog focus-trap contract for SpellDetailsView over SpellLauncher (`03 §2.2`).
11. Add bulk deactivate endpoint to backend hand-off (`02 §2.7`) and WS-throttle note (`03 §8`).
12. Pick the ensemble header treatment — header strip wins over absolute mini-label (`01 §3.5` vs `02 §4.4`).
13. Fix wireframe casing in `03 §1.2`/`§2.3` (sentence case for spell names; uppercase only on `--spell-type-meta` eyebrows; replace emoji icons with Lucide names).
14. Rename old references `01-tokens.md` / `02-flows.md` to actual filenames in `02 §0` and `03 §0`.
15. Add `castBy` to Spellbook rows (`02 §3.2`).

When 1–5 land, this is shippable. As written, it would ship with a known-AA failure and three contradicting palette specs — neither stunning nor properly engineered.
