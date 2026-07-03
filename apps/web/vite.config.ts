import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // VITE_API_ORIGIN tells the frontend where the API lives. Used both for the
  // typed API client and (here) for the dev-server proxy that makes
  // /item-assets/* same-origin from the browser's perspective.
  const env = loadEnv(mode, process.cwd(), '');
  const apiOrigin = env.VITE_API_ORIGIN ?? 'http://localhost:3000';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@notdrive/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@notdrive/api/app-type': path.resolve(__dirname, '../api/src/app-type.ts'),
      },
    },
    server: {
      port: 5173,
      host: true,
      // /item-assets/* lands on the API. Stored HTML uses relative URLs so the
      // same pages render correctly regardless of how the frontend is served
      // (Vite dev here, Amplify in prod — see Amplify rewrite in README).
      proxy: {
        '/item-assets': {
          target: apiOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});
