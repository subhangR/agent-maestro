# Spell UI — Design System (01)

**Author:** `ui-systems` (spell-design team)
**Scope:** Visual language for the spell system redesign — colors, concentric rings, typography, spacing, elevation, iconography, motion.
**Audience:** `ux-flows` (consumes color + ring tokens in picker/details flows) and `components` (consumes ring utility + tile token contracts in `SpellTile`, `SpellRail`, `TerminalPanel`).
**Theme scope:** Everything ships under `html[data-redesign]` (warm-paper) and `html[data-redesign][data-theme='dark']` (warm-graphite). Nothing leaks to `:root`.

---

## 0. Operating Principles

The spell visual system extends the Atelier "warm-editorial" language already in place. Spells are *additive*: a spell visualization NEVER replaces an entity's existing surface — it lays a narrow concentric ring **inset** of the entity's outer border. This means:

- Existing `pn-st--selected`, `pn-st--needsInput`, `coordinator-glow`, and team-color treatments remain pixel-identical when no spell is active.
- Spell rings are drawn **inside** the entity's bounding box via `box-shadow: inset`, so they never affect layout, never overflow a parent, and stack via shadow-list composition.
- Color is *identity*, not status. Spells are colored from a fixed palette; saturation, weight, and ring count never encode urgency. Status (run/wait/block/info/idle) continues to be carried by the existing `--pn-run/--pn-wait/--pn-block/--pn-info/--pn-idle` tokens and `.pn-dot`.
- Maximum visible rings per container: **4**. Beyond that, a `+N` overflow badge appears.

---

## 1. SPELL_COLORS Palette

### 1.1 Contract

The palette is a fixed, ordered list — exactly mirroring the shape of `app/constants/teamColors.ts`. Each entry resolves to four values per theme so it can drive ring strokes (`border`), tinted fills (`dim`), text labels (`text`), and dot/icon strokes (`primary`).

```ts
// maestro-ui/src/app/constants/spellColors.ts
export interface SpellColor {
  id: string;                  // canonical token (kebab-case)
  label: string;               // human-facing label (Title Case)
  light: SpellColorScheme;     // resolves under html[data-redesign]
  dark:  SpellColorScheme;     // resolves under html[data-redesign][data-theme='dark']
}

export interface SpellColorScheme {
  primary: string;             // hex — for ring stroke @ 100%, icon stroke, accent text on neutral surface
  dim:     string;             // rgba — for soft fill tint (under text, behind badges); ~10-14% alpha
  border:  string;             // rgba — for ring stroke when adjacent rings exist; ~38-46% alpha
  text:    string;             // hex — body-readable label color; WCAG AA ≥ 4.5:1 vs surface
}
```

### 1.2 The Palette — Light (warm-paper) + Dark (warm-graphite)

All `text` values are verified WCAG AA against the surface they appear on (`--pn-surface` `#FBFAF6` light / `#1B1810` dark) and `--pn-card` (`#FFFFFF` / `#221E15`). All `primary` values are verified against WCAG-AA-non-text (1.4.11, **3:1 stroke threshold**) against the same surfaces — this is the binding constraint for the **ring stroke**, which is the affordance.

> **How the values were chosen.** Warm-paper light is an off-white desaturated yellow; bright spectrum hues (especially blues, greens, and any cool tone) wash out and fail AA on `--pn-surface`. Each light `text` is the deepest variant of its hue (35-45% L\* in OKLCH) and each `primary` sits one step brighter so it still reads on the dark `--pn-term-bg` of the terminal panel. Dark `text` inverts: bright enough to pass AA on warm-graphite. `dim` and `border` are derived from `primary` using fixed alphas — but **a 42%-alpha stroke alpha-blended onto warm paper fails the 3:1 non-text threshold for 6 of 10 colors** (verified math: `lapis@42%` → 2.0:1; `moss@42%` → 1.7:1; `teal@42%` → 1.8:1; etc.). That's why §2.3 mandates **solo rings draw with `primary` (100%)**; `border` (42%) is used only when stack depth ≥ 2 so adjacent rings of differing hue don't fight each other.

**Columns.** `primary`/`dim`/`border`/`text` are the 4 emitted tokens. `AA-text` is the `text` color's contrast vs `--pn-surface` (must ≥ 4.5:1 for body text). `AA-stroke (solo)` is the `primary` color's contrast vs `--pn-surface` (must ≥ 3:1 — what the solo ring stroke uses). `AA-stroke (stacked)` is the **resolved on-surface composite** of `border` (42% alpha alpha-blended onto `--pn-surface`) vs `--pn-surface` — informational only, since when ≥ 2 rings stack the eye disambiguates by hue + position, not by individual contrast.

#### Light theme — surface `--pn-surface = #FBFAF6`

