import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_PUBLIC_APP_ROLE': JSON.stringify('companion'),
  },
  resolve: {
    alias: [
      {
        find: './app/SelectedApp',
        replacement: fileURLToPath(new URL('./src/app/PhotographerMobileApp.tsx', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist-photographer',
  },
});
