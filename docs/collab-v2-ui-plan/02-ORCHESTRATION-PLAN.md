# Collab V2 UI — Orchestration / Coordination Plan

**For:** Atlas (coordinator, team `team_1784927926763_vnoomunsw` "Collab V2 UI Build")
**Companion doc:** `01-IMPLEMENTATION-PLAN.md` (the WHAT — layers L0–L8, exit criteria,
approved decisions). This doc is the HOW: setup, team, waves, gates, protocol.
**Approved by user:** 2026-07-25. Models: Fable 5 + Opus 5 mix (fixed below).

---

## 0. Mission

Build the complete Collab V2 Modular Workspace UI — Entity Component Contract (Z1–Z4),
five universal subsystems, panel-stack shell, collection system incl. graph canvas, all
eleven screens, the drag/drop grammar, live behaviors — against a MockFacade speaking
the real UI data contract. Fresh build: the `feat/collab-v2-supabase-backend` UI code is
deliberately **ignored** (design docs + contract are the sole source). Definition of
done = Implementation Plan L8 (five golden workflows demoable + gallery complete +
contract tests green + type-check clean).

## 1. Non-negotiable ground rules (hard-won; do not relax)

1. **Workers never run git.** Atlas commits after each verified wave. Workers report
   files changed; Atlas reviews the diff before committing.
2. **Package-disjoint ownership.** Every worker owns whole directories (map in §4). No
   two concurrent workers touch the same file. Shared barrel/index files and
   cross-cutting wiring are edited ONLY by Atlas at integration points.
3. **Never run `bun run build:ui` in parallel sessions** (vite processes SIGTERM each
   other). Verification = scoped `bunx tsc -b` (or `tsc -p maestro-ui`) + scoped
   `bunx vitest run <paths>` + Atlas's single dev-server for visual checks.
4. **Spawn every worker with bypass permissions** so nobody stalls on prompts.
5. **Every wave is independently verified before the next fans out** — by Atlas for
   waves 0–2, by Sentinel (who wrote none of it) from wave 3 onward and at the end.
6. **Architecture laws enforced in review:** (a) screens compose only from lower
   layers — a screen importing the facade for entity rendering or containing bespoke
   entity markup is a defect; (b) kinds are registry data — `if (kind === '…')`
   outside `registry/` is a defect.
7. **Re-brief with reality.** Each wave's spawn briefs must describe what actually
   landed (exports, file paths, gotchas), not just the plan. Atlas maintains
   `docs/collab-v2-ui-plan/STATE.md` in the worktree — updated after every wave gate —
   and points every brief at it.
8. If a worker session dies or stalls >30min without progress reports, prompt it once;
   if unresponsive, respawn the persona with the same brief + current STATE.md.

## 2. Setup phase (Atlas, before any spawning)

```bash
# 1. Worktree off main (main repo: /Users/subhang/Desktop/Projects/maestro/agent-maestro)
git worktree add -b feat/collab-v2-ui /Users/subhang/Desktop/Projects/maestro/collab-v2-ui-wt main

# 2. Bring the design corpus into the worktree (docs only — NOT ui source) from the backend branch
cd /Users/subhang/Desktop/Projects/maestro/collab-v2-ui-wt
git checkout feat/collab-v2-supabase-backend -- \
  docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md docs/COLLAB_V2_UI_UX_BRIEF.md \
  docs/COLLAB_V2_UI_DATA_CONTRACT.md docs/COLLAB_V2_GAPS_AND_EXTENSIONS.md \
  "Modular Collab Workspace UI"
git restore --staged . 2>/dev/null || true   # keep files, commit them yourself in the setup commit

# 3. Install deps (bun workspace) and sanity-check
bun install
cd maestro-ui && bunx tsc -b && cd ..

# 4. Register the dedicated maestro project, then spawn workers INTO it
maestro project create …  # name: "Collab V2 UI Impl", workingDir: /Users/subhang/Desktop/Projects/maestro/collab-v2-ui-wt

# 5. Commit setup: plan docs (copy this folder in), design corpus, STATE.md scaffold
```

- **Design sources for workers** (all inside the worktree after step 2):
  `docs/COLLAB_V2_UI_UX_BRIEF.md` (logical UI spec), `docs/COLLAB_V2_UI_DATA_CONTRACT.md`
  (DTOs/commands/events — the law for L0), `docs/COLLAB_V2_ENTITY_GRAPH_DESIGN.md`
  (domain semantics), `Modular Collab Workspace UI/Collab Workspace.dc.html` +
  `Entity Contract Spec.dc.html` (the visual prototype: 10 interactive views + component
  spec + drag grammar table) and `Modular Collab Workspace UI/_ds/…/colors_and_type.css`
  + `styles.css` (the paper/ink `--pn-*` design system to port into `tokens.css`).