| id | label | primary | dim | border | text | AA-text | AA-stroke (solo) | AA-stroke (stacked) |
|---|---|---|---|---|---|---|---|---|
| `brass`     | Brass     | `#B26A2B` | `rgba(178,106,43,0.12)`  | `rgba(178,106,43,0.42)`  | `#8A4F1E` | 5.4 | **4.5** | 2.5 |
| `vermilion` | Vermilion | `#B14538` | `rgba(177,69,56,0.12)`   | `rgba(177,69,56,0.42)`   | `#962F23` | 6.0 | **5.4** | 2.6 |
| `moss`      | Moss      | `#3E8E5A` | `rgba(62,142,90,0.12)`   | `rgba(62,142,90,0.42)`   | `#2B6A41` | 5.1 | **3.5** | 1.7 |
| `lapis`     | Lapis     | `#3F6C90` | `rgba(63,108,144,0.12)`  | `rgba(63,108,144,0.42)`  | `#2E5478` | 5.6 | **4.0** | 2.0 |
| `amber`     | Amber     | `#A07410` | `rgba(160,116,16,0.12)`  | `rgba(160,116,16,0.42)`  | `#7E5A06` | 6.5 | **4.7** | 2.3 |
| `aubergine` | Aubergine | `#6E3F7A` | `rgba(110,63,122,0.12)`  | `rgba(110,63,122,0.42)`  | `#562F61` | 7.1 | **5.6** | 2.6 |
| `teal`      | Teal      | `#1F7A75` | `rgba(31,122,117,0.12)`  | `rgba(31,122,117,0.42)`  | `#155954` | 6.7 | **4.6** | 2.0 |
| `clay`      | Clay      | `#9A4E2A` | `rgba(154,78,42,0.12)`   | `rgba(154,78,42,0.42)`   | `#79361A` | 7.0 | **5.5** | 2.6 |
| `slate`     | Slate     | `#4F5360` | `rgba(79,83,96,0.12)`    | `rgba(79,83,96,0.42)`    | `#3A3D48` | 7.5 | **5.9** | 2.7 |
| `plum`      | Plum      | `#7F2D52` | `rgba(127,45,82,0.12)`   | `rgba(127,45,82,0.42)`   | `#621F3F` | 7.8 | **6.6** | 2.9 |

All `primary` values pass the 3:1 non-text threshold against `--pn-surface` — the floor is `moss` at 3.5:1, the ceiling is `plum` at 6.6:1. **Solo rings draw `primary`** (enforced by §2.3).

#### Dark theme — surface `--pn-surface = #1B1810`

| id | label | primary | dim | border | text | AA-text | AA-stroke (solo) | AA-stroke (stacked) |
|---|---|---|---|---|---|---|---|---|
| `brass`     | Brass     | `#E0A45A` | `rgba(224,164,90,0.16)`  | `rgba(224,164,90,0.46)`  | `#E8B574` | 7.1 | **8.1** | 3.4 |
| `vermilion` | Vermilion | `#DA7D6A` | `rgba(218,125,106,0.17)` | `rgba(218,125,106,0.46)` | `#E59785` | 6.4 | **5.9** | 2.5 |
| `moss`      | Moss      | `#7BC097` | `rgba(123,192,151,0.16)` | `rgba(123,192,151,0.46)` | `#94CFAA` | 7.0 | **8.5** | 3.6 |
| `lapis`     | Lapis     | `#6F9FC7` | `rgba(111,159,199,0.17)` | `rgba(111,159,199,0.46)` | `#8FB7D7` | 6.2 | **6.4** | 2.7 |
| `amber`     | Amber     | `#D9AA49` | `rgba(217,170,73,0.18)`  | `rgba(217,170,73,0.46)`  | `#E4BC68` | 8.1 | **9.3** | 3.9 |
| `aubergine` | Aubergine | `#B589C2` | `rgba(181,137,194,0.16)` | `rgba(181,137,194,0.46)` | `#C7A1D2` | 5.8 | **7.0** | 3.0 |
| `teal`      | Teal      | `#5CB3AC` | `rgba(92,179,172,0.16)`  | `rgba(92,179,172,0.46)`  | `#7DC4BD` | 5.9 | **7.2** | 3.0 |
| `clay`      | Clay      | `#D08966` | `rgba(208,137,102,0.16)` | `rgba(208,137,102,0.46)` | `#DDA081` | 5.5 | **6.7** | 2.8 |
| `slate`     | Slate     | `#9CA1B0` | `rgba(156,161,176,0.15)` | `rgba(156,161,176,0.46)` | `#BBC0CE` | 6.0 | **6.5** | 2.8 |
| `plum`      | Plum      | `#C77BA0` | `rgba(199,123,160,0.16)` | `rgba(199,123,160,0.46)` | `#D595B5` | 5.4 | **6.2** | 2.7 |

All `primary` values pass 3:1 against `--pn-surface` — verified.

> **Contract for `components`:** never draw a ring stroke with `border` *alone*. Always use `primary` for solo, and `border` only for rings 2-4 when 2+ rings are present. The `spellRingStyle()` helper in §2.3 enforces this — do not bypass it.

### 1.3 Library Spell → Color Mapping (frozen)

The curated library `SPELL_LIBRARY` ships with this fixed assignment. `ux-flows`: use these IDs in the picker; `components`: use these IDs in the seed list.

| Spell                | Color ID    | Rationale                                                                  |
|----------------------|-------------|----------------------------------------------------------------------------|
| **Guardian**         | `lapis`     | Watcher / gate — cool blue communicates "boundary", not aggression.        |
| **Test Sentinel**    | `moss`      | Pass/fail oriented — green reads as "verify", classic test-runner cue.     |
| **Self-Critic**      | `plum`      | Introspective, sharp; deep magenta reads as "reflection".                  |
| **Plan-First**       | `lapis`     | Structured / cartographic — same family as Guardian (allowed: identity ≠ status). |
| **Progress Pulse**   | `moss`      | Heartbeat / liveness — pairs visually with `pn-dot--live`.                 |
| **Context Primer**   | `amber`     | "Loading the lamp" — warm priming hue, distinct from the brass brand.     |
| **Lint-on-Edit**     | `vermilion` | Corrective tone (think red pen), short of being block-status red.         |
| **Notify-on-Done**   | `teal`      | Completion + signal — cool, calm, telegraphic.                            |
| **Scope Keeper**     | `aubergine` | "Boundary of intent" — reserved/serious, complements `lapis`.             |
| *(reserved for user)* | `brass`    | The brand color is reserved as the default for **user-authored** spells so they read as "yours, distinct from library."  |
| *(reserved for user)* | `clay`     | Second default for user spells when `brass` is already used by a sibling. |
| *(reserved for user)* | `slate`    | Third default — neutral, never collides with a library identity.          |

Picker UI: `ux-flows` will surface the 7 library-assigned colors in the spell-edit panel; `brass`/`clay`/`slate` are user-default-only and don't appear in the swatch row (custom spell creation auto-selects them in order).

