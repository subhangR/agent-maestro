# maestro-mobile — UI components plan (Palette 🎨)

Scope: `components/` — the React Native re-author of the Atelier DOM specimens. Primitives (Icon / Glyph / Mark / Gauge / StatusDot / AgentAvatar / Avatar / Divider), controls (Button / IconButton / Badge / Tag / Toggle / Chip / MetaButton / Input / Text), the core tiles (**MTaskTile**, **MSessionTile**), the **NowPlaying** strip, and the reusable bottom-sheet *content* primitives.

Source of truth: the specimens in `"Maestro Design System - mobile/"` (`m-kit.jsx`, `m-tiles.jsx`, `m-overlays.jsx`, `colors_and_type.css`, `mobile.css`) and `MOBILE_APP_BUILD_ANALYSIS.md` §4. These are **web React (DOM + `.m-*` CSS)** — every component must be re-authored as `View`/`Text`/`Pressable` consuming a JS token theme. The `--pn-*` CSS vars and `.t-*` classes do not exist in RN.

Hard design law (from `colors_and_type.css`): **warm paper + ink, hairline dividers, one brass accent, status reads by dot + word — never color alone, never neon, never a colored left-border bar.** Motion is "fast, mechanical, confident — no bounce." Pixel-faithful to Atelier, touch targets ≥44px.

---

## 1. Recommended architecture for this scope

**Presentational + intent-emitting.** Components hold *zero* server data access and *zero* mutation logic. They receive already-typed data (Lexicon types) as props and emit **intents** via callbacks (`onStatusChange`, `onAssign`, `onOpenTerminal`, …). The feature layer (Forge) wires those callbacks to store mutations + optimistic updates; the navigation layer (Compass) owns the sheet host. This replaces the specimen's two anti-patterns:

1. **Local `useState` for editable fields** (`MTaskTile` keeps `status/priority/assignees/model` in component state) → becomes **controlled props + callbacks**. The tile renders `task.status`; tapping a badge calls `onEditStatus(task.id)`. State lives in the store (Ledger), not the tile. Local state is allowed only for *pure view affordances* (expanded/collapsed, detail-open).
2. **The `window.MUI` global bus** (`openPicker/openSheet/openTerminal/openRun/openDoc/notify`) → becomes a typed **`SheetController` context** (see §7, cross-team with Compass). Tiles call `useSheets().openPicker({…})` instead of a window global.

**Three layers inside `components/`:**

