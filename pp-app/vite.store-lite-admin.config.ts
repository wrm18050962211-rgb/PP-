import process from 'node:process';
import { isIP } from 'node:net';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const projectRootPath = normalizeModulePath(fileURLToPath(new URL('.', import.meta.url)));
const adminSourceDirectory = `${normalizeModulePath(fileURLToPath(new URL('./src/store-lite-admin', import.meta.url))).replace(/\/$/, '')}/`;
const sharedTypesDirectory = `${normalizeModulePath(fileURLToPath(new URL('./src/types', import.meta.url))).replace(/\/$/, '')}/`;
const sharedStylesDirectory = `${normalizeModulePath(fileURLToPath(new URL('./src/styles', import.meta.url))).replace(/\/$/, '')}/`;
const adminEntryPath = normalizeModulePath(fileURLToPath(new URL('./src/store-lite-admin/main.tsx', import.meta.url)));
const adminHtmlPath = normalizeModulePath(fileURLToPath(new URL('./store-lite-admin-entry/index.html', import.meta.url)));
const allowedLocalFiles = new Set([adminHtmlPath]);
const allowedLocalDirectories = [adminSourceDirectory, sharedTypesDirectory, sharedStylesDirectory];
const forbiddenBundleMarkers = ['AdminDashboard', 'AppDataProvider', 'payment', 'chat', 'upload'] as const;
const approvedStoreLiteApiOrigin = 'https://api.weareinframe.com';
const reservedHostSuffixes = [
  'example',
  'example.com',
  'example.net',
  'example.org',
  'home.arpa',
  'internal',
  'invalid',
  'lan',
  'local',
  'localhost',
  'onion',
  'test',
] as const;

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build') validateProductionEnvironment(env);

  return {
    root: fileURLToPath(new URL('./store-lite-admin-entry', import.meta.url)),
    plugins: [
      adminSourceHtmlPolicy(command),
      adminModuleBoundary(),
      react(),
      tailwindcss(),
      ...(command === 'build' ? [adminBuiltHtmlPolicy()] : []),
    ],
    define: {
      'import.meta.env.VITE_APP_ENV': JSON.stringify(command === 'build' ? 'production' : env.VITE_APP_ENV || 'development'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
    },
    build: {
      outDir: '../dist-store-lite-admin',
      emptyOutDir: true,
      manifest: 'store-lite-admin-vite-manifest.json',
      sourcemap: false,
    },
  };
});

function adminSourceHtmlPolicy(command: 'build' | 'serve'): Plugin {
  return {
    name: 'store-lite-admin-source-html-policy',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const expectedEntry = '../src/store-lite-admin/main.tsx';
        assertSingleScriptElement(html, (attributes) => {
          if (attributes.size !== 2 || attributes.get('type')?.value !== 'module' || !attributes.get('type')?.quoted) {
            throw new Error('Store Lite Admin source script must contain only quoted type="module" and src attributes.');
          }
          const source = attributes.get('src');
          if (!source?.quoted || source.value !== expectedEntry) {
            throw new Error(`Store Lite Admin source script must reference exactly ${expectedEntry}.`);
          }
        });
        for (const forbidden of ['/src/main.tsx', 'storeLiteMain', 'AdminApp', 'AdminDashboard', 'SelectedApp']) {
          if (html.includes(forbidden)) throw new Error(`Store Lite Admin HTML references forbidden entry: ${forbidden}.`);
        }
        assertProductionCsp(html);
        return command === 'serve'
          ? html.replace("connect-src 'self' https:;", "connect-src 'self' https: http://127.0.0.1:8787;")
          : html;
      },
    },
  };
}