### 1.4 Z-Stack Tokens

Portal layers are token-defined so toast/flyout/drawer components don't hard-code z-indices. Authored in `spell-colors.css` (theme-independent, lives here for proximity):

```css
html[data-redesign] {
  --spell-drawer-z:  1010;   /* Spellbook drawer            */
  --spell-flyout-z:  1050;   /* Spell-detail flyout         */
  --spell-toast-z:   1090;   /* Undo / status toast         */
  --spell-tooltip-z: 1100;   /* Tooltips above all spell UI */
}
```

Cast Sheet backdrop/content reuse the existing `.spellPicker__backdrop` (1000) / `.spellPicker` (1001) slots — the launcher *replaces* SpellPicker, doesn't co-exist with it. `.pn-pop` at 80/81 is untouched.

### 1.5 Library-Row Hover Tint

Library rows in the spell picker are tagged with `data-spell-color-id="<id>"`. Hover (and `aria-activedescendant`) tints the row background with a soft cousin of that spell's color, so the user previews the palette assignment as they scan:

```css
/* In spell-colors.css. One rule per color id keeps cascade simple and
   lets the cascade resolve light vs dark automatically. */
html[data-redesign] [data-spell-color-id="brass"]:hover,
html[data-redesign] [data-spell-color-id="brass"][aria-selected="true"] {
  --spell-row-hover-bg: color-mix(in oklab, var(--spell-brass-primary) 14%, var(--pn-surface));
  background: var(--spell-row-hover-bg);
}
/* ...nine more, identical shape per color id... */
```

`--spell-row-hover-bg` is exposed so `ux-flows` can reuse the exact same fill on the keyboard-focused row (`aria-activedescendant`) without re-deriving the color-mix expression. The 14% mix percentage is calibrated to read identically against `--pn-surface` light and `--pn-surface` dark — values below 10% disappear on dark, above 18% read as "selected" rather than "hover" on light.

### 1.6 CSS Variable Surface

For every spell color `<id>`, the design system exposes 4 CSS custom properties resolved through the cascade:

```css
/* Authored in maestro-ui/src/components/maestro/redesign/spell-colors.css */
html[data-redesign] {
  --spell-brass-primary:    #B26A2B;
  --spell-brass-primary-rgb: 178, 106, 43;     /* parallel rgb form for rgba(var(...), a) */
  --spell-brass-dim:        rgba(178, 106, 43, 0.12);
  --spell-brass-border:     rgba(178, 106, 43, 0.42);
  --spell-brass-text:       #8A4F1E;
  /* ...nine more, identical shape... */
}
html[data-redesign][data-theme='dark'] {
  --spell-brass-primary:    #E0A45A;
  --spell-brass-primary-rgb: 224, 164, 90;
  --spell-brass-dim:        rgba(224, 164, 90, 0.16);
  --spell-brass-border:     rgba(224, 164, 90, 0.46);
  --spell-brass-text:       #E8B574;
  /* ... */
}
```

The parallel `*-rgb` form exists so the ring utility (§2) can author `rgba(var(--spell-ring-1-rgb), 0.42)` without re-encoding hex.

Consumers receive one extra resolution alias per active spell-color via a single inline `style` on the container element (see §2.3), removing the need for components to know the palette directly.

---

## 2. Concentric Ring System (`spell-ring`)

### 2.1 Mechanism

Generalize `.coordinator-glow` (currently `inset 0 0 0 1px + inset 0 0 12px` of one orange) into a CSS-var-driven utility that:

1. Lays **N ≤ 4** inset hairline rings stacked from outside-in, each 1px wide.
2. Optionally adds the original soft inner halo (kept for the coordinator visual; off by default for spells).
3. Composes additively with existing `box-shadow` (e.g., `--pn-sh-sm` on `pn-srail-s`) by **listing**, not replacing.
4. Respects each host's border-radius automatically (since `box-shadow: inset` follows the element's `border-radius`).
5. Uses `--spell-ring-N`, `--spell-ring-N-rgb`, `--spell-ring-N-w` CSS custom properties so components emit data, not literal colors.

### 2.2 The Utility

**Canonical token prefix: `--spell-ring-*` (unified across the entire spec).** Earlier drafts shipped two prefixes (`--spell-ring-N` in the utility, `--spell-ring-N` in the z-stack); critic pass flagged the drift. Single source of truth below.

```css
/* maestro-ui/src/components/maestro/redesign/spell-ring.css */

/* Geometry defaults — each ring is 1px wide; gap is the space between rings.
   Defaults can be overridden per host (see §2.4 host bindings).             */
html[data-redesign] {
  --spell-ring-w:      1px;     /* stroke width per ring          */
  --spell-ring-gap:    2px;     /* gap between adjacent rings      */
  --spell-ring-halo:   0px;     /* soft inner halo (used by coordinator-glow) */
  --spell-ring-halo-color: transparent;
}

/* Per-ring offsets are derived: ring K starts at K * (w + gap) from edge.
   These are CALCULATED constants — encoded so the cascade can compose them. */
html[data-redesign] .spell-ring {
  /* Allow box-shadow to coexist with the host's elevation shadow.
     Each shadow expression is a no-op (transparent) until --spell-ring-K is set. */
  box-shadow:
    /* coordinator/halo layer — disabled by default */
    inset 0 0 var(--spell-ring-halo) var(--spell-ring-halo-color),
    /* Ring 1 (outermost) */
    inset 0 0 0 var(--spell-ring-1-w, 0px) var(--spell-ring-1, transparent),
    /* Ring 2 */
    inset 0 0 0 var(--spell-ring-2-w, 0px) var(--spell-ring-2, transparent),
    /* Ring 3 */
    inset 0 0 0 var(--spell-ring-3-w, 0px) var(--spell-ring-3, transparent),
    /* Ring 4 (innermost — keeps its spell color even at overflow) */
    inset 0 0 0 var(--spell-ring-4-w, 0px) var(--spell-ring-4, transparent);
  transition: box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

> **The trick.** A single `inset 0 0 0 Npx <color>` paints a "ring" of width N inside the box. By stacking shadows with monotonically-increasing widths, **each layer paints a wider square ring than the previous, and the visible band is just (this width − previous width)** — exactly a 1px hairline if every consumer sets `--spell-ring-K-w = K * (w + gap) - gap`. Components don't compute this; they call `spellRingStyle()` (§2.3) which writes the values. Order matters: list innermost ring last so it draws on top.

### 2.3 Component API

`components` consumes one helper that converts an `ActiveSpell[]` into:
  1. inline `--spell-ring-*` CSS custom properties (for the box-shadow paint),
  2. a pair of `data-*` attributes (`data-spell-rings`, `data-spell-ring-names`) — the **canonical contract** for tooltips, e2e selectors, and the "+N" pill branching.

Components MUST apply both — the inline style and the data attrs — by spreading the helper's return value:

```ts
// maestro-ui/src/utils/spellRings.ts
import { SPELL_COLORS, type SpellColorId } from '@/app/constants/spellColors';

