import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowedCommands = new Set(['add ios', 'open ios', 'sync ios']);
const command = args.join(' ');

if (!allowedCommands.has(command)) {
  console.error(`Store Lite Capacitor wrapper rejected command: ${command || '(empty)'}.`);
  process.exit(1);
}
if (process.env.CAPACITOR_RELEASE_PROFILE && process.env.CAPACITOR_RELEASE_PROFILE !== 'store_lite') {
  console.error('Store Lite Capacitor wrapper rejected a conflicting CAPACITOR_RELEASE_PROFILE.');
  process.exit(1);
}

const packagePath = resolve(projectRoot, 'node_modules', '@capacitor', 'cli', 'package.json');
if (!existsSync(packagePath)) {
  console.error('Local @capacitor/cli is missing. Run npm install before the Store Lite iOS wrapper.');
  process.exit(1);
}

let packageJson;
try {
  packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
} catch {
  console.error('Local @capacitor/cli package metadata is unreadable.');
  process.exit(1);
}
const binValue = typeof packageJson.bin === 'string'
  ? packageJson.bin
  : packageJson.bin?.cap || packageJson.bin?.capacitor;
if (typeof binValue !== 'string' || !binValue) {
  console.error('Local @capacitor/cli does not expose the expected cap executable.');
  process.exit(1);
}
const cliPath = resolve(dirname(packagePath), binValue);
if (!existsSync(cliPath)) {
  console.error('Local @capacitor/cli executable is missing.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliPath, ...args], {
  cwd: projectRoot,
  env: {
    ...process.env,
    CAPACITOR_RELEASE_PROFILE: 'store_lite',
    STORE_LITE_CAPACITOR_WRAPPER: 'store-lite-wrapper-v1',
  },
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});

if (result.error) {
  console.error(`Store Lite Capacitor wrapper failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === 0 ? 0 : result.status || 1);
