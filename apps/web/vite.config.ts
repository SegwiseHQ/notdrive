import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
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
  },
});
