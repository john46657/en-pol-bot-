import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port 3001 = DASHBOARD_URL der API (CORS + OAuth-Redirect).
export default defineConfig({ plugins: [react()], server: { port: 3001, strictPort: true } });
