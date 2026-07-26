# UI "Clear the UI" Completion Plan — Living Tracker

Goal: take the Maestro UI to a clean, coherent, non-developer-ready state.
Target user: **non-developers by default**, with power features hidden behind a single **Advanced Mode** toggle (never deleted).

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

**Definition of Done (whole effort):**
1. One word per concept, everywhere.
2. One navigator, one settings home.
3. Zero dead / orphaned navigation code.
4. Every power feature behind the Advanced toggle.
5. No raw internals (SHAs, UUIDs, env vars, CLI strings, ANSI) in the default UI.
6. Vocabulary linter returns zero user-facing hits for the banned-words list.
7. First-run explains the app before asking anything.

---

## Canonical vocabulary (locked)

| Concept | Canonical word | Retire |
|---|---|---|
| Reusable config | **Agent** | "Team Member" |
| Live/past run | **Activity** / "Run" | Session, Terminal, spawn |
| The two roles | **Does the work** / **Manages a team** | Worker, Coordinator, Orchestrator, coordinated-* |
| Collab room | **Space** | Collab, Collab Space |
| Share verb | **Share** | Publish, Push |
| Statuses | **To do / In progress / In review / Done** | Todo, BACKLOG, REVIEW, DONE |
| Safety | **Ask first / Auto-approve (risky)** | Safe/Unrestricted/YOLO/⚠🛡️ |
| Automations | **Shortcuts** (or "Recipes") | Spell dialect (cast/spellbook/ensemble/seed/ring/disband) |

---

## Phase 0 — Foundation (unblocks everything) ✅ DONE (typecheck clean)
- [x] `app/constants/labels.ts` — single source of truth for user-facing labels
- [x] Consolidate `SESSION_STATUS_LABELS` (killed 5 copies → 1)
- [x] Consolidate task `STATUS_LABELS` (killed 6 task copies; GitPanel = git status, kept)
- [x] Consolidate priority labels (TaskListItem/DetailsTab/TaskCard/StrategyBadge → one casing)
- [x] Consolidate `MODE_LABELS` → 2 user-facing roles ("Does the work"/"Manages a team")
- [x] Align board `COLUMNS` + `SPACE_STATUS_LABELS` to canonical statuses
- [x] Advanced Mode flag in `useUIStore` (+ `STORAGE_ADVANCED_MODE_KEY`)
- [x] `useAdvancedMode()` hook
- [x] One Settings switch: "Developer features" (Display settings)

## Phase 1 — Quick-win bug fixes ✅ DONE (typecheck clean)
- [x] Command Palette literal escape codes (footer `↑…` → real glyphs) + collapsed dead ternary
- [x] Kill "YOLO" + "worktree" chips → canonical Safe/Unrestricted, In place/Isolated copy (DetailsTab, TaskListItem)
- [x] Emoji safety toggle → readable "Manager/Team: ask first / auto-approve" (ExecutionBar)
- [x] Strip raw internals — SHA gated behind Advanced (tooltip keeps it); `$SHELL` → "Opens a terminal"
- [~] Raw model IDs / task UUID leak — deferred to Phase 4 (they live inside the config surfaces being reworked there)
- [x] Delete duplicate top-bar search button (kept magnifier w/ ⌘K in tooltip)

## Phase 2 — Navigation consolidation
- [ ] Delete dead `PanelIconBar` (or promote its labeled tabs, drop icon rail)
- [ ] Merge "Members" + "Teams" rail entries → one "Agents"
- [ ] Fix orphaned "Model Profiles" (give a door or fold into Agent settings)
- [ ] Whiteboard: wire visible entry or remove dead buttons
- [ ] De-collide reused glyphs (layers/grid/pen); add text labels to rail
- [ ] Retire "Spaces" as a user-facing noun for the right panel

## Phase 3 — Settings consolidation
- [ ] Merge 3 settings surfaces into one dialog (App / Project split)
- [ ] Remove duplicated Theme/Zoom/Terminal/Sounds controls; delete `ZoomSetting.tsx`
- [ ] Standardize the 4 "Reset…" phrasings
- [ ] Keep top-bar theme/mute as the only quick toggles

## Phase 4 — Config simplification + Advanced gating
- [ ] Task footer: one primary verb, remove 2nd gear, inline captions
- [ ] Delete duplicate config surface in `DetailsTab.tsx`
- [ ] Team Member modal: minimal create form; rest under "Advanced settings"
- [ ] Gate GitSettings / TerminalSettings ANSI / GatewayDashboard / FileExplorer+Monaco / SSH behind Advanced
- [ ] Session lifecycle: collapse Live/Done/Archived/mark-done to one path

## Phase 5 — Spells → "Shortcuts" rename + de-scope
- [ ] Rename feature; kill dialect (ensemble/cast/spellbook/seed/ring/disband)
- [ ] Merge "Cast" vs "Casts" nav collision
- [ ] Gate rule-editor / test-fire / observability / entities behind Advanced
- [ ] Delete legacy `components/spells/` duplicates

## Phase 6 — Collab / Share unification
- [ ] One noun ("Space") + one verb ("Share"); kill Publish/Push
- [ ] Remove GitHub "canonical repository" wall from primary path
- [ ] Consistent "what becomes visible / what this can do" disclosure
- [ ] Prominent visibility consequences at create time
- [ ] One representation for shortcut names (`/deploy` vs `deploy`)

## Phase 7 — First-run & empty states
- [ ] Rewrite `StartupSettingsOverlay` (explain app first)
- [ ] One product name (Maestro vs Agent Maestro)
- [ ] Fix password dead-end (`LoginOverlay`)
- [ ] Warm, sentence-case empty states (kill NO PROJECTS / ASCII / brackets)
- [ ] Friendly folder browser (Home/Documents; native picker)
- [ ] Hide disabled "Document (Phase 2)" item

## Phase 8 — Final jargon sweep + verification
- [ ] `scripts/lint-vocabulary.mjs` — CI-failing banned-words guard
- [ ] Scrub remaining internal-leak empty/error states
- [ ] Manual QA pass (`/verify`) on the real app
- [ ] `graphify update .`
