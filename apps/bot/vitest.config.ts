import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Integrationstests teilen sich Datenbank und Redis
    fileParallelism: false,
  },
});