export const RING_CAP = 4;
const RING_W   = 1;     // px, stroke width per ring
const RING_GAP = 2;     // px, gap between adjacent strokes (override per host in CSS)

export interface RingSpec {
  /** Stable identity of the spell — used for the data-spell-ring-names attr. */
  spellName: string;
  /** Palette id — drives the ring stroke. */
  colorId: SpellColorId;
  /** When set, signals an ensemble member; outermost ring uses the ensemble's color. */
  ensembleId?: string;
  /** REQUIRED when ensembleId is set: the ensemble's own palette color id. */
  ensembleColorId?: SpellColorId;
}

export interface SpellRingAttrs {
  style: React.CSSProperties;
  'data-spell-rings': number;             // count actually painted (1-4); 0 means no class needed
  'data-spell-ring-names': string;        // CSV of visible names, with trailing "+N" when overflowing
  'data-spell-ring-overflow'?: number;    // present only when rings.length > RING_CAP
}

/**
 * Build the inline style + data attrs for a ringed host.
 *
 * Contract (frozen):
 *   - First RING_CAP (4) rings are painted.
 *   - Stroke color picks based on STACK DEPTH, not on whether a spell is solo:
 *       depth === 1 → `primary` (100%)     — meets WCAG 1.4.11 (3:1)
 *       depth  >  1 → ring K uses `border` (42%) for K >= 2; ring 1 stays `primary`
 *                     so the outermost reading is always full-strength identity.
 *   - Ensemble members: the OUTERMOST ring resolves to ensembleColorId at full saturation,
 *     regardless of stack depth.
 *   - Ring 4 KEEPS its own spell color even when rings.length > RING_CAP. We do NOT
 *     swap ring 4 for a neutral marker — the overflow signal is the "+N" pill, not a
 *     stripped identity. (Critic pass §2.1: don't trade one identity for one number.)
 */
export function spellRingAttrs(rings: RingSpec[]): SpellRingAttrs {
  const visible = rings.slice(0, RING_CAP);
  const overflow = Math.max(0, rings.length - RING_CAP);
  const style: Record<string, string> = {};

  visible.forEach((r, i) => {
    const k = i + 1;
    const width = k * (RING_W + RING_GAP) - RING_GAP;     // 1, 4, 7, 10 px (host CSS may widen via --spell-ring-K-w override)
    const isOutermost = k === 1;
    const effectiveColorId =
      isOutermost && r.ensembleId ? (r.ensembleColorId ?? r.colorId) : r.colorId;
    // Solo ring (visible.length === 1) → primary; stacked → primary on ring 1, border on 2-4.
    const useFullAlpha = visible.length === 1 || isOutermost || !!r.ensembleId;
    const stroke = useFullAlpha
      ? `var(--spell-${effectiveColorId}-primary)`
      : `var(--spell-${effectiveColorId}-border)`;
    style[`--spell-ring-${k}`]     = stroke;
    style[`--spell-ring-${k}-rgb`] = `var(--spell-${effectiveColorId}-primary-rgb)`;
    style[`--spell-ring-${k}-w`]   = `${width}px`;
  });

  const names = visible.map(r => r.spellName);
  const ringNames = overflow > 0 ? [...names, `+${overflow}`].join(',') : names.join(',');

  const attrs: SpellRingAttrs = {
    style: style as React.CSSProperties,
    'data-spell-rings': visible.length,
    'data-spell-ring-names': ringNames,
  };
  if (overflow > 0) attrs['data-spell-ring-overflow'] = overflow;
  return attrs;
}

/** Convenience wrapper for components that only need the style + class. */
export function spellRingStyle(rings: RingSpec[]): React.CSSProperties {
  return spellRingAttrs(rings).style;
}
```

A consumer renders:

```tsx
const ringAttrs = spellRingAttrs(rings);
<button
  className={cn('pn-srail-s', 'spell-ring', isActive && 'pn-srail-s--active')}
  {...ringAttrs}
/>
{ringAttrs['data-spell-ring-overflow'] && (
  <span className="spell-ring__overflow">+{ringAttrs['data-spell-ring-overflow']}</span>
)}
```

Existing `.pn-srail-s--active::after` (the brass tab) stays unaffected — it's pseudo-element-based and lives outside the inset shadow stack.

### 2.4 Three Host Bindings

The ring utility works on three containers, each with a different border-radius and different existing decoration. Tokens override the default geometry per host.

#### A) List tile — `.pn-st`

`pn-st` is a tile with `border-bottom` only (no border-radius). The ring lives flush to the left/right/top edges and runs to the bottom hairline. Because `pn-st` already uses `background` to encode `--selected` (`var(--pn-active)`) and `--needsInput` (`var(--pn-wait-soft)`), the ring is purely additive — no token collision.

```css
html[data-redesign] .pn-st.spell-ring {
  --spell-ring-w:   1px;
  --spell-ring-gap: 2px;
  /* `pn-st` has no border-radius; inset shadow paints a sharp rectangle. */
  /* No halo for tiles — they are dense, halo would smudge dividers. */
}