function adminBuiltHtmlPolicy(): Plugin {
  return {
    name: 'store-lite-admin-built-html-policy',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        assertProductionCsp(html);
        assertSingleScriptElement(html, (attributes) => {
          const allowedAttributes = new Set(['type', 'src', 'crossorigin']);
          if ([...attributes.keys()].some((name) => !allowedAttributes.has(name))) {
            throw new Error('Store Lite Admin built script contains an unapproved attribute.');
          }
          if (attributes.get('type')?.value !== 'module' || !attributes.get('type')?.quoted) {
            throw new Error('Store Lite Admin built script must use quoted type="module".');
          }
          const source = attributes.get('src');
          if (!source?.quoted || !/^\/assets\/[a-z0-9._-]+\.js$/i.test(source.value)) {
            throw new Error('Store Lite Admin built script must use one local /assets/*.js source.');
          }
          const crossOrigin = attributes.get('crossorigin');
          if (crossOrigin && crossOrigin.value !== '' && crossOrigin.value.toLowerCase() !== 'anonymous') {
            throw new Error('Store Lite Admin built script has an invalid crossorigin value.');
          }
        });
        return html;
      },
    },
  };
}

function assertProductionCsp(html: string) {
  const contentSecurityPolicies = [...String(html || '').matchAll(
    /<meta\b[^>]*http-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*content\s*=\s*(["'])([\s\S]*?)\2[^>]*>/gi,
  )];
  if (contentSecurityPolicies.length !== 1) {
    throw new Error(`Store Lite Admin HTML must contain exactly one Content-Security-Policy meta element, found ${contentSecurityPolicies.length}.`);
  }
  const policy = contentSecurityPolicies[0][3];
  if (!/\bconnect-src\s+'self'\s+https:\s*;/i.test(policy)) {
    throw new Error("Store Lite Admin production CSP must restrict connect-src to 'self' and HTTPS.");
  }
  if (/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)/i.test(policy) || /\bhttp:/i.test(policy)) {
    throw new Error('Store Lite Admin production CSP must not contain localhost, IP loopback, or insecure HTTP endpoints.');
  }
}

function adminModuleBoundary(): Plugin {
  return {
    name: 'store-lite-admin-module-boundary',
    transform(_code, id) {
      const normalized = normalizeModulePath(id);
      if (isUnapprovedLocalModule(normalized)) {
        throw new Error(`Store Lite Admin attempted to load a local module outside the allowlist: ${normalized}`);
      }
      return null;
    },
    generateBundle(_options, bundle) {
      const entryChunks = Object.values(bundle).filter((output) => output.type === 'chunk' && output.isEntry);
      if (entryChunks.length !== 1) {
        throw new Error(`Store Lite Admin expected exactly one Rollup entry chunk, found ${entryChunks.length}.`);
      }
      const entryFacade = normalizeModulePath(entryChunks[0].facadeModuleId || '');
      if (entryFacade !== adminHtmlPath) {
        throw new Error(`Store Lite Admin entry facade must be ${adminHtmlPath}, found ${entryFacade || '(none)'}.`);
      }

      const violations = new Set<string>();
      let adminEntryFound = false;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        assertNoForbiddenBundleMarkers(output.code, output.fileName);
        for (const moduleId of Object.keys(output.modules)) {
          const normalized = normalizeModulePath(moduleId);
          if (normalized === adminEntryPath) adminEntryFound = true;
          assertNoForbiddenBundleMarkers(normalized, normalized);
          if (isUnapprovedLocalModule(normalized)) violations.add(normalized);
        }
      }
      if (!adminEntryFound) throw new Error('Store Lite Admin bundle is missing its isolated main.tsx entry.');
      if (violations.size) {
        throw new Error(`Store Lite Admin bundle contains local modules outside the allowlist:\n${[...violations].sort().join('\n')}`);
      }
    },
  };
}

function validateProductionEnvironment(env: Record<string, string | undefined>) {
  const rawBaseUrl = String(env.VITE_API_BASE_URL || '').trim();
  if (!rawBaseUrl) throw new Error('Store Lite Admin production builds require VITE_API_BASE_URL.');
  assertPublicHttpsOrigin(rawBaseUrl, 'Store Lite Admin VITE_API_BASE_URL');
  if (new URL(rawBaseUrl).origin !== approvedStoreLiteApiOrigin) {
    throw new Error('Store Lite Admin VITE_API_BASE_URL must use the approved Still API origin.');
  }
}

