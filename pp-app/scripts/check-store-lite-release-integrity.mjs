import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  STORE_LITE_RELEASE_MARKER,
  serializeJson,
  verifyStoreLiteRelease,
} from './store-lite-release-integrity.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const dist = resolve(projectRoot, 'dist-store-lite');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'pp-store-lite-integrity-'));
const failures = [];
let caseIndex = 0;

try {
  const canonical = verifyStoreLiteRelease(dist);
  const javascriptAsset = canonical.reachableFiles.find((path) => path.endsWith('.js'));
  if (!javascriptAsset) throw new Error('Store Lite release has no JavaScript asset to test.');

  expectRejected('orphan runtime file', (copy) => {
    writeFileSync(resolve(copy, 'orphan.js'), 'console.log("orphan")\n', 'utf8');
  });
  expectRejected('modified declared asset', (copy) => {
    appendFileSync(resolve(copy, ...javascriptAsset.split('/')), '\n// tampered\n', 'utf8');
  });
  expectRejected('modified release marker', (copy) => {
    const markerPath = resolve(copy, STORE_LITE_RELEASE_MARKER);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    marker.profile = 'commercial';
    writeFileSync(markerPath, serializeJson(marker), 'utf8');
  });
  expectRejected('invalid source tree state', (copy) => {
    const markerPath = resolve(copy, STORE_LITE_RELEASE_MARKER);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    marker.sourceTreeClean = 'yes';
    writeFileSync(markerPath, serializeJson(marker), 'utf8');
  });

  if (failures.length) {
    console.error('Store Lite release integrity self-test failed.');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('Store Lite release integrity self-test passed (canonical + 4 tamper cases).');
  }
} catch (error) {
  console.error(`Store Lite release integrity self-test failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const expectedPrefix = `pp-store-lite-integrity-`;
  const safeParent = `${resolve(tmpdir())}${sep}`;
  if (tempRoot.startsWith(safeParent) && basename(tempRoot).startsWith(expectedPrefix)) {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.error('Store Lite integrity self-test refused to clean an unexpected path.');
    process.exitCode = 1;
  }
}

function expectRejected(name, mutate) {
  const target = resolve(tempRoot, `case-${caseIndex}-${name.replace(/[^a-z]+/gi, '-')}`);
  caseIndex += 1;
  cpSync(dist, target, { recursive: true });
  mutate(target);
  try {
    verifyStoreLiteRelease(target);
    failures.push(`${name} was accepted.`);
  } catch {
    // Expected: integrity verification must fail closed.
  }
}
