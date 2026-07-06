import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: './app/SelectedApp',
        replacement: fileURLToPath(new URL('./src/app/AdminApp.tsx', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist-admin',
  },
});
