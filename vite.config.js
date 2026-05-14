import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Set by `npm run dev:stack` so proxy matches the API’s chosen port */
const apiPort = process.env.VITE_DEV_API_PORT || process.env.PORT || '3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
