import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const projectSourcePath = fileURLToPath(new URL('./src/', import.meta.url)).replace(/\\/g, '/');
const forbiddenConsumerModules = [
  `${projectSourcePath}features/companion/`,
  `${projectSourcePath}layouts/RoleShell.tsx`,
  `${projectSourcePath}app/PhotographerMobileApp.tsx`,
];

function consumerModuleBoundary(): Plugin {
  return {
    name: 'consumer-module-boundary',
    generateBundle(_options, bundle) {
      const violations = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          const normalized = moduleId.split('?')[0].replace(/\\/g, '/');
          if (forbiddenConsumerModules.some((path) => normalized.startsWith(path))) violations.add(normalized);
        }
      }
      if (violations.size) {
        throw new Error(`Consumer app contains photographer-only modules:\n${[...violations].sort().join('\n')}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [consumerModuleBoundary(), react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_PUBLIC_APP_ROLE': JSON.stringify('consumer'),
  },
  resolve: {
    alias: [
      {
        find: './app/SelectedApp',
        replacement: fileURLToPath(new URL('./src/app/ConsumerMobileApp.tsx', import.meta.url)),
      },
    ],
  },
});
