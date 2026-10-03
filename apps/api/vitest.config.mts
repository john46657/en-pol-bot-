import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { globals: false, environment: 'node', include: ['test/**/*.test.ts'], globalSetup: ['test/global-setup.mts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 },
});
