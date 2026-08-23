import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { posix, relative, resolve, sep } from 'node:path';
import { assertStoreLiteHtmlPolicy } from './store-lite-html-policy.mjs';

export const STORE_LITE_PROFILE = 'store_lite';
export const STORE_LITE_ENTRY = 'index.html';
export const STORE_LITE_VITE_MANIFEST = 'store-lite-vite-manifest.json';
export const STORE_LITE_ASSET_MANIFEST = 'store-lite-assets.sha256.json';
export const STORE_LITE_RELEASE_MARKER = 'store-lite-release.json';

export function createAssetManifest(rootDirectory) {
  const root = resolve(rootDirectory);
  const viteManifest = readJson(resolve(root, STORE_LITE_VITE_MANIFEST), 'Store Lite Vite manifest');
  const reachable = collectReachableRuntimeFiles(root, viteManifest);
  assertRuntimeFileSet(root, reachable, []);

  return {
    schemaVersion: 1,
    profile: STORE_LITE_PROFILE,
    algorithm: 'sha256',
    files: [...reachable].sort().map((path) => {
      const bytes = readFileSync(safeResolve(root, path));
      return { path, size: bytes.length, sha256: sha256(bytes) };
    }),
  };
}

export function createReleaseMarker(assetManifestBytes, sourceRevision = 'unknown', sourceTreeClean = false) {
  const assetManifestSha256 = sha256(assetManifestBytes);
  return {
    schemaVersion: 2,
    profile: STORE_LITE_PROFILE,
    entrypoint: STORE_LITE_ENTRY,
    viteManifest: STORE_LITE_VITE_MANIFEST,
    assetManifest: STORE_LITE_ASSET_MANIFEST,
    assetManifestSha256,
    releaseId: `sha256:${assetManifestSha256}`,
    sourceRevision,
    sourceTreeClean,
  };
}

export function verifyStoreLiteRelease(rootDirectory, options = {}) {
  const root = resolve(rootDirectory);
  const markerPath = resolve(root, STORE_LITE_RELEASE_MARKER);
  const assetManifestPath = resolve(root, STORE_LITE_ASSET_MANIFEST);
  const marker = readJson(markerPath, 'Store Lite release marker');
  const assetManifestBytes = readFileRequired(assetManifestPath, 'Store Lite asset manifest');
  const assetManifest = parseJson(assetManifestBytes, 'Store Lite asset manifest');

  assertReleaseMarker(marker, assetManifestBytes);
  assertAssetManifestShape(assetManifest);

  const viteManifest = readJson(resolve(root, STORE_LITE_VITE_MANIFEST), 'Store Lite Vite manifest');
  const reachable = collectReachableRuntimeFiles(root, viteManifest);
  const declared = new Set(assetManifest.files.map((entry) => normalizeRelativePath(entry.path)));
  assertSameSet(declared, reachable, 'asset manifest', 'reachable runtime graph');
  assertRuntimeFileSet(root, reachable, options.allowedExtraPaths || []);

  for (const entry of assetManifest.files) {
    const path = normalizeRelativePath(entry.path);
    const bytes = readFileRequired(safeResolve(root, path), `declared asset ${path}`);
    if (bytes.length !== entry.size) throw new Error(`Store Lite asset size mismatch: ${path}.`);
    if (sha256(bytes) !== entry.sha256) throw new Error(`Store Lite asset SHA256 mismatch: ${path}.`);
  }

  return {
    root,
    marker,
    assetManifest,
    viteManifest,
    reachableFiles: [...reachable].sort(),
    markerBytes: readFileSync(markerPath),
    assetManifestBytes,
  };
}

export function collectReachableRuntimeFiles(rootDirectory, viteManifest) {
  const root = resolve(rootDirectory);
  if (!viteManifest || typeof viteManifest !== 'object' || Array.isArray(viteManifest)) {
    throw new Error('Store Lite Vite manifest must be an object.');
  }

  const entries = Object.entries(viteManifest).filter(([, entry]) => entry?.isEntry === true);
  if (entries.length !== 1) throw new Error(`Store Lite Vite manifest must contain exactly one entry, found ${entries.length}.`);

  const reachable = new Set([STORE_LITE_ENTRY, STORE_LITE_VITE_MANIFEST]);
  const visitedManifestKeys = new Set();
  const visitManifestEntry = (key) => {
    if (visitedManifestKeys.has(key)) return;
    const entry = viteManifest[key];
    if (!entry || typeof entry !== 'object') throw new Error(`Store Lite manifest references missing entry: ${key}.`);
    visitedManifestKeys.add(key);
    addManifestFiles(reachable, entry);
    for (const dependency of [...asStringArray(entry.imports), ...asStringArray(entry.dynamicImports)]) {
      visitManifestEntry(dependency);
    }
  };
  visitManifestEntry(entries[0][0]);

  const html = readFileRequired(resolve(root, STORE_LITE_ENTRY), 'Store Lite index').toString('utf8');
  assertStoreLiteHtmlPolicy(html, `/${normalizeRelativePath(entries[0][1].file)}`);
  for (const reference of extractHtmlAssetReferences(html)) addLocalReference(reachable, STORE_LITE_ENTRY, reference);

  let previousSize = -1;
  while (previousSize !== reachable.size) {
    previousSize = reachable.size;
    for (const file of [...reachable]) {
      if (!file.endsWith('.css')) continue;
      const css = readFileRequired(safeResolve(root, file), `reachable stylesheet ${file}`).toString('utf8');
      for (const reference of extractCssAssetReferences(css)) addLocalReference(reachable, file, reference);
    }
  }

  for (const path of reachable) readFileRequired(safeResolve(root, path), `reachable asset ${path}`);
  return reachable;
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function readJson(path, label) {
  return parseJson(readFileRequired(path, label), label);
}

export function listFiles(rootDirectory) {
  const root = resolve(rootDirectory);
  if (!existsSync(root)) return [];
  const files = [];
  walk(root);
  return files.sort();

  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = resolve(directory, name);
      const info = lstatSync(absolute);
      if (info.isSymbolicLink()) throw new Error(`Store Lite release directories must not contain symbolic links: ${absolute}.`);
      if (info.isDirectory()) walk(absolute);
      else if (info.isFile()) files.push(toRelativePath(root, absolute));
    }
  }
}