/* Ensure the ring sits visually over the tile background but BELOW the
   sticky --selected accent (which is a background, not a shadow). */
html[data-redesign] .pn-st--selected.spell-ring {
  /* No special handling needed — background is below box-shadow per CSS spec. */
}

/* needsInput uses a yellow soft fill; ensure the ring is at least 1px so the
   distinction "this is a spell" vs "this needs input" stays readable. */
html[data-redesign] .pn-st--needsInput.spell-ring { /* same default */ }
```

#### B) Spaces rail — `.pn-srail-s`

`pn-srail-s` is a 40×40px tile with `border-radius: 10px`, a 1px static border (`var(--pn-line)`), and the existing `--pn-srail-s--active::after` brass tab. Inset rings sit inside the 1px border and follow the rounded corners automatically.

```css
html[data-redesign] .pn-srail-s.spell-ring {
  --spell-ring-w:   1px;
  --spell-ring-gap: 2px;
}

/* When active AND ringed, the existing border-color shift (var(--pn-ink-4))
   reads as the "active" outer hairline; the spell rings sit immediately inside.
   No clobber.                                                                */
```

#### C) Terminal panel — `.terminalContainer`

The terminal is the biggest surface, and `.coordinator-glow` already runs here as a soft `inset 0 0 12px` halo. The spell ring layer composes with — but never replaces — the coordinator halo. When both apply, the coordinator's halo is the bottom layer; spell rings are crisp hairlines on top.

```css
html[data-redesign] .terminalContainer.spell-ring {
  --spell-ring-w:   1px;
  --spell-ring-gap: 3px;       /* terminal is large; wider gap so rings remain legible at viewing distance */
}

/* When BOTH spell-ring and coordinator-glow apply, the coordinator
   becomes a soft halo only — its 1px outer stroke is suppressed so it
   doesn't fight ring 1. The halo color stays orange (var--coordinator-glow). */
html[data-redesign] .coordinator-glow.spell-ring {
  --spell-ring-halo:       12px;
  --spell-ring-halo-color: rgba(var(--coordinator-glow-color-rgb), 0.18);
}
/* Suppress the legacy crisp inner stroke when spell-ring is present — the
   spell rings take the role of the crisp boundary. Without this, the legacy
   `inset 0 0 0 1px` would draw a fifth ring just inside ring 4 and read as visual noise. */
html[data-redesign] .coordinator-glow.spell-ring {
  /* Override the standalone .coordinator-glow rule's box-shadow.
     Composition done by the spell-ring rule's full shadow list above. */
  box-shadow:
    inset 0 0 var(--spell-ring-halo) var(--spell-ring-halo-color),
    inset 0 0 0 var(--spell-ring-1-w, 0px) var(--spell-ring-1, transparent),
    inset 0 0 0 var(--spell-ring-2-w, 0px) var(--spell-ring-2, transparent),
    inset 0 0 0 var(--spell-ring-3-w, 0px) var(--spell-ring-3, transparent),
    inset 0 0 0 var(--spell-ring-4-w, 0px) var(--spell-ring-4, transparent);
}
```

> The standalone `.coordinator-glow` rule in `styles-coordinator-glow.css` stays as-is for non-redesign sessions and for terminals where no spell is active. Only the combination `.terminalContainer.coordinator-glow.spell-ring` invokes the merged shape.

### 2.5 The `+N` Overflow Indicator (unified across all three hosts)

When `rings.length > 4`, ring 4 **keeps the 4th spell's color** (we don't trade identity for a number), and a single in-corner pill announces the additional count. The pill uses one shape language on all three hosts — sizes flex per host, position is always *inside* the host so list virtualization can't clip it.

```css
html[data-redesign] .spell-ring__overflow {
  position: absolute;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--pn-ink);
  color: var(--pn-paper);
  font-family: var(--pn-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--pn-surface);  /* halo against host surface */
  box-shadow: var(--pn-sh-sm);
  pointer-events: auto;
  cursor: pointer;
  z-index: 2;
}

