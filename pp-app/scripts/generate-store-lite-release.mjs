import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORE_LITE_ASSET_MANIFEST,
  STORE_LITE_RELEASE_MARKER,
  createAssetManifest,
  createReleaseMarker,
  serializeJson,
  verifyStoreLiteRelease,
} from './store-lite-release-integrity.mjs';
import { resolveStoreLiteSourceState } from './store-lite-source-state.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedTarget = String(process.argv[2] || 'dist-store-lite').trim();
const dist = resolve(projectRoot, requestedTarget);

try {
  const assetManifestBytes = Buffer.from(serializeJson(createAssetManifest(dist)), 'utf8');
  writeFileSync(resolve(dist, STORE_LITE_ASSET_MANIFEST), assetManifestBytes);
  const source = resolveStoreLiteSourceState(projectRoot);
  const marker = createReleaseMarker(assetManifestBytes, source.revision, source.clean);
  writeFileSync(resolve(dist, STORE_LITE_RELEASE_MARKER), serializeJson(marker), 'utf8');
  const verified = verifyStoreLiteRelease(dist);
  console.log(`Store Lite release integrity generated (${verified.reachableFiles.length} runtime files, ${marker.releaseId}).`);
} catch (error) {
  console.error(`Store Lite release integrity generation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