function assertReleaseMarker(marker, assetManifestBytes) {
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) throw new Error('Store Lite release marker must be an object.');
  if (marker.schemaVersion !== 2 || marker.profile !== STORE_LITE_PROFILE) throw new Error('Store Lite release marker profile is invalid.');
  if (marker.entrypoint !== STORE_LITE_ENTRY || marker.viteManifest !== STORE_LITE_VITE_MANIFEST) {
    throw new Error('Store Lite release marker entry metadata is invalid.');
  }
  if (marker.assetManifest !== STORE_LITE_ASSET_MANIFEST) throw new Error('Store Lite release marker asset manifest name is invalid.');
  const digest = sha256(assetManifestBytes);
  if (marker.assetManifestSha256 !== digest || marker.releaseId !== `sha256:${digest}`) {
    throw new Error('Store Lite release marker does not match the asset manifest SHA256.');
  }
  if (typeof marker.sourceRevision !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(marker.sourceRevision)) {
    throw new Error('Store Lite release marker source revision must be a full Git commit SHA.');
  }
  if (typeof marker.sourceTreeClean !== 'boolean') {
    throw new Error('Store Lite release marker source tree state is invalid.');
  }
}

function assertAssetManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Store Lite asset manifest must be an object.');
  if (manifest.schemaVersion !== 1 || manifest.profile !== STORE_LITE_PROFILE || manifest.algorithm !== 'sha256') {
    throw new Error('Store Lite asset manifest metadata is invalid.');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Store Lite asset manifest must list runtime files.');
  const paths = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object') throw new Error('Store Lite asset manifest contains an invalid entry.');
    const path = normalizeRelativePath(entry.path);
    if (paths.has(path)) throw new Error(`Store Lite asset manifest contains a duplicate path: ${path}.`);
    paths.add(path);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error(`Store Lite asset manifest has an invalid size: ${path}.`);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Store Lite asset manifest has an invalid SHA256: ${path}.`);
  }
}

function assertRuntimeFileSet(root, reachable, allowedExtraPaths) {
  const ignored = new Set([STORE_LITE_ASSET_MANIFEST, STORE_LITE_RELEASE_MARKER]);
  const allowedExtra = new Set(allowedExtraPaths.map(normalizeRelativePath));
  const actual = new Set(listFiles(root).filter((path) => !ignored.has(path) && !allowedExtra.has(path)));
  assertSameSet(actual, reachable, 'release directory', 'reachable runtime graph');
}

function assertSameSet(actual, expected, actualLabel, expectedLabel) {
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  if (!missing.length && !unexpected.length) return;
  const details = [];
  if (missing.length) details.push(`missing from ${actualLabel}: ${missing.join(', ')}`);
  if (unexpected.length) details.push(`unexpected in ${actualLabel}: ${unexpected.join(', ')}`);
  throw new Error(`Store Lite ${actualLabel} does not match ${expectedLabel} (${details.join('; ')}).`);
}

function addManifestFiles(reachable, entry) {
  if (typeof entry.file !== 'string' || !entry.file) throw new Error('Store Lite manifest entry is missing its output file.');
  reachable.add(normalizeRelativePath(entry.file));
  for (const path of [...asStringArray(entry.css), ...asStringArray(entry.assets)]) {
    reachable.add(normalizeRelativePath(path));
  }
}

function asStringArray(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error('Store Lite Vite manifest contains an invalid reference list.');
  }
  return value;
}

function extractHtmlAssetReferences(html) {
  const references = [];
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) references.push(match[2]);
  return references;
}

function extractCssAssetReferences(css) {
  const references = [];
  for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) references.push(match[2]);
  return references;
}

function addLocalReference(reachable, fromPath, reference) {
  const value = String(reference || '').trim();
  if (!value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return;
  const withoutQuery = value.split(/[?#]/, 1)[0];
  if (!withoutQuery) return;
  const joined = withoutQuery.startsWith('/') ? withoutQuery.slice(1) : posix.join(posix.dirname(fromPath), withoutQuery);
  reachable.add(normalizeRelativePath(joined));
}

function normalizeRelativePath(value) {
  if (typeof value !== 'string' || !value) throw new Error('Store Lite release path must be a non-empty string.');
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-z]:\//i.test(normalized) || normalized.includes('\0')) {
    throw new Error(`Store Lite release path must be relative: ${value}.`);
  }
  const clean = posix.normalize(normalized);
  if (clean === '.' || clean === '..' || clean.startsWith('../')) throw new Error(`Store Lite release path escapes its root: ${value}.`);
  return clean;
}

function safeResolve(root, relativePath) {
  const clean = normalizeRelativePath(relativePath);
  const absolute = resolve(root, ...clean.split('/'));
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (absolute !== root && !absolute.startsWith(prefix)) throw new Error(`Store Lite release path escapes its root: ${relativePath}.`);
  return absolute;
}

function toRelativePath(root, absolute) {
  return normalizeRelativePath(relative(root, absolute).replace(/\\/g, '/'));
}

function readFileRequired(path, label) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${label} is missing or unreadable.`);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}
