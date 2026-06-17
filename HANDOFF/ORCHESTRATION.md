# maestro-mobile — Orchestration state (Maestro entities)

Everything needed to resume the Atlas-led multi-agent build. IDs are stable Maestro entity IDs.

## Coordinator (you, when resuming)

| Field | Value |
|---|---|
| Name | 🎯 Atlas (orchestrator) |
| Team-member ID | `tm_1781678505518_doggxb1sq` |
| Mode | coordinator |
| Project | `proj_1770533548982_3bgizuthk` (Agent-maestro, workingDir `/Users/subhang/Desktop/Projects/maestro/agent-maestro`) |
| Original session | `sess_1781679133643_y4qgucssu` (will differ on resume — re-announce) |
| Worktree | `feat/mobile-app` at `/Users/subhang/Desktop/Projects/maestro/mobile-wt/app` (root = the whole monorepo) |
| App dir | `maestro-mobile/` (standalone npm Expo app, outside the bun workspace) |

## Team — `📱 Maestro Mobile` = `team_1781679176046_08uixxexz`

Leader = Atlas. All members: model `claude-opus-4-8[1m]`, agent `claude-code`, `bypassPermissions`.

| Name | Team-member ID | Scope (disjoint) |
|------|----------------|------------------|
| 🪨 Bedrock | `tm_1781678505758_rinutdhje` | `theme/` + root config (package.json/tsconfig/babel/metro/app.json/index.ts) |
| 📐 Lexicon | `tm_1781678505988_ot6x7vuoo` | `src/domain/` (+ `__sync__` drift-guard, `tsconfig.drift.json`) |
| 🔌 Conduit | `tm_1781678506221_sl39sn0s1` | `src/services/api/` |
| 📡 Pulse | `tm_1781678506449_qjyqbewv6` | `src/services/realtime/` |
| 🗃️ Ledger | `tm_1781678506678_q1o5zcxl1` | `src/state/` |
| 🧭 Compass | `tm_1781678531941_sh23bh2s2` | `app/` + `navigation/` (expo-router, tab bar, SheetHost) |
| 🎨 Palette | `tm_1781678532172_w5f6jz3n0` | `src/components/` (primitives/controls done; composite tiles = Phase 2) |
| 🛠️ Forge | `tm_1781678532400_kvbpkuvb3` | `src/features/` — Stream A (maestro-panel) + Stream B (session-panel) + `features/docs/` |
| ⌨️ Relay | `tm_1781678532631_0227i1fzn` | `src/terminal/` + `src/whiteboard/` (WebView xterm + Excalidraw) |
| ✅ Sentinel | `tm_1781678532887_5wxcsev4x` | `__qa__/` — adversarial verify + phase gates |

> If the Maestro stack/data is NOT present on the resume host, recreate the team with
> `maestro team create "Maestro Mobile" --leader <Atlas> --members <Atlas,…all 10…> --avatar "📱"`
> (or proceed as a direct implementer — see RESUME_PROMPT.md).

## Tasks (Maestro)

| Phase | Parent task | Status |
|---|---|---|
| Planning | `task_1781679184252_4wdm5t7r9` | ✅ complete (5 ratified docs + 10 plans) |
| Phase 0 Foundation | `task_1781681499941_crwg0f3co` | ✅ complete (gate PASS-WITH-WAIVERS) |
| Phase 1 Connection core | `task_1781683615327_7vg6c25cg` | 🟡 BUILT + committed; **Sentinel gate not yet run** |

Phase-1 subtasks (all built/committed): Conduit `task_1781683615579_k3js3jlr7`, Pulse `task_1781683615844_eaffizc4x`, Ledger `task_1781683616093_liuahwc95`, Palette `task_1781683616349_zwhxfgmk7`.

## Worker sessions (reference — spawn fresh ones on resume)

- Phase 0: Bedrock `sess_1781681534306_leupthq5r`, Lexicon `sess_1781682050734_kmybvyqi1`, Sentinel `sess_1781682053171_crv6p36e0`
- Phase 1: Conduit `sess_1781683688028_xw0tbs2yh`, Pulse `sess_1781683690359_gjseggxgl`, Ledger `sess_1781683691469_to4owvgm5`, Palette `sess_1781683696092_v41htolc4`

## Spawn recipe (per worker, coordinator mode)

```
# 1) create a scoped task
maestro task create "Phase N: <scope> (<Name>)" --priority high --parent <phaseParent> --desc "<full scope + deliverables; no git>"
# 2) spawn the worker on it
maestro session spawn --task <taskId> --team-member-id <tmId> \
  --model 'claude-opus-4-8[1m]' --permission-mode bypassPermissions \
  --subject "<directive>" --message "<self-contained brief: scope, contract, report-to-Atlas, no git, NODE_ENV install rule>"
```
Workers report via `maestro task report`; **workers never run git — Atlas integrates + commits**.
