import { readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

export function buildReleaseManifest({ component, commitSha, buildTime, migrationVersion }) {
  if (!['admin', 'website'].includes(component)) throw new Error('Release component must be admin or website.');
  if (!/^[0-9a-f]{40}$/i.test(String(commitSha || ''))) throw new Error('Release commit SHA must contain 40 hexadecimal characters.');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(buildTime || ''))) throw new Error('Release build time must be an ISO timestamp.');
  if (!/^[0-9]{8}_[a-z0-9_]+\.sql$/i.test(String(migrationVersion || ''))) throw new Error('Release migration version is invalid.');

  return {
    component,
    commitSha: String(commitSha).toLowerCase(),
    buildTime,
    migrationVersion,
  };
}

if (resolve(process.argv[1] || '') === scriptPath) {
  const [component, outputPath] = process.argv.slice(2);
  if (!component || !outputPath) {
    throw new Error('Usage: node deploy/create-release-manifest.mjs <admin|website> <output-path>');
  }
  const migrations = (await readdir(resolve(repoRoot, 'database/migrations'))).filter((name) => name.endsWith('.sql')).sort();
  const manifest = buildReleaseManifest({
    component,
    commitSha: process.env.RELEASE_COMMIT_SHA || process.env.GITHUB_SHA,
    buildTime: process.env.RELEASE_BUILD_TIME || new Date().toISOString(),
    migrationVersion: migrations.at(-1),
  });
  const target = resolve(repoRoot, outputPath);
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
