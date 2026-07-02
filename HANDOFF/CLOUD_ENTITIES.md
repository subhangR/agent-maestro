# maestro-mobile — CLOUD entity IDs (this host)

Re-created on the cloud host (EC2) via `maestro team-member create` on 2026-06-17. New IDs differ from the bundled Mac IDs in ORCHESTRATION.md (CLI mints fresh IDs). Project `proj_1781381679383_4wbw3num0` (agent-maestro, workingDir `/home/ubuntu/agent-maestro`). Server `localhost:4570`, data `~/.maestro/data`.

- **Coordinator (Atlas):** running session `sess_1781710438710_3iagnveo1`, team-member `tm_proj_1781381679383_4wbw3num0_coordinator`.
- **Team `📱 Maestro Mobile`:** `team_1781711245945_b94lyr9ib` (leader = coordinator).

| Specialist | New cloud ID | Old Mac ID | Scope |
|---|---|---|---|
| Bedrock | `tm_1781711168576_do3z4ducr` | `tm_1781678505758_rinutdhje` | theme/ + root config |
| Lexicon | `tm_1781711168900_vwv9tn1gm` | `tm_1781678505988_ot6x7vuoo` | src/domain/ (+__sync__ drift-guard) |
| Conduit | `tm_1781711169194_n9r7svbcm` | `tm_1781678506221_sl39sn0s1` | src/services/api/ |
| Pulse | `tm_1781711169494_5um9r46g8` | `tm_1781678506449_qjyqbewv6` | src/services/realtime/ |
| Ledger | `tm_1781711169805_mkdpbbuj9` | `tm_1781678506678_q1o5zcxl1` | src/state/ |
| Compass | `tm_1781711170110_m1241wphr` | `tm_1781678531941_sh23bh2s2` | app/ + navigation/ |
| Palette | `tm_1781711170426_4njjiwwws` | `tm_1781678532172_w5f6jz3n0` | src/components/ |
| Forge | `tm_1781711170722_lpsqlvu3v` | `tm_1781678532400_kvbpkuvb3` | src/features/ (Stream A ∥ Stream B + docs) |
| Relay | `tm_1781711171016_edwn0f4tk` | `tm_1781678532631_0227i1fzn` | src/terminal/ + src/whiteboard/ |
| Sentinel | `tm_1781711171326_tll113wxv` | `tm_1781678532887_5wxcsev4x` | __qa__/ (adversarial gates) |

All: model `claude-opus-4-8[1m]`, agent `claude-code`, mode `coordinated-worker`, `bypassPermissions`.