function assertPublicHttpsOrigin(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid public HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS.`);
  if (parsed.username || parsed.password) throw new Error(`${label} must not contain credentials.`);
  if (parsed.port && parsed.port !== '443') throw new Error(`${label} must use the standard HTTPS port 443.`);
  if (parsed.search || parsed.hash || parsed.href.includes('?') || parsed.href.includes('#')) {
    throw new Error(`${label} must not contain a query string or fragment.`);
  }
  if (parsed.pathname !== '/') throw new Error(`${label} must be an HTTPS origin without a path.`);

  const rawHostname = parsed.hostname.toLowerCase();
  if (rawHostname.endsWith('.')) throw new Error(`${label} must not use a hostname with a trailing dot.`);
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;
  if (isIP(hostname)) throw new Error(`${label} must use a public DNS hostname, not an IP address.`);
  if (!hostname.includes('.')) throw new Error(`${label} must use a multi-label public DNS hostname.`);
  if (reservedHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new Error(`${label} must not use a reserved or private hostname suffix.`);
  }
  const labels = hostname.split('.');
  if (hostname.length > 253 || labels.some((part) => !isValidDnsLabel(part))) {
    throw new Error(`${label} must use a canonical public DNS hostname.`);
  }
}

function assertSingleScriptElement(html: string, validateAttributes: (attributes: Map<string, HtmlAttribute>) => void) {
  const source = String(html || '');
  const openMarkers = [...source.matchAll(/<script\b/gi)];
  const openTags = [...source.matchAll(/<script\b[^>]*>/gi)];
  const closingTags = [...source.matchAll(/<\/script\s*>/gi)];
  if (openMarkers.length !== 1 || openTags.length !== 1 || closingTags.length !== 1) {
    throw new Error(`Store Lite Admin HTML must contain exactly one script element, found ${openMarkers.length}.`);
  }
  if (/<base\b/i.test(source)) throw new Error('Store Lite Admin HTML must not contain a base element.');

  const tag = openTags[0][0];
  const openEnd = (openTags[0].index ?? 0) + tag.length;
  const closingStart = closingTags[0].index ?? -1;
  if (closingStart < openEnd || source.slice(openEnd, closingStart).trim()) {
    throw new Error('Store Lite Admin HTML must not contain inline script content.');
  }
  validateAttributes(parseHtmlAttributes(tag));
}

type HtmlAttribute = { value: string; quoted: boolean };

function parseHtmlAttributes(tag: string) {
  const attributes = new Map<string, HtmlAttribute>();
  const source = tag.replace(/^<script\b/i, '').replace(/>$/, '');
  const attributePattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  let offset = 0;
  while (offset < source.length) {
    while (/\s/.test(source[offset] || '')) offset += 1;
    if (offset >= source.length) break;
    attributePattern.lastIndex = offset;
    const match = attributePattern.exec(source);
    if (!match || match.index !== offset) throw new Error('Store Lite Admin script contains malformed attributes.');
    const name = match[1].toLowerCase();
    if (attributes.has(name)) throw new Error(`Store Lite Admin script repeats the ${name} attribute.`);
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes.set(name, { value, quoted: match[2] !== undefined || match[3] !== undefined });
    offset = attributePattern.lastIndex;
  }
  return attributes;
}

function assertNoForbiddenBundleMarkers(value: string, location: string) {
  const normalized = value.toLowerCase();
  const marker = forbiddenBundleMarkers.find((candidate) => normalized.includes(candidate.toLowerCase()));
  if (marker) throw new Error(`Store Lite Admin bundle contains forbidden marker ${marker} in ${location}.`);
}

function isValidDnsLabel(value: string) {
  return value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
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
