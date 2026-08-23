import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { assertStoreLiteHtmlPolicy } from './scripts/store-lite-html-policy.mjs';
import { assertPublicHttpsUrl, assertStoreLiteApiOrigin } from './scripts/store-lite-url-policy.mjs';

const projectRootPath = normalizeModulePath(fileURLToPath(new URL('.', import.meta.url)));
const storeLiteEntryPath = fileURLToPath(new URL('./src/storeLiteMain.tsx', import.meta.url));
const storeLiteHtmlPath = fileURLToPath(new URL('./store-lite-entry/index.html', import.meta.url));
const allowedLocalFiles = new Set([
  normalizeModulePath(storeLiteEntryPath),
  normalizeModulePath(storeLiteHtmlPath),
  normalizeModulePath(fileURLToPath(new URL('./src/styles/index.css', import.meta.url))),
  normalizeModulePath(fileURLToPath(new URL('./src/types/api.ts', import.meta.url))),
]);
const allowedLocalDirectories = [
  `${normalizeModulePath(fileURLToPath(new URL('./src/store-lite', import.meta.url))).replace(/\/$/, '')}/`,
];

function storeLiteEntrypoint(): Plugin {
  return {
    name: 'store-lite-entrypoint',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const entry = '../src/storeLiteMain.tsx';
        assertStoreLiteHtmlPolicy(html, entry);
        if (html.includes('/src/main.tsx')) throw new Error('Store Lite entry must not reference src/main.tsx.');
        return html;
      },
    },
  };
}

function storeLiteModuleBoundary(): Plugin {
  return {
    name: 'store-lite-module-boundary',
    generateBundle(_options, bundle) {
      const violations = new Set<string>();
      const entryChunks = Object.values(bundle).filter((output) => output.type === 'chunk' && output.isEntry);
      if (entryChunks.length !== 1) {
        throw new Error(`Store Lite expected exactly one Rollup entry chunk, found ${entryChunks.length}.`);
      }
      const entryFacade = normalizeModulePath(entryChunks[0].facadeModuleId || '');
      if (entryFacade !== normalizeModulePath(storeLiteHtmlPath)) {
        throw new Error(`Store Lite entry facade must be ${normalizeModulePath(storeLiteHtmlPath)}, found ${entryFacade || '(none)'}.`);
      }

      let storeLiteMainFound = false;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          const normalized = normalizeModulePath(moduleId);
          if (normalized === normalizeModulePath(storeLiteEntryPath)) storeLiteMainFound = true;
          if (isUnapprovedLocalModule(normalized)) violations.add(normalized);
        }
      }
      if (!storeLiteMainFound) throw new Error('Store Lite bundle is missing src/storeLiteMain.tsx.');
      if (violations.size) {
        throw new Error(`Store Lite bundle contains local modules outside the allowlist:\n${[...violations].sort().join('\n')}`);
      }
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build') validateReleaseEnvironment(env);

  return {
    root: fileURLToPath(new URL('./store-lite-entry', import.meta.url)),
    plugins: [storeLiteEntrypoint(), storeLiteModuleBoundary(), react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '/src/storeLiteMain.tsx', replacement: storeLiteEntryPath },
        { find: '@store-lite', replacement: fileURLToPath(new URL('./src/store-lite', import.meta.url)) },
      ],
    },
    define: {
      'import.meta.env.VITE_APP_ENV': JSON.stringify(command === 'build' ? 'production' : env.VITE_APP_ENV || 'development'),
      'import.meta.env.VITE_RELEASE_PROFILE': JSON.stringify('store_lite'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
      'import.meta.env.VITE_ENABLE_MOCK': JSON.stringify('false'),
      'import.meta.env.VITE_ENABLE_TEST_ROLE_SWITCH': JSON.stringify('false'),
      'import.meta.env.VITE_PRIVACY_URL': JSON.stringify(env.VITE_PRIVACY_URL || ''),
      'import.meta.env.VITE_TERMS_URL': JSON.stringify(env.VITE_TERMS_URL || ''),
      'import.meta.env.VITE_SUPPORT_URL': JSON.stringify(env.VITE_SUPPORT_URL || ''),
    },
    build: {
      outDir: '../dist-store-lite',
      emptyOutDir: true,
      manifest: 'store-lite-vite-manifest.json',
      sourcemap: false,
    },
  };
});

function validateReleaseEnvironment(env: Record<string, string | undefined>) {
  const expected = [
    ['VITE_APP_ENV', 'production'],
    ['VITE_RELEASE_PROFILE', 'store_lite'],
    ['VITE_ENABLE_MOCK', 'false'],
    ['VITE_ENABLE_TEST_ROLE_SWITCH', 'false'],
  ] as const;
  for (const [name, value] of expected) {
    if (String(env[name] || '').trim().toLowerCase() !== value) throw new Error(`Store Lite build requires ${name}=${value}.`);
  }
  assertStoreLiteApiOrigin('VITE_API_BASE_URL', env.VITE_API_BASE_URL);
  for (const name of ['VITE_PRIVACY_URL', 'VITE_TERMS_URL', 'VITE_SUPPORT_URL'] as const) {
    assertPublicHttpsUrl(name, env[name]);
  }
}

function isUnapprovedLocalModule(normalized: string) {
  if (!normalized || normalized.startsWith('\0') || normalized.includes('/node_modules/')) return false;
  const isAbsolutePath = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized);
  if (!isAbsolutePath) return false;
  if (allowedLocalFiles.has(normalized)) return false;
  if (allowedLocalDirectories.some((directory) => normalized.startsWith(directory))) return false;
  return normalized.startsWith(projectRootPath) || !normalized.includes('/node_modules/');
}

function normalizeModulePath(value: string) {
  return String(value || '').split('?')[0].split('#')[0].replace(/\\/g, '/').replace(/\/$/, '');
}