- **Dev server:** Atlas runs ONE vite instance for visual verification
  (`cd maestro-ui && bun run dev -- --port 4571` or a free port; do NOT use 4568/4569,
  the live staging stack owns those). Mount: add a dev-only entry that renders
  `src/collab-v2/` standalone (`collab-v2.html` + `CollabV2App`) so the module never
  touches the live app shell.
- **Existing deps to use (already in maestro-ui):** `@xyflow/react`, `dagre`,
  `@dnd-kit/*`, `zustand@5`, `react-mentions`, `react-markdown`. Add nothing heavier
  without user approval.

## 3. Team roster (created; spawn by team-member ID)

| Member | ID | Model | Mode | Scope (waves) |
|---|---|---|---|---|
| 🧭 Atlas | `tm_1784927901526_nqlbg4w4g` | **claude-fable-5** | coordinator | Everything; commits; integration |
| 🏗️ Keystone | `tm_1784927901766_mgy8jhnso` | **claude-fable-5** | worker | W0: L0 foundation |
| 🧩 Forma | `tm_1784927901999_h9gwvpkd5` | **claude-fable-5** | worker | W1: L1 entity contract + gallery |
| 🪟 Framer | `tm_1784927902234_t6wss2qcw` | claude-opus-5 | worker | W1: L3 shell/nav/panel stack |
| 🧵 Weave | `tm_1784927902524_gt6nrns4l` | claude-opus-5 | worker | W2: Thread |
| 🔗 Railway | `tm_1784927902764_dfi9jcg76` | claude-opus-5 | worker | W2: ConnectionsRail + ReactionsPointsBar |
| ⚡ Pulse | `tm_1784927903002_smsi45jgf` | claude-opus-5 | worker | W2: CommandPalette + live layer |
| 🕸️ Lens | `tm_1784927903240_bio4af8kb` | **claude-fable-5** | worker | W2: CollectionView + GraphCanvas |
| 🖥️ Vista | `tm_1784927903476_ow1wf335z` | claude-opus-5 | worker | W3: Home, Inbox, Tasks |
| 🎬 Scenic | `tm_1784927903712_2vb3strjs` | claude-opus-5 | worker | W3: Docs, Team, Leaderboard |
| ⚓ Harbor | `tm_1784927903952_tmb256gyz` | claude-opus-5 | worker | W3: ChannelHub, Tracking, Settings |
| 🎯 Motion | `tm_1784927904186_aia4gcj02` | claude-opus-5 | worker | W4: interactions/dnd/creation |
| 🛡️ Sentinel | `tm_1784927904417_7h852jrn3` | **claude-fable-5** | worker | W3+: independent verification |

All personas already carry their identity/scope and the no-git/verify rules. Spawn:
`maestro session spawn --task <waveTaskId> --project <collabV2ProjectId>
--team-member-id <tmId> --subject "…" --message "<brief>"` (bypass + model come from
the persona).

## 4. Module layout & ownership map (create in W0; ownership is per-directory)

```
maestro-ui/src/collab-v2/
  tokens.css  kit/            ← Keystone (W0) — Pill, Avatar, Eyebrow, IconBtn, Popover-engine
  types/      facade/  mock/  ← Keystone (W0) — contract.ts · CollabFacade.ts · MockFacade, seed/, simulation.ts
  stores/                     ← Keystone (W0) — graph.ts, nav.ts, collections.ts, presence.ts
  registry/   entity/         ← Forma (W1) — KindRegistry + kinds/*.tsx · Chip, Card, Panel, FullView, Tombstone
  gallery/                    ← Forma (W1), later Sentinel adds audits
  shell/                      ← Framer (W1) — IconRail, LeftRail, CenterHost, PanelStack, router.ts
  subsystems/thread/          ← Weave (W2)
  subsystems/rail/  subsystems/reactions/   ← Railway (W2)
  subsystems/palette/  subsystems/live/     ← Pulse (W2)
  collections/  collections/graph/          ← Lens (W2)
  screens/home/ screens/inbox/ screens/tasks/          ← Vista (W3)
  screens/docs/ screens/team/ screens/leaderboard/     ← Scenic (W3)
  screens/channel/ screens/tracking/ screens/settings/ ← Harbor (W3)
  interactions/               ← Motion (W4) — grammar.ts, dnd.tsx, create/, promote/
  __tests__/<owner-scoped subdirs>
  index.ts, CollabV2App.tsx   ← ATLAS ONLY (integration wiring)
```

Cross-boundary needs (e.g. Thread needs the popover engine) go through what W0/W1
export — if an export is missing, the worker reports the need to Atlas; Atlas adds it
or routes it to the owner. Workers do not edit outside their directories, ever.

## 5. Waves

