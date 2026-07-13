# Spell System Build — Orchestration Plan (CONDUCTOR)

The build runs as a **conductor with 4 movements**, using **both** dynamic Workflows (parallel read/review fan-out) and **Claude agent teams** (collaborative create/build). The conductor (main loop) runs each movement, reads its output, and only advances on a green gate.

```
 M1 AUDIT            M2 DESIGN              M3 IMPLEMENT            M4 REVIEW
 (Workflow)          (Agent Team)          (Agent Teams)          (Workflow)
 4 parallel    -->   design lead +    -->  foundation team  -->   4 reviewers
 auditors            specialists +         then feature             -> verify
 -> go/no-go         critic loop           teams (worktrees)        -> ship report
        \________________ gate ______________ gate _________________/
                     conductor stops at each gate for your review
```

Why this split: the Workflow sandbox has `agent()/parallel()/pipeline()` but **cannot** `TeamCreate`/`SendMessage`. So review-style fan-out (M1, M4) = Workflow; collaborative design & implementation (M2, M3) = real Claude agent teams driven from the main loop.

---

## Movement 1 — AUDIT  (dynamic Workflow)
Script: `wf-audit.mjs`. 4 read-only auditors (server, cli, ui, ux) in parallel → go/no-go synthesis. **Gate:** verdict must be `go`/`go-with-fixes`, and the Claude exit-2 feasibility unknown must have a verification plan. I run a tiny exit-2 spike here if needed.

## Movement 2 — UI/UX DESIGN  (Claude agent team)
`TeamCreate` a **Design Team**, then spawn named teammates (addressable, collaborate via `SendMessage`):
- **design-lead** (coordinator) — owns the design system + cohesion; splits areas; integrates.
- **ui-systems** — design tokens, `SPELL_COLORS` palette, concentric-ring border system, theming (light/dark).
- **ux-flows** — casting/multi-select/activation flows, ensemble mental model, empty/error/loading states.
- **components** — SpellPicker redesign, spell-details view, ensemble grouping, task-tile assignment, custom spell/skill creation.
- **design-critic** — adversarial quality pass against the "stunning + properly engineered + accessible" bar; bounces work back to the lead until it clears.
Flow: lead briefs → specialists design in parallel → critic reviews → lead integrates → **deliverable: a design spec + component/state inventory + token sheet** written to `docs/spell-system-design/UI_SPEC.md`. **Gate:** you approve the design spec before any code.

## Movement 3 — IMPLEMENTATION  (Claude agent teams, worktree-isolated)
`TeamCreate` an **Implementation Team**. Foundation-first to avoid worktree conflicts (per repo convention: branch off a foundation commit):
1. **foundation-team** (sequential, single branch): Spell entity + repo, `Session.activeSpells`, activate/deactivate routes + WS, fix double-inject + CLI contract bugs. Lands first.
2. **feature-teams** (parallel, each in its own git worktree off the foundation branch):
   - **server-dispatch** — hook dispatcher endpoint + trigger evaluator + Ensemble + multi-target invoke.
   - **cli-hooks** — `maestro hook dispatch`, bind events, manifest.spells, `maestro ensemble message`.
   - **ui-borders** — concentric rings on the 3 boxes, stores, WS wiring.
   - **ui-surfaces** — picker/details/task-tile/custom-create per `UI_SPEC.md`.
   Each team = an implementer + a per-area verifier (tsc -b; never concurrent `build:ui`).
3. **integrator** — merges worktrees, resolves conflicts, runs full typecheck + tests. **Gate:** green build.

## Movement 4 — REVIEW  (dynamic Workflow)
Script: `wf-review.mjs`. 4 dimensions (correctness, security, ux-fidelity, integration) → each finding adversarially verified → ship-readiness report. **Gate:** `shipReady` or a prioritized fix list (loop back to M3 if blockers).

---

## Conductor execution (main loop)
```
1. Workflow({ scriptPath: "docs/spell-system-design/wf-audit.mjs" })      // M1
   -> read report; STOP at gate.
2. TeamCreate("Spell Design Team") + spawn 5 named teammates; run M2.
   -> write UI_SPEC.md; STOP at gate (you approve design).
3. TeamCreate("Spell Impl Team"); foundation-team; then feature-teams in worktrees; integrator.
   -> green build; STOP at gate.
4. Workflow({ scriptPath: "docs/spell-system-design/wf-review.mjs" })     // M4
   -> ship report; STOP at gate.
```

## Ground truth for every agent/teammate
`docs/spell-system-design/DESIGN_BRIEF.md` + the 6 `*.excalidraw` diagrams. (M2 also produces `UI_SPEC.md`, ground truth for M3.)

## Approval checklist (what I need a yes on before starting)
- [ ] The 4-movement split (Workflow for M1/M4, agent teams for M2/M3)
- [ ] Team rosters above (sizes/roles)
- [ ] Foundation-first + per-feature worktree isolation for M3
- [ ] Conductor stops at each gate for your review (vs. run straight through)
- [ ] Start with M1 (audit) now
