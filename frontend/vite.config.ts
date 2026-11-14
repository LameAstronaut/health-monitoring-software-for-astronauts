import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'ASTRA_API_PROXY_TARGET');
  return {
    plugins: [react()],
    base: process.env.GITHUB_ACTIONS ? '/health-monitoring-software-for-astronauts/' : '/',
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: env.ASTRA_API_PROXY_TARGET ?? 'http://127.0.0.1:8000', ws: true } },
    },
  };
});
