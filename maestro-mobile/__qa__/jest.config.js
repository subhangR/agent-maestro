// Jest config — Sentinel (QA). Scoped under __qa__/ so it never collides with
// Bedrock's root config files. Bedrock wires package.json:
//   "test": "jest --config __qa__/jest.config.js"
// and adds the devDeps (jest-expo@~54 — SDK is 54, NOT 52 — jest, RTL, msw, ws).
//
// rootDir is the package root so the jest-expo preset resolves RN/Expo from this
// standalone npm app's own node_modules (not the bun workspace above it).

/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/__qa__/jest.setup.ts'],
  testMatch: [
    '<rootDir>/__qa__/**/*.test.ts',
    '<rootDir>/__qa__/**/*.test.tsx',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
  ],
  // The drift guard and the server are typecheck/bundle-excluded everywhere else;
  // keep them out of the test graph too.
  testPathIgnorePatterns: ['/node_modules/', '/src/domain/__sync__/', '/maestro-server/'],
  // RN/Expo ship untranspiled ESM; jest-expo's pattern must allow our extra native deps.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-unistyles|react-native-nitro-modules|react-native-worklets|react-native-edge-to-edge|msw|@mswjs/.*))',
  ],
  // RN tests are memory-heavy; cap workers so CI runners don't OOM (see qa plan §4).
  maxWorkers: 2,
};