- **primitives/** — drawn/atomic, theme-only deps. Icon, Glyph, Mark, Gauge, StatusDot, AgentAvatar, Avatar, AvatarGroup, Divider, Text.
- **controls/** — interactive atoms. Button, IconButton, Badge, Tag, Toggle, Chip, MetaButton, Input, TextArea, Card.
- **composite/** — domain tiles built from the above. MTaskTile, MSessionTile, NowPlaying, sheet-content primitives (SheetHeader, SheetHandle, PickerRow).

Composites depend on controls depend on primitives depend on theme. No upward imports.

---

## 2. Library choices (with rationale + rejected alternatives)

### 2.1 Styling — **`react-native-unistyles` ^3** (primary), StyleSheet+context (documented fallback)

Bedrock owns the `--pn-*` → JS token theme. Unistyles is the cleanest consumer: `StyleSheet.create((theme, rt) => …)` reads tokens directly, has a first-class **variants** API (kills boolean-prop explosion in Badge/Button/Toggle), built-in **light/dark theme switching with no React re-render** (C++/Nitro runtime swaps styles natively — ideal for the infinite status-dot pulse and live tiles), and `rt.insets`/`rt.screen` for safe-area-aware sheets.

- **Rejected — Tamagui:** ships its own token + theme system that would fight Atelier's `--pn-*` source of truth; heavy compiler config; opinionated component set we'd fight to make pixel-faithful. The design is bespoke editorial, not a Tamagui theme.
- **Rejected — NativeWind:** Atelier is not a Tailwind design; we'd re-derive the entire warm-paper ramp + the 4px grid + `.t-*` scale into a `tailwind.config`, duplicating Bedrock's theme. Utility-class strings also hurt the fine, hand-tuned per-status styling these tiles need.
- **Rejected — plain `StyleSheet` only:** works and is Expo-Go-safe, but theme switching forces a context re-render of the whole tree, there is no variant primitive (we'd hand-roll style-merge helpers), and per-status style maps get verbose. Kept as the **fallback** because it has zero native-runtime risk.

**Risk to flag (→ Bedrock + Sentinel):** Unistyles v3 has a Nitro/C++ runtime and a babel plugin — it **does not run in Expo Go**; it needs a custom **dev client**. This is almost certainly already true team-wide (react-native-webview for the terminal, react-native-mmkv for state, gorhom bottom-sheet, svg) so the constraint is likely free — but the decision is Bedrock's (theme owner) to ratify. If the team wants Expo Go during early dev, take the StyleSheet+`useTheme()` fallback.

### 2.2 Vector drawing — **`react-native-svg` ~15** (dependency owned by Bedrock)

Every Icon/Glyph/Mark/Gauge is inline SVG today. `react-native-svg` `<Svg><Path d=…/></Svg>` ports them directly. **Simplification:** the specimen splits the path string on `'M'` to emit one `<path>` per subpath — RN's `<Path>` accepts the full multi-subpath `d` string, so emit a single `<Path>`. No alternative seriously competes (Skia is overkill for 16px line icons; we reserve Skia consideration for the deferred rough.js diagram board, not our scope).

### 2.3 Animation — **`react-native-reanimated` ~3.16** + **`react-native-gesture-handler` ~2.20**; **`moti` ^0.29** as optional sugar

We need: the **live status-dot pulse** (`@keyframes m-ping` — scale 0.7→1.55, fade out, 1.9s loop), the **terminal cursor blink** (`m-caret`), **sheet slide-up/down** (`m-slide-up/down`, gorhom uses reanimated under the hood), and **tile expand/collapse** layout transitions. Reanimated runs these on the UI thread (no JS-thread jank), exposes `withRepeat`/`withTiming` matching Atelier's `cubic-bezier(0.16,1,0.3,1)` ease-out, and honors **reduced-motion** via its config. Moti is a thin declarative `<MotiView>` layer for one-off enter/exit (NowPlaying mount, toast) — optional, not required.

- **Rejected — RN `Animated`:** legacy, JS-driven for layout/gesture work, will stutter on the gesture-driven sheets and the always-on pulse.
- **Rejected — `framer-motion`:** web-only (motion/react has RN support that is immature; not worth the risk vs reanimated which gorhom already requires).

### 2.4 Pressing/feedback — **`Pressable`** (RN core), not `TouchableOpacity`

`Pressable`'s `pressed` state maps 1:1 to the specimen's `:active { background: var(--pn-hover) }` styling and gives us `hitSlop` for the sub-44px carets/arrows.

> Final versions pin to whatever **Expo SDK Bedrock selects** — Expo manages compatible reanimated/gesture-handler/svg versions; treat the numbers above as "the version Expo bundles for that SDK," not hard pins.

---

## 3. Component API conventions

- **TypeScript, function components.** Props interface named `<Component>Props`, exported. No default exports (named exports → better autoimport + refactor).
- **Data in, intents out.** Domain components take a typed entity (`task: Task`, `session: Session` from Lexicon) + intent callbacks. They never read a store or call the API.
- **Variants over boolean soup.** `<Badge variant="status" status={…}/>`, `<Button variant="primary"/>`, `<Toggle variant="danger"/>` via unistyles variants — not `isPrimary`/`isDanger` booleans.
- **Theme only through the theme.** No hardcoded hex anywhere; all color/space/radius/type from `theme.*`. The Glyph's `fill="var(--pn-card)"` checkmark-cutout becomes `fill={theme.colors.card}` — **CSS vars cannot be passed as SVG fills in RN.**
- **`color` cascade for icons.** Atelier icons use `stroke="currentColor"`. In RN pass an explicit `color` prop down to `<Svg color=…>` (react-native-svg honors `currentColor`); never rely on inherited text color.
- **Typography via `<Text variant=…>`.** One `Text` component maps the `.t-*` scale to a typed `variant` union: `display | h1 | h2 | h3 | title | body | secondary | label | eyebrow | quote | mono | code`. Carries `allowFontScaling` + a `maxFontSizeMultiplier` cap so the dense grid survives large Dynamic Type. (Ownership of `Text` is a Bedrock/Palette boundary — see §7.)
- **Pressable feedback** uses a `pressed` style branch matching `--pn-hover`; primary buttons flip to `--pn-brand` on press per `.m-btn--primary:active`.
- **`forwardRef`** on Input/TextArea (focus management for the editor sheets).
- **A11y baked in, not bolted on** (§4): every interactive component sets `accessibilityRole` + `accessibilityLabel` + `accessibilityState`.
- **Stable keys** for recursive trees use entity `id`, never array index.

---

## 4. Accessibility (a11y)

- **≥44×44 touch targets.** Many specimen affordances are smaller (the 11–15px carets, the `m-tt__arrow`, `m-st__radio`, badge carets). Keep the *visual* size, expand the *hit area* with `hitSlop`. The Conduct FAB and tab bar already clear 44.
- **Roles + state.** `m-tt__glyph` toggle → `role="checkbox"` + `accessibilityState={{checked: done}}`. `m-st__radio` → `role="checkbox"`. Expand arrows → `role="button"` + `accessibilityState={{expanded}}`. Badges that open pickers → `role="button"` with `accessibilityHint="Opens a picker"`. Reuse the `aria-label`s already in the specimens ("Toggle subtasks", "Mark done", "Run task", "Conduct").
- **Status never by color alone** — Atelier already pairs every status with a glyph + word; preserve that (the `m-dot` + `m-st__statustext`, the `MBadge` glyph + label). This is a built-in WCAG 1.4.1 win; do not let any RN refactor drop the text.
- **Contrast audit (→ Bedrock).** The desaturated status colors (`--pn-run #3E8E5A`, `--pn-wait #BD8A2A`, etc.) on `--pn-paper`/`--pn-card` and their dark-theme variants must clear WCAG AA for the *text* uses (status labels, tags). Flag a token contrast pass; small dots/glyphs are decorative-with-text so they're exempt.
- **Reduced motion.** Gate the infinite `m-ping` pulse and the cursor blink on `AccessibilityInfo.isReduceMotionEnabled` (and reanimated's reduced-motion config). Falls back to a static dot.
- **Dynamic Type.** `allowFontScaling` on, with capped `maxFontSizeMultiplier` (~1.3) on dense meta rows so tiles don't explode; eyebrows/mono labels scale least.
- **Grouping for screen readers.** Each tile is `accessible` with a composed label (e.g. "Task: <title>, in progress, high priority, 2 subtasks") so VoiceOver/TalkBack reads it as one unit, with the action buttons as nested actionable children.
- Uses the **accessibility-a11y** skill conventions for WCAG mapping.

---

## 5. RN re-author plan (specimen → component)

### 5.1 Primitives (`components/primitives/`)
| Specimen | RN component | Notes |
|---|---|---|
| `Icon` (M_ICONS map, 50 paths) | `Icon` | `<Svg viewBox="0 0 16 16" color=…><Path d={M_ICONS[name]}/></Svg>`. Single Path (drop the `.split('M')`). `size`, `strokeWidth`, `color` props. **Icon-ownership boundary w/ Bedrock — §7.** |
| `Mark` (the ›··+ command mark) | `Mark` | Static multi-element Svg; `size` prop, `currentColor`. |
| `Glyph` (status state machine) | `StatusGlyph` | The richest primitive: a `kind`→SVG switch for all task + session statuses. `in_progress` arc + `completed` filled check (cutout uses `theme.colors.card`) + `needsInput` filled dot. **`strokeDasharray`/`strokeDashoffset` port directly; `pathLength="100"` support in react-native-svg is unreliable — compute the real arc length instead.** |
| `Gauge` (context %) | `Gauge` | Two concentric circles, `strokeDasharray`=circumference, `strokeDashoffset`=arc. Pure math, ports cleanly. |
| `m-dot` + `m-dot--live` | `StatusDot` | 7px dot, status-colored; `live` variant overlays the reanimated ping ring (scale 0.7→1.55, opacity 0.6→0, 1.9s `withRepeat`). |
| `AgentTile` (claude/codex/gemini img, terminal `>_`) | `AgentAvatar` | `Image` for the three logos (assets bundled by Bedrock), styled `>_` for terminal kind. |
| `Avatar` / `Avatars` | `Avatar` / `AvatarGroup` | initial + color/bg; group overlaps first 3. |
| hairline borders | `Divider` | 1px `--pn-line`; horizontal/vertical. |

### 5.2 Controls (`components/controls/`)
Button (`m-btn`, `--primary` flips to brass on press, full-width variant), IconButton (`m-ib`), **Badge** (`MBadge` — inline editable: glyph + avatars + label + caret, `variant`/`tone` for the ~10 status/prio/model/override tones in `.m-badge--*`; opens a picker via `onTap`), Tag (`m-tag` priority high/med/low), Toggle (`m-toggle` danger/worktree variants), Chip (`m-actchip`/`m-taskchip`/`m-docpill` + add variant), MetaButton (`m-metabtn`, run/danger variants), Input + TextArea, Card surface (`--pn-card` + `--pn-sh-sm`).

### 5.3 Composite tiles (`components/composite/`)

**`MTaskTile`** — hierarchical subtask tree. Faithful structure: collapse arrow + subtask count, status glyph (toggle complete), title button (opens detail) with pin + priority tag + `#id` + assignee avatars + doc count, trailing activity glyph + run button + expand caret. The expandable `m-tt__meta` detail block: status/priority/assignee/model **MBadge** editors, danger/worktree toggles, due + updated meta, session activity chips, doc/diagram pills + add, Run/Subtask actions. Recurses on `t.subs`. **Refactor:** editable fields become controlled props + intent callbacks (`onToggleComplete`, `onEditStatus`, `onEditPriority`, `onEditAssignees`, `onEditModel`, `onToggleDanger`, `onToggleWorktree`, `onRun`, `onAddSubtask`, `onOpenDoc`). `collapsed`/`detailOpen` stay local. Default-collapse at `depth > 0`.

**`MSessionTile`** — spawn-chain tree. Collapse arrow + child count, done-radio (or archived glyph if exited), agent avatar + name + **live status line** (StatusDot + status text, brass/wait coloring) opening the terminal, trailing doc count + status glyph + expand. Optional `tasklines` summary. Detail block: status badge + mode editor + model/strategy/worktree badges + elapsed, task chips, doc/diagram pills, actions (Open / Resume / Copy ref / Close). Recurses on `s.children`. `statusKind` derivation (`needsInput` → needsInput, `run` → working) should come from a **shared Lexicon mapper**, not be re-implemented per tile. Intents: `onOpenTerminal`, `onToggleDone`, `onEditMode`, `onResume`, `onCopyRef`, `onClose`, `onOpenDoc`.

**`NowPlaying`** — bottom strip above the tab bar: agent avatar + name + animated "say" line (`m-tcursor` blink) + live dot + context **Gauge** + chevron-up; whole strip is a Pressable opening the terminal. Hidden on the More tab (parent decides).

### 5.4 Bottom-sheet shells — **split with Compass**
Compass owns the **host** (`@gorhom/bottom-sheet` provider, snap points, backdrop, gesture/keyboard handling, the `SheetController` context). Palette owns the reusable **content primitives** that live *inside* any sheet: `SheetHeader` (title + close), `SheetHandle` (grabber), `PickerRow` (option row with glyph/avatar + selected check, single + multi), `SheetSection` (`m-metasec` label + content). The actual sheet *bodies* (CreateTask, RunConfig, TeamMember, Command, Project, Doc/Diagram/Docs) are **Forge/Compass** screens composed from these primitives + my controls — not Palette's to own end-to-end. **Boundary must be ratified (§7).**

---

## 6. Folder structure (`components/`)

```
components/
  primitives/
    Icon.tsx            M_ICONS registry + <Icon>
    icons.ts            the path-data map (or imported from theme/ if Bedrock owns it)
    Mark.tsx
    StatusGlyph.tsx     the kind→glyph switch
    Gauge.tsx
    StatusDot.tsx       + live ping
    AgentAvatar.tsx
    Avatar.tsx          Avatar + AvatarGroup
    Divider.tsx
    Text.tsx            .t-* variants  (Bedrock boundary)
    index.ts
  controls/
    Button.tsx  IconButton.tsx  Badge.tsx  Tag.tsx  Toggle.tsx
    Chip.tsx  MetaButton.tsx  Input.tsx  TextArea.tsx  Card.tsx
    index.ts
  composite/
    MTaskTile.tsx
    MSessionTile.tsx
    NowPlaying.tsx
    sheet/
      SheetHeader.tsx  SheetHandle.tsx  PickerRow.tsx  SheetSection.tsx
    index.ts
  __tests__/            RN Testing Library specs (Sentinel-aligned)
  index.ts              barrel
```

No `StyleSheet`s in shared files — co-locate styles per component (unistyles `create` at file bottom).

---

## 7. Cross-team dependencies & open questions

**→ Bedrock (theme) — the critical dependency:**
1. **Theme object shape** (the `--pn-*` → JS token contract): exact keys for `colors.{paper,surface,card,hover,active,line,line2,ink,ink2,ink3,ink4,brand,brand2,brandSoft,run,runSoft,wait,…}`, `space[1..16]`, `radii.{xs,sm,md,lg,pill}`, `shadows.{sm,md,pop}`, `fonts.{serif,ui,mono}`, `type` scale, `motion.{easeOut,easeStd,durFast,durBase,durSlow}`. I need these names locked before I can write a single style.
2. **Unistyles config + ThemeProvider + dark-theme registration** — Bedrock owns `StyleSheet.configure`. Confirm the Unistyles-v3-needs-dev-client decision (§2.1).
3. **Icon ownership — RATIFIED (split):** Bedrock provides `react-native-svg` + the `M_ICONS` path-data + glyph-shape registry (`theme/svg/paths.ts`) + the status→token color map data + the AgentTile logo assets + fonts; **Palette authors the component files** (`Icon`, `StatusGlyph`, `Mark`, `Gauge`, `StatusDot`, `AgentAvatar`, `Avatar`) in `components/primitives/`, importing that data. **⚠️ Reconciliation needed:** Bedrock's `foundation-theme.md` §5/§6 still lists *authoring* `Icon.tsx/Glyph.tsx/Mark.tsx/Gauge.tsx/Avatar.tsx/AgentTile.tsx` in `theme/svg/` — that contradicts the ratification and would collide file-for-file. Bedrock's doc must drop those component files (keep only `paths.ts` + data + assets); the components move to `components/primitives/`.
4. **`<Text variant>` — RATIFIED to Palette:** Palette authors `<Text>` consuming Bedrock's `type` presets + the published default-color-per-variant map (`typeColor.body='ink2'`, etc.). Bedrock's doc §3.3 already concedes this.

**→ Lexicon (types) — RATIFIED:** tile props reference Lexicon's branded entity types (`Task`, `Session`, `TeamMember`) + enums verbatim — no parallel shapes. The status-derivation mapper is **Lexicon-owned**: `domain/derive/sessionStatus.ts → toUiSessionStatus(session)` (`needsInput.active ? 'wait' : map(status)`, `run ⇐ working`). **`MSessionTile` renders from `toUiSessionStatus`, never raw `status`** — drops the specimen's inline `statusKind` line. Display labels (`modeDisplayLabel`, `toDisplayTool`, status labels) also come from `derive/`, not re-implemented in tiles.

**→ Forge (features) — RATIFIED A/B split:** my component lib (C) underpins BOTH feature streams — (A) maestro-panel = Tasks/Members/Teams/Skills/Lists/Graphs/ModelProfiles, (B) session-panel = Sessions/detail/stats/timeline/prompts/spawn/terminal. `components/` imports **nothing** from `features/`; both A and B import from `components/` → file-disjoint by construction. Tiles are presentational + emit intents; Forge owns data, optimistic edits, and screen wiring. **Joint contracts: (1) exact intent-callback signatures per tile (§5.3); (2) Forge's `getItemType` / stable-height-per-type contract** — my tiles must declare a stable cell type per (entity-type, expanded-state) so FlashList v2 recycling doesn't flicker; recursive subtask/spawn-child subtrees inside a tile are NOT list-virtualized, so agree a lazy-expand / practical-depth bound. `window.MUI.openRun/openDoc/notify` become handlers Forge/Compass pass to tiles.

**→ Compass (navigation) — RATIFIED:** Compass owns the **`SheetHost` + `useSheetStore` (Zustand) + the typed `SheetRequest` discriminated union** that replaces `window.MUI`; Palette consumes `sheets.open({type,…})` and authors the sheet **content/rows** (PickerRow single+multi, SheetHeader, SheetSection) rendered inside Compass's `BottomSheetView` slot. The `SheetRequest` union param shapes are a joint Palette↔Compass↔Lexicon contract.

**→ Ledger (state):** indirect — components don't touch stores. Only constraint: intent callbacks must be cheap/stable (Forge memoizes) so live tiles don't re-render the whole tree on every WS batch.

---

## 8. Risks

1. **Icon-ownership overlap with Bedrock** (§7.3) — could cause duplicate/colliding files. Resolve before any code.
2. **Unistyles v3 needs a dev client** (no Expo Go) — fine if team's already off Expo Go (webview/mmkv/svg force it), but it's Bedrock's ratify. Fallback: StyleSheet + `useTheme()`.
3. **SVG fidelity gaps:** `pathLength` unreliable in react-native-svg (recompute arc lengths for the `in_progress` glyph + Gauge); CSS-var fills (`var(--pn-card)`) must become theme color values; verify `currentColor` cascade via the `color` prop.
4. **Always-on animations** (live dot pulse, cursor blink) drain battery and churn if mounted in long lists — pause offscreen/backgrounded and on reduced-motion; prefer reanimated UI-thread loops over JS timers.
5. **Recursive tile trees** (hierarchical tasks, spawn chains) aren't covered by list virtualization — deep trees risk render cost; coordinate lazy-expand with Forge.
6. **Dynamic Type vs the dense 4px grid** — large font scales can break tile layouts; cap `maxFontSizeMultiplier` and test.
7. **Status-color contrast** in both themes for text uses — needs a token audit (→ Bedrock).
8. **Specimen state→props refactor is non-trivial** — `MTaskTile`/`MSessionTile` keep editable state internally today; lifting it to controlled props is the bulk of the tile work and must match Forge's callback contract exactly or we double-implement.

---

## 9. Best practices (this scope)

- Pixel-faithful first: match the `mobile.css` numbers (sizes, radii, gaps, the 7px dot, 44px targets) — don't "improve" Atelier.
- Co-locate styles; no magic numbers — everything from `theme`.
- Memoize tile rows (`React.memo` + stable callbacks) for live-list performance.
- One responsibility per component; composites compose, never re-draw.
- Snapshot + interaction tests (RN Testing Library) per component, aligned with Sentinel's gates; assert a11y roles/labels/state.
- Preserve every `aria-label` → `accessibilityLabel`; never convey status by color alone.