/* Per-host positioning — always INSIDE the host edge so virtualized lists can't clip it. */
html[data-redesign] .pn-st       .spell-ring__overflow { top:    4px; right: 4px; }
html[data-redesign] .pn-srail-s  .spell-ring__overflow { bottom: 2px; right: 2px; min-width: 14px; height: 12px; font-size: 8px; padding: 0 3px; }
html[data-redesign] .terminalContainer .spell-ring__overflow { top:    8px; right: 8px; min-width: 18px; height: 18px; font-size: 10px; }
```

`.pn-srail-s` gets a smaller pill (12px tall) so it fits in the 40×40 button without crowding the existing brass-tab `::after`. The terminal pill grows slightly (18px) so it reads from the user's normal terminal viewing distance.

Component contract:
- Host must be `position: relative` (already true for `pn-st`, `pn-srail-s`, `.terminalContainer`).
- Mount `<span className="spell-ring__overflow">+{n}</span>` only when `data-spell-ring-overflow` is set (the helper signals this).
- The pill is a `<button aria-label="Show {n} more spells">` semantically; the `<span>` shorthand above is for the visual. Use `<button>` in real code.
- Click opens the spell details popover (owned by `ux-flows`, see `02-ux-flows.md`).
- The pill paints on its own absolutely-positioned layer — see §4.3 for why the iteration-tick animation lives here, not on the rings themselves.

### 2.6 Composition Rules with Existing Visuals (canonical)

| Existing visual | Mechanism                          | Interaction with `.spell-ring`                                          |
|-----------------|------------------------------------|-------------------------------------------------------------------------|
| `pn-st--selected`        | `background: var(--pn-active)`  | Below shadow stack; rings remain crisp on top. **No conflict.**         |
| `pn-st--needsInput`      | `background: var(--pn-wait-soft)` | Below shadow stack; rings remain crisp on top. **No conflict.**         |
| `pn-srail-s--active`     | `border-color` + `background` + `::after` brass tab | All outside the shadow stack. **No conflict.**           |
| `coordinator-glow`       | `inset 0 0 0 1px` + `inset 0 0 12px` | Merged via `.coordinator-glow.spell-ring` override (§2.4-C). Crisp stroke suppressed; halo preserved as ring-0. |
| Team color (future)      | TBD — likely a 2px left rule or dot | If implemented as background/border-left, sits below shadow stack. **No conflict expected.** |

---

## 3. Typography, Spacing, Elevation, Iconography

### 3.1 Type Scale (spells surfaces only)

Spells inherit the global Atelier type system (`--pn-ui`, `--pn-mono`, `--pn-serif`). The spell-specific scale:

| Token                        | Use                                            | Family       | Size  | Weight | Letter |
|------------------------------|------------------------------------------------|--------------|-------|--------|--------|
| `--spell-type-eyebrow`       | "ACTIVE SPELLS", section labels                | `--pn-mono`  | 10.5px | 600    | 0.12em |
| `--spell-type-name`          | Spell name in picker / details                 | `--pn-ui`    | 13.5px | 600    | -0.005em |
| `--spell-type-name-lg`       | Spell name in details modal hero               | `--pn-serif` | 22px  | 500    | -0.01em |
| `--spell-type-desc`          | Spell description / one-line summary           | `--pn-ui`    | 12.5px | 400    | 0      |
| `--spell-type-meta`          | Action taxonomy, loop type, fail mode tags     | `--pn-mono`  | 10px   | 600    | 0.04em (UPPERCASE) |
| `--spell-type-iter`          | Iteration counter ("3 / 5")                    | `--pn-mono`  | 11px   | 600    | 0.02em |
| `--spell-type-badge`         | "+N" overflow, "DEFAULT" badge                 | `--pn-mono`  | 9px    | 700    | 0.04em (UPPERCASE) |

### 3.2 Spacing Scale (spells)

Use the existing `--pn-r-*` radii. Add spell-specific spacing tokens (alignable to a 4px grid):

| Token                  | Value | Use                                                       |
|------------------------|-------|-----------------------------------------------------------|
| `--spell-gap-tile`     | 9px   | Inside picker rows: icon → name → meta gap                |
| `--spell-gap-row`      | 4px   | Between rows in picker list                               |
| `--spell-pad-card`     | 14px  | Inner padding of spell-details card                       |
| `--spell-pad-modal`    | 20px  | Top/bottom padding of the picker modal body               |
| `--spell-pad-badge-x`  | 6px   | Horizontal padding for tag badges (taxonomy chip etc.)    |
| `--spell-pad-badge-y`  | 2px   | Vertical padding for tag badges                           |

### 3.3 Elevation

Reuse Atelier shadows verbatim — do not invent new ones:

| Container                 | Shadow              | Surface              | Border               |
|---------------------------|---------------------|----------------------|----------------------|
| Spell tile (in list)      | none                | `--pn-card`          | `--pn-line`          |
| Spell picker modal        | `--pn-sh-pop`       | `--pn-card`          | `--pn-line-2`        |
| Spell details popover     | `--pn-sh-md`        | `--pn-card`          | `--pn-line-2`        |
| Ensemble grouping frame   | `--pn-sh-sm`        | `--pn-surface`       | shared spell color `border` |
| Overflow `+N` badge       | `--pn-sh-sm`        | `--pn-ink`           | 1.5px `--pn-surface` |

### 3.4 Iconography

Icon glyphs come from **Lucide** (already used throughout maestro-ui via `lucide-react`). For spell library entries, the `icon` field on `Spell` is one of:

- A Lucide icon name (e.g., `"shield"`, `"flask-conical"`, `"sparkles"`) — preferred for library spells, so they render at any size and inherit `currentColor`.
- A 1-2-character monogram (e.g., `"⚡"`, `"P"`) — accepted for user spells where the user enters whatever they like.

Render rules:

- Default icon container: **16×16px**, `stroke-width: 1.5`, color `var(--spell-<id>-text)`.
- In the rail/tile, icon container is **18×18px**.
- In the details hero, **28×28px** with `stroke-width: 1.25`.
- A monogram icon is rendered in `--pn-mono` 14px, color `var(--spell-<id>-text)`.

| Library spell        | Lucide icon         |
|----------------------|---------------------|
| Guardian             | `shield`            |
| Test Sentinel        | `flask-conical`     |
| Self-Critic          | `scan-eye`          |
| Plan-First           | `map`               |
| Progress Pulse       | `activity`          |
| Context Primer       | `lamp`              |
| Lint-on-Edit         | `wrench`            |
| Notify-on-Done       | `bell`              |
| Scope Keeper         | `compass`           |
| *(user default)*     | `sparkles`          |

### 3.5 Ensemble Grouping

When multiple sessions carry the same `ensembleId`, the visual grouping is a **dashed hairline rectangle** around their tiles in the list — colored `var(--spell-<id>-border)` for the shared spell. The frame is 1px dashed (`stroke-dasharray: 4 3`) drawn via SVG behind the tile group (positioned via React; do not attempt a CSS-only solution since list children are not contiguous DOM siblings — they're separated by `pn-stack-head` rows).

```css
html[data-redesign] .pn-ensemble {
  position: relative;
  margin: 6px 8px;
  padding: 4px 0;
  border-radius: var(--pn-r-md);
  /* Background is a subtle tint of the ensemble color */
  background: var(--ensemble-dim, transparent);
}
html[data-redesign] .pn-ensemble::before {
  content: "";
  position: absolute; inset: 0;
  border-radius: inherit;
  border: 1px dashed var(--ensemble-border, var(--pn-line-2));
  pointer-events: none;
}
html[data-redesign] .pn-ensemble__label {
  position: absolute; top: -7px; left: 12px;
  padding: 0 6px;
  background: var(--pn-surface);
  font-family: var(--pn-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ensemble-text, var(--pn-ink-3));
}
```

Consumer sets the three `--ensemble-*` vars inline from `spellRingStyle` (variant for ensembles).

---

## 4. Motion

All motion is gated by a single rule. **Anything spell-related that animates more than 80ms is disabled when `prefers-reduced-motion: reduce`.** The list below is the authoritative selector set — any new spell motion MUST be added here too.

```css
@media (prefers-reduced-motion: reduce) {
  html[data-redesign] .spell-ring,
  html[data-redesign] .spell-ring--just-cast::before,    /* cast pulse (§4.1)              */
  html[data-redesign] .spell-ring__overflow,             /* overflow pill                  */
  html[data-redesign] .spell-ring__overflow--ticking,    /* iter-tick (§4.3)               */
  html[data-redesign] .spell-ring__tick,                 /* iter-tick alt slot             */
  html[data-redesign] .spell-ring__tick--active,
  html[data-redesign] .pn-ensemble,
  html[data-redesign] .pn-ensemble--ambient::before,     /* ensemble breathe (§4.5)        */
  html[data-redesign] .spellPicker,
  html[data-redesign] .spellPicker__backdrop {
    animation: none !important;
    transition: none !important;
  }
}
```

In addition, the JS path for iteration ticks (§4.3) MUST be gated on `useReducedMotion()` in `SpellRingHost` — the CSS rule alone won't suppress a JS class toggle, only its animation. `ux-flows` should add their undo-toast/sheet selectors to this block (or run a parallel `prefers-reduced-motion: reduce` block in their own CSS — both compose).

### 4.1 Cast (spell becomes active on a session)

When `session:spell_activated` arrives, the ring fades in over 200ms and the corresponding host gets a one-shot **"cast pulse"**:

```css
@keyframes spell-cast-pulse {
  0%   { transform: scale(1);    opacity: 0; }
  35%  { transform: scale(1.06); opacity: 0.55; }
  100% { transform: scale(1.18); opacity: 0; }
}
html[data-redesign] .spell-ring--just-cast::before {
  content: "";
  position: absolute; inset: 0;
  border-radius: inherit;
  border: 1.5px solid var(--spell-ring-cast-color, var(--pn-brand));
  pointer-events: none;
  animation: spell-cast-pulse 520ms cubic-bezier(0.16, 1, 0.3, 1) 1;
  /* The component adds the `--just-cast` class for 540ms then removes it. */
}
```

The `--spell-ring-cast-color` is set inline to `var(--spell-<id>-primary)` of the spell being cast.

### 4.2 Activate / Deactivate (ring fade)

A ring's color value transitions via `transition: box-shadow 180ms` already declared on `.spell-ring`. No keyframe needed — when `--spell-ring-K` flips from `transparent` to a color, the change interpolates smoothly. When deactivating, the ring fades out the same way before the variable is removed (the React component uses `useDeferredValue` + a 200ms hold to keep the var present during fade).

### 4.3 Iteration tick (loop spells) — paints on the badge layer, NOT the rings

When a `continue-until-done` / `critic-refine` spell completes one iteration, we signal forward progress with a brief pulse — but the pulse runs on a **separate compositor layer**, never on the host's `box-shadow` stack.

**Why this changed from the previous draft.** A naive implementation mutated `--spell-ring-N-w` over 280ms via `requestAnimationFrame`. The browser repaints the *entire* inset shadow list per frame (4 strokes × ~17 frames = 68 paints per tick), and on the `pn-st` list with ~30 virtualized rows this caused visible jank when any loop spell was active. The fix is to keep the rings static and move the tick to a small absolutely-positioned element that's already a paint-isolated layer.

#### The animated surface

The iteration tick runs on a dedicated badge element placed at the host's top-right corner — co-located with (and visually substituting for) the `spell-ring__overflow` pill when overflow is present. When there's no overflow, a minimal dot serves as the tick surface.

```css
/* The tick element is the same element as the overflow pill — they share a slot. */
html[data-redesign] .spell-ring__tick,
html[data-redesign] .spell-ring__overflow {
  position: absolute;
  /* Position from §2.5 — per host */
  contain: layout paint;        /* Force a paint-isolated compositor layer */
}

