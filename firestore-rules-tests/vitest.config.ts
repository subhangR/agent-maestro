import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The suite shares one emulator instance — run files sequentially.
    fileParallelism: false,
  },
});
