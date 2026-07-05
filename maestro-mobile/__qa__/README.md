# `__qa__/` — Sentinel (QA & integration)

The QA scope: the test stack, the typecheck/build gates, the contract harness
(**Maelstrom**), the contract fixtures, and the per-phase adversarial VERDICT.
Everything here is owned by Sentinel; nothing outside `__qa__/` is edited by QA
(integration bugs are filed to Atlas/the owner as `file:line` + contract §). Atlas
integrates and commits — QA never runs git.

## Layout

```
__qa__/
  maelstrom/            the in-repo fake server (the single most important QA asset)
    envelopes.ts        WsEnvelope shape + the SOURCE-VERIFIED 7 IMMEDIATE_EVENTS
    entitySync.ts       fake entity-sync WS: array(batched) vs single(immediate) framing, ping, sub
    pty.ts              fake /pty WS: size→scrollback→live, {exit}, 1011/1008 close codes
    server.ts           combined http+ws, routes upgrades by path (/pty vs bare origin)
    msw-handlers.ts     REST handlers (skeleton) — double as the REST contract spec
    index.ts            barrel
  contract/
    events.fixtures.ts      batched/immediate/mixed envelope samples
    pty-frames.fixtures.ts  size/exit/resize frames, control bytes, multibyte-split glyph
  gates/
    run-gate.sh         per-package tsc gate (NEVER concurrent bundling) + isolation + suppression scan
    dev-client-smoke.md Android dev-client BOOT smoke (native modules — JS export is insufficient)
    VERDICT_TEMPLATE.md the phase-gate verdict block Atlas gates on
  jest.config.js        jest-expo preset (SDK 54 → jest-expo ~54), scoped here (no root collision)
  jest.setup.ts         RTL matchers + (later) MSW/Maelstrom lifecycle
  tsconfig.json         typechecks __qa__ in isolation (node+jest types; NOT in the app gate)
  maelstrom-smoke.ts    runnable proof of the framing (no jest needed) — see below
```

## Running the gate

From the package root (`maestro-mobile/`):

```bash
__qa__/gates/run-gate.sh                # safe gates (tsc, drift, isolation, suppression, expo-doctor)
__qa__/gates/run-gate.sh --with-export  # also the SERIALIZED Metro export — run ALONE, never concurrent
```

## Running the Maelstrom smoke (proves the contract framing)

jest-expo is not installed until Bedrock wires the test devDeps, so the framing is
proven with a plain-node smoke that drives real `ws` sockets:

```bash
# from maestro-mobile/
rm -rf /tmp/maelstrom-smoke
npx tsc __qa__/maelstrom-smoke.ts __qa__/maelstrom/*.ts \
  --outDir /tmp/maelstrom-smoke --module commonjs --target es2021 \
  --moduleResolution node --esModuleInterop --skipLibCheck --noEmitOnError false
NODE_PATH="$(pwd)/node_modules" node /tmp/maelstrom-smoke/maelstrom-smoke.js
```

Expected: `Maelstrom smoke: PASS` — 9 checks (ping→pong; batched=ARRAY; immediate=SINGLE;
immediate-not-array; pty size-frame-first; binary scrollback; size-precedes-bytes; 1011 no-PTY; 1008 missing-id).
(The `ws` type/msw-resolution TS warnings during compile are expected at Phase 0 —
`@types/ws` + `msw` are Bedrock's devDeps, not yet installed; `--noEmitOnError false` emits anyway.)

## Once Bedrock wires the test devDeps

Add to `package.json` (Bedrock owns root config):
- devDeps: `jest-expo@~54`, `jest`, `@testing-library/react-native@^13`,
  `@testing-library/jest-native`, `msw@^2`, `ws`, `@types/ws`, `@types/jest`
- script: `"test": "jest --config __qa__/jest.config.js"`

Then `npm test` runs the integration tests (added per phase), and the Maelstrom smoke
graduates into a jest integration test.

## Notes carried into later phases

- **IMMEDIATE_EVENTS = exactly 7** (source-verified in `WebSocketBridge.ts` L16-24).
  `MOBILE_APP_BUILD_ANALYSIS.md` §2.2 over-lists them (adds spell:activated/deactivated +
  ensemble:*) — those are BATCHED. `envelopes.ts` is pinned to the verified 7.
- **`team:*` is REST-poll** (declared in TypedEventMap but not broadcast).
- **Streaming `TextDecoder({stream:true})` per session** is mandatory — see the
  multibyte-split glyph fixture; a naive per-frame decode renders replacement chars.
