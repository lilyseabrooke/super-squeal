import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several tests play the whole game (90+ quests, 400+ plots), so allow more than the 5s default.
    testTimeout: 20000,
  },
});