/* The tick keyframe — a single transform + opacity pulse on the badge layer.
   No box-shadow on the host changes; rings stay completely static. */
@keyframes spell-iter-tick {
  0%   { transform: scale(1);    opacity: 1; }
  35%  { transform: scale(1.18); opacity: 0.85; }
  100% { transform: scale(1);    opacity: 1; }
}

html[data-redesign] .spell-ring__tick--active,
html[data-redesign] .spell-ring__overflow--ticking {
  will-change: transform, opacity;
  animation: spell-iter-tick 280ms cubic-bezier(0.16, 1, 0.3, 1) 1;
}
/* IMPORTANT: components must remove the --active / --ticking class on animationend
   so will-change drops back. Keeping will-change permanently pins the layer and
   regresses memory under heavy multi-session loads. */
```

#### The JS contract

The tick is fired from `SpellRingHost` (or wherever the WS `spell:iteration_advanced` event lands). It is **gated by `useReducedMotion()`** — the CSS media query alone does not stop a JS-driven class toggle, so the gate must live in code:

```ts
// in SpellRingHost.tsx
const reducedMotion = useReducedMotion();    // from @react-aria/utils or equivalent
useEffect(() => {
  if (reducedMotion) return;                 // do nothing — no tick, no class toggle
  if (!lastIterationEventId) return;
  const el = badgeRef.current;
  if (!el) return;
  el.classList.add('spell-ring__overflow--ticking');
  const handle = () => el.classList.remove('spell-ring__overflow--ticking');
  el.addEventListener('animationend', handle, { once: true });
  return () => el.removeEventListener('animationend', handle);
}, [lastIterationEventId, reducedMotion]);
```

When reduced motion is requested:
- No animation, no class toggle. Period.
- The badge's iteration counter (`3/5`) is updated synchronously — text changes are not motion.
- For users who *do* want a non-motion progress signal, the badge text styles itself with a slightly bolder weight for ~1.5s after each tick (via a CSS `transition: font-weight 1500ms`). This is the reduced-motion-compatible fallback.

```css
@media (prefers-reduced-motion: reduce) {
  html[data-redesign] .spell-ring__overflow,
  html[data-redesign] .spell-ring__tick {
    font-weight: 700;
    transition: none !important;
    animation: none !important;
  }
}
```

#### Rings never animate from iteration

Reaffirmed contract: **the `.spell-ring` element's `box-shadow` never animates from iteration ticks.** The only motion the rings themselves carry is the §4.2 activate/deactivate fade (a single `transition: box-shadow 180ms`) — which fires at most twice per spell lifecycle, not per iteration. This keeps the 30+ virtualized rows on the session list scroll-stable even when multiple loop spells are iterating in parallel.

### 4.4 Picker open / close

Reuses the existing `spellSlideIn` (200ms `cubic-bezier(0.16, 1, 0.3, 1)`) and `spellFadeIn` (100ms) keyframes already defined in `styles-spells.css`. No changes.

### 4.5 Ensemble breathing (idle)

Optional, off by default. When `prefers-reduced-motion` is **not** reduce AND the user has the `enableSpellAmbience` setting on (defaults to off), the ensemble dashed frame breathes — opacity oscillating 0.6 ↔ 1.0 over 4.2s. The breathing is paused as soon as any ensemble member's session emits a tool event (so it never competes with active work).

```css
@keyframes spell-ensemble-breathe {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
html[data-redesign] .pn-ensemble--ambient::before {
  animation: spell-ensemble-breathe 4.2s ease-in-out infinite;
}
```

### 4.6 Hover / focus

Tiles in the picker get a 120ms `background` transition (already present on `.pn-st`). Spell rail buttons get a 140ms `border-color` + `background` transition (already present on `.pn-srail-s`). No additions.

---

## 5. Coordination Contract for Sibling Specs

`ux-flows`, `components`: when you compose against this spec, **use these token names exactly**. If a name must change, message back and we'll renumber together; do not silently localize.

**Color identity:**
- Spells carry an opaque `colorId: SpellColorId` (one of the 10 ids in §1.2).
- Components NEVER hardcode a hex; always go through `var(--spell-<id>-*)` or the `spellRingStyle()` helper.

**Ring stacking:**
- Order in `activeSpells[]` is the order shown outside-in. The cast time (`castAt`) defines the order; oldest is outermost. This means a freshly cast spell appears as the **innermost** crisp ring — most prominent — which matches the user's expectation that "the thing I just did is highlighted."
- Ensemble spells use full-saturation `primary` instead of `border` alpha — so an ensemble ring reads as more present than an individual ring even though it's the same color and width.

**Host classes:**
- Apply `.spell-ring` *additionally*, never replacing existing classes. The host must have an existing `position: relative` (verified: `pn-st`, `pn-srail-s` both do).
- Inline `style={spellRingStyle(rings)}` on the same element.
- For terminal: apply to whatever element currently receives `.coordinator-glow` (the inner terminal pane wrapper).

**Status remains status:**
- Do not color a spell ring based on `iteration`, `failMode`, or any other runtime state. State changes belong to text + dot indicators inside the spell-details popover. The ring is identity.

**Accessibility:**
- Every ringed element must have an `aria-label` like `"Session foo — 2 spells: Guardian, Test Sentinel"`.
- The `+N` overflow badge is a `<button>` with `aria-label="Show N more spells"`.

---

## 6. File Manifest (what `components` will need to create)

| File                                                                              | Purpose                                                                            |
|-----------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| `maestro-ui/src/app/constants/spellColors.ts`                                     | Palette source (TS types + IDs).                                                  |
| `maestro-ui/src/components/maestro/redesign/spell-colors.css`                     | The `--spell-<id>-*` CSS-var declarations (light + dark blocks).                  |
| `maestro-ui/src/components/maestro/redesign/spell-ring.css`                       | The `.spell-ring` utility, host bindings, overflow, ensemble, cast/tick keyframes. |
| `maestro-ui/src/utils/spellRings.ts`                                              | `spellRingStyle()`, `spellEnsembleStyle()`, color resolution helpers.             |
| `maestro-ui/src/main.tsx` (existing)                                              | Add 2 new `import './...'` lines for the CSS above.                               |
| `maestro-ui/src/styles-coordinator-glow.css` (existing)                           | No change — the merged `.coordinator-glow.spell-ring` rule lives in `spell-ring.css` to keep the override in one place. |

---

## 7. Deliberate Non-Goals

- No new font, no new font weight. Atelier is set; spells live within it.
- No glassmorphism, no neon glow, no animated gradient on rings. Anti-AI-slop pact still binding.
- No color picker for users yet. User spells get auto-assigned `brass` / `clay` / `slate` round-robin. A picker can come in a future phase.
- No per-theme palette toggle — the cascade handles light/dark automatically. There is no "spell theme" concept.
- No replacement of `.coordinator-glow` outside the spell-ring combination. The existing visual is preserved for sessions without spells.
