import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

if (!existsSync(viteCli)) {
  throw new Error('Store Lite Admin URL policy check requires installed frontend dependencies.');
}

const invalidCases = [
  ['missing', ' ', /require VITE_API_BASE_URL/i],
  ['insecure-http', 'http://api.weareinframe.com', /must use HTTPS/i],
  ['localhost', 'https://localhost', /multi-label public DNS hostname|reserved or private hostname suffix/i],
  ['ipv4', 'https://127.0.0.1', /not an IP address/i],
  ['ipv6', 'https://[::1]', /not an IP address/i],
  ['non-standard-port', 'https://api.weareinframe.com:8443', /standard HTTPS port 443/i],
  ['path', 'https://api.weareinframe.com/v1', /origin without a path/i],
  ['query', 'https://api.weareinframe.com?preview=1', /query string or fragment/i],
  ['fragment', 'https://api.weareinframe.com#preview', /query string or fragment/i],
  ['credentials', 'https://user:password@api.weareinframe.com', /must not contain credentials/i],
  ['trailing-dot', 'https://api.weareinframe.com.', /trailing dot/i],
  ['reserved-suffix', 'https://api.example.com', /reserved or private hostname suffix/i],
  ['unapproved-origin', 'https://api.evil.org', /approved Still API origin/i],
];

for (const [name, value, expectedMessage] of invalidCases) {
  const result = spawnSync(
    process.execPath,
    [viteCli, 'build', '--config', 'vite.store-lite-admin.config.ts', '--mode', 'production'],
    {
      cwd: projectDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        VITE_API_BASE_URL: value,
      },
      timeout: 30_000,
    },
  );
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.error) throw new Error(`Store Lite Admin URL policy case ${name} could not run: ${result.error.message}`);
  if (result.status === 0) throw new Error(`Store Lite Admin URL policy accepted invalid case: ${name}.`);
  if (!expectedMessage.test(output)) {
    throw new Error(`Store Lite Admin URL policy case ${name} failed without the expected reason.\n${output.slice(-2_000)}`);
  }
}

console.log(JSON.stringify({ ok: true, invalidCases: invalidCases.map(([name]) => name) }, null, 2));
