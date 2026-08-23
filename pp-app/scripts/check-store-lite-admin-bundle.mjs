import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outputDirectory = fileURLToPath(new URL('../dist-store-lite-admin/', import.meta.url));
const indexPath = fileURLToPath(new URL('../dist-store-lite-admin/index.html', import.meta.url));
const manifestPath = fileURLToPath(new URL('../dist-store-lite-admin/store-lite-admin-vite-manifest.json', import.meta.url));

if (!existsSync(indexPath) || !existsSync(manifestPath)) {
  throw new Error('Store Lite Admin bundle check requires a completed dist-store-lite-admin build.');
}

const html = readFileSync(indexPath, 'utf8');
const scriptSource = assertBuiltHtml(html);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = Object.values(manifest).filter((entry) => entry?.isEntry);
if (entries.length !== 1 || entries[0]?.src !== 'index.html') {
  throw new Error('Store Lite Admin manifest must contain exactly one index.html entry.');
}
if (`/${entries[0].file}` !== scriptSource) {
  throw new Error('Store Lite Admin HTML script and manifest entry do not match.');
}

const files = listFiles(outputDirectory);
if (files.some((path) => path.endsWith('.map'))) throw new Error('Store Lite Admin bundle must not contain source maps.');
if (files.some((path) => !/^(?:index\.html|store-lite-admin-vite-manifest\.json|assets\/[a-z0-9._-]+\.(?:js|css))$/i.test(path))) {
  throw new Error('Store Lite Admin bundle contains a file outside the production allowlist.');
}

const forbiddenMarkers = ['AdminDashboard', 'AppDataProvider', 'storeLiteMain', '/api/payments', '/api/chat', '/api/uploads'];
for (const relativePath of files.filter((path) => /\.(?:html|js|css|json)$/i.test(path))) {
  const content = readFileSync(`${outputDirectory}/${relativePath}`, 'utf8');
  const marker = forbiddenMarkers.find((value) => content.toLowerCase().includes(value.toLowerCase()));
  if (marker) throw new Error(`Store Lite Admin bundle contains forbidden marker ${marker} in ${relativePath}.`);
}

console.log(JSON.stringify({ ok: true, files, entry: scriptSource }, null, 2));

function assertBuiltHtml(source) {
  if (/<base\b/i.test(source)) throw new Error('Store Lite Admin built HTML must not contain a base element.');
  if (/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)/i.test(source) || /\bhttp:/i.test(source)) {
    throw new Error('Store Lite Admin built HTML contains an insecure or loopback endpoint.');
  }
  const policies = [...source.matchAll(
    /<meta\b[^>]*http-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*content\s*=\s*(["'])([\s\S]*?)\2[^>]*>/gi,
  )];
  if (policies.length !== 1 || !/\bconnect-src\s+'self'\s+https:\s*;/i.test(policies[0][3])) {
    throw new Error("Store Lite Admin built CSP must restrict connect-src to 'self' and HTTPS.");
  }

  const openMarkers = [...source.matchAll(/<script\b/gi)];
  const openTags = [...source.matchAll(/<script\b[^>]*>/gi)];
  const closingTags = [...source.matchAll(/<\/script\s*>/gi)];
  if (openMarkers.length !== 1 || openTags.length !== 1 || closingTags.length !== 1) {
    throw new Error('Store Lite Admin built HTML must contain exactly one script element.');
  }
  const tag = openTags[0][0];
  if (!/\btype\s*=\s*(["'])module\1/i.test(tag)) throw new Error('Store Lite Admin built script must use quoted type="module".');
  const sourceMatch = tag.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i);
  if (!sourceMatch || !/^\/assets\/[a-z0-9._-]+\.js$/i.test(sourceMatch[2])) {
    throw new Error('Store Lite Admin built script must use one quoted local /assets/*.js source.');
  }
  const openEnd = (openTags[0].index ?? 0) + tag.length;
  const closingStart = closingTags[0].index ?? -1;
  if (closingStart < openEnd || source.slice(openEnd, closingStart).trim()) {
    throw new Error('Store Lite Admin built HTML must not contain inline script content.');
  }
  return sourceMatch[2];
}

function listFiles(directory, prefix = '') {
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolutePath = `${directory}/${name}`;
    const relativePath = `${prefix}${name}`.replaceAll('\\', '/');
    if (statSync(absolutePath).isDirectory()) files.push(...listFiles(absolutePath, `${relativePath}/`));
    else files.push(relativePath);
  }
  return files.sort();
}
