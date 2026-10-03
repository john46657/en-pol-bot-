import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { port: Number(process.env.WEB_PORT ?? 5173), proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000', '/ws': { target: process.env.API_URL ?? 'http://localhost:3000', ws: true } } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'], css: false },
});
