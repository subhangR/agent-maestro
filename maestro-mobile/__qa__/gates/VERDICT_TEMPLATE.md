# Phase-gate VERDICT template (Sentinel → Atlas)

Atlas does NOT open the next phase until the verdict is `PASS` (or a
`PASS-WITH-WAIVERS` Atlas explicitly accepts). **A single contract-fidelity FAIL
vetoes the gate** regardless of other greens. Every CONFIRMED must cite the test or
repro that proves it.

```
SENTINEL VERDICT — Phase <n> (<name>)
Status: PASS | FAIL | PASS-WITH-WAIVERS
Gates:
  tsc(--noEmit, app) .............. PASS/FAIL
  tsc(-p tsconfig.drift.json) ..... PASS/FAIL
  isolation invariants ............ PASS/FAIL   (app excludes __sync__; metro blockList)
  suppression scan ................ PASS/FAIL   (no @ts-nocheck/@ts-ignore/@ts-expect-error)
  expo-doctor ..................... PASS/FAIL
  dev-client boot (android) ....... PASS/FAIL/SKIPPED-NO-DEVICE
  expo export (serialized) ........ PASS/FAIL/SKIPPED
  jest (unit+integration) ......... <pass>/<total> | N/A (no runner yet)
Contract checks (this phase): <m>/<n> verified
Claims audited:
  <worker>: "<claim>" -> CONFIRMED | REFUTED (<evidence: file:line / test>)
Blockers (FAIL reasons):
  - <file:line> <what's wrong vs contract §x.y>
Waivers (if PASS-WITH-WAIVERS):
  - <deferred item> — owner <worker>, due Phase <n+1>, risk <low/med>
Regression: <none | list>
Verdict rationale: <2-3 lines>
```