### Wave 0 — Foundation (Keystone alone; Atlas reviews closely)
Build L0 per implementation plan §L0: contract types verbatim from the data contract;
`CollabFacade`; MockFacade with seeded world (full prototype narrative, every edge type
represented) and REAL semantics (version/activity bumps, counters, blocked rollups,
PullState staleness, auto-tabs, awards, unblock ripple, undo tokens, latency); the
simulation driver emitting WorkspaceEvents; four stores; tokens.css ported from the
prototype `_ds` bundle; kit primitives; the standalone mount (`collab-v2.html` +
`CollabV2App` placeholder).
**Gate G0:** contract test-suite green (every read contract-shaped; every command
mutates correctly incl. versions/counters/staleness/blocked/undo); stores replay a
scripted event stream; tsc clean. → Atlas commits, writes STATE.md.

### Wave 1 — Entity contract + Shell (Forma ∥ Framer)
Forma: L1 (KindRegistry all 11 kinds, Chip/Card/Panel/FullView, tombstone, skeletons,
gallery page rendering every kind × Z1/Z2/Z3 + states).
Framer: L3 (rails, panel stack peek/stack/pin-split/promote, URL-addressable state incl.
stack encoding, history, keyboard map) — against placeholder center views.
**Gate G1:** gallery complete; deep-link → layout reproduction; 3-split pinning;
back/forward walks history; tsc + tests. → commit, STATE.md.

### Wave 2 — Subsystems + Collections (Weave ∥ Railway ∥ Pulse ∥ Lens — 4 parallel)
Each builds their L2/L4 scope per implementation plan, drivable standalone on the
gallery page against the mock.
**Gate G2:** thread virtualization (10k), rail 50-edge grouping, palette keyboard
parity, staleness/blocked live via simulation; same collection query renders in all six
layouts; board drag mutates status; tree drag reparents; graph dependency mode shows the
seeded red blocked path. → commit, STATE.md.

### Wave 3 — Screens (Vista ∥ Scenic ∥ Harbor — 3 parallel) + Sentinel starts
Compose the eleven screens per the view catalog; composition-only law enforced.
Sentinel (parallel): audits G0–G2 claims independently, files defects (Atlas routes
fixes to owners or fixes trivial integration issues itself).
**Gate G3:** every screen reachable from the left rail on mock data; no layer/registry
violations (Sentinel-checked); tsc + tests. → commit, STATE.md.

### Wave 4 — Interactions + States (Motion ∥ Sentinel continues)
Motion: L6 grammar (7 rows, ghost labels, drop menus, undo), creation flows,
promote-message, optimistic/409 handling. Atlas in parallel does L7 polish routing:
assigns state-inventory/perf/a11y fixes from Sentinel's audit to idle personas.
**Gate G4:** all grammar rows work with undo; promote-to-task; simulated 409 rollback;
state inventory covered. → commit, STATE.md.

### Wave 5 — Acceptance (Sentinel + Atlas)
Sentinel runs the five golden workflows end-to-end in the browser (simulation on),
full gallery audit, layer-law sweep, perf/a11y checks. Atlas fixes or routes remaining
defects, then final integration commit and completion report to the user with: how to
run it, what's demoable, known gaps.
**Definition of done:** implementation plan §L8 checklist, all green.

## 6. Verification & commit protocol (every gate)

1. Worker self-verifies (scoped tsc + scoped vitest + a written claim list: "what I
   built, how I proved it").
2. Atlas verifies on the worktree: `cd maestro-ui && bunx tsc -b && bunx vitest run
   src/collab-v2` + visual check on the dev server (and Sentinel independently from W3).
3. Atlas reviews the diff for ownership violations + architecture laws.
4. Atlas commits: `feat(collab-v2-ui): W<n> <scope> — <summary>` and updates STATE.md
   (landed exports, file map, deviations from plan, next-wave notes).
5. Only then spawn the next wave.

## 7. Communication protocol

- Workers: `maestro task report progress` at meaningful milestones (start, mid,
  self-verified), `report blocked` immediately with the precise missing export/decision,
  `report complete` with the claim list.
- Atlas: watches via `maestro master sessions --active` + task reports; prompts workers
  with `maestro session prompt <id> --message`; reports wave completions upward on its
  own task; escalates to the user ONLY genuine design/scope decisions (visual taste
  calls within the prototype's language are Atlas's to make).
- Contract changes: if the backend-audit session (sess_1784926931576_ao7lzhk13) settles
  realtime-event shapes or cursor semantics differently from the data-contract doc,
  the USER or coordinator relays it; only Keystone (or Atlas) may amend `types/` +
  MockFacade, followed by a broadcast note in STATE.md.

## 8. Budget & concurrency

Max 4 worker sessions concurrent (W2) + Atlas. ~13 worker-sessions total across waves.
Fable 5: Atlas, Keystone, Forma, Lens, Sentinel. Opus 5: all others. If a wave stalls
on model capacity, serialize within the wave rather than downgrading models.
