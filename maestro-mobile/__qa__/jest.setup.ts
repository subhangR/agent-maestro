// Jest setup — Sentinel (QA). Runs after the test framework is installed.
//
// Phase 0: minimal. As phases land this wires the MSW node server lifecycle
// (beforeAll listen / afterEach resetHandlers / afterAll close) and Maelstrom
// start/stop helpers. Kept deliberately thin until the runner deps are installed.

// RTL native matchers (toBeVisible, toHaveStyle, ...). Import guarded so this file
// still loads if the dep isn't present yet at Phase 0.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@testing-library/jest-native/extend-expect');
} catch {
  // devDep not installed yet (Bedrock wires it) — no-op at Phase 0.
}
