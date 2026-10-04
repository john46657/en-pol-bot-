import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC erzeugt die Decorator-Metadaten, die Nest für die Konstruktor-Injektion braucht (esbuild tut das nicht).
export default defineConfig({
  plugins: [swc.vite({ jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2023' }, module: { type: 'es6' } })],
  test: { include: ['test/**/*.test.ts'], globalSetup: ['test/global-setup.ts'], testTimeout: 30_000 },
});
