import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checker = resolve(projectRoot, 'scripts', 'check-store-lite-native.mjs');
const dist = resolve(projectRoot, 'dist-store-lite');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'pp-store-lite-native-'));
const source = resolve(tempRoot, 'source-public');
const built = resolve(tempRoot, 'built-public');

try {
  cpSync(dist, source, { recursive: true });
  writeFileSync(resolve(source, 'capacitor.js'), 'globalThis.Capacitor = globalThis.Capacitor || {};\n', 'utf8');

  runExpectedSuccess(['--require-ios', '--dist', dist, '--source', source, '--seal-native'], 'native seal creation');
  cpSync(source, built, { recursive: true });
  runExpectedSuccess(['--require-ios', '--dist', dist, '--source', source, '--built', built], 'source/built comparison');

  appendFileSync(resolve(built, 'capacitor.js'), '// tampered after copy\n', 'utf8');
  runExpectedFailure(['--require-ios', '--dist', dist, '--source', source, '--built', built], 'tampered built runtime');
  console.log('Store Lite native integrity self-test passed (seal + built copy + tamper rejection).');
} catch (error) {
  console.error(`Store Lite native integrity self-test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const safeParent = `${resolve(tmpdir())}${sep}`;
  if (tempRoot.startsWith(safeParent) && basename(tempRoot).startsWith('pp-store-lite-native-')) {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.error('Store Lite native integrity self-test refused to clean an unexpected path.');
    process.exitCode = 1;
  }
}
function runExpectedSuccess(args, label) {
  const result = runChecker(args);
  if (result.status !== 0) throw new Error(`${label} failed: ${cleanOutput(result)}`);
}

function runExpectedFailure(args, label) {
  const result = runChecker(args);
  if (result.status === 0) throw new Error(`${label} was unexpectedly accepted.`);
}

function runChecker(args) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
}

function cleanOutput(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim().replace(/\s+/g, ' ').slice(0, 500) || 'no output';
}
