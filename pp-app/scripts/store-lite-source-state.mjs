import { spawnSync } from 'node:child_process';

export const STORE_LITE_RELEASE_SOURCE_PATHS = [
  'package.json',
  'package-lock.json',
  'capacitor.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.store-lite.config.ts',
  'store-lite-entry',
  'src/storeLiteMain.tsx',
  'src/store-lite',
  'src/styles/index.css',
  'src/types/api.ts',
  'scripts/check-store-lite-bundle.mjs',
  'scripts/check-store-lite-html-policy.mjs',
  'scripts/check-store-lite-native-integrity.mjs',
  'scripts/check-store-lite-native.mjs',
  'scripts/check-store-lite-release-integrity.mjs',
  'scripts/check-store-lite-url-policy.mjs',
  'scripts/generate-store-lite-release.mjs',
  'scripts/run-capacitor-store-lite.mjs',
  'scripts/store-lite-html-policy.mjs',
  'scripts/store-lite-release-integrity.mjs',
  'scripts/store-lite-source-state.mjs',
  'scripts/store-lite-url-policy.mjs',
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/App/Info.plist',
  'ios/App/CapApp-SPM/Package.swift',
];

export function resolveStoreLiteSourceState(projectRoot) {
  const head = runGit(projectRoot, ['rev-parse', 'HEAD'], 'resolve the current Store Lite source revision');
  const revision = String(head.stdout || '').trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
    throw new Error('Store Lite source revision must be a full Git commit SHA.');
  }

  for (const [name, rawValue] of [
    ['STORE_LITE_BUILD_SHA', process.env.STORE_LITE_BUILD_SHA],
    ['GITHUB_SHA', process.env.GITHUB_SHA],
  ]) {
    const value = String(rawValue || '').trim().toLowerCase();
    if (!value) continue;
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)) {
      throw new Error(`${name} must be a full Git commit SHA when provided.`);
    }
    if (value !== revision) {
      throw new Error(`${name} does not match the checked-out Store Lite source revision.`);
    }
  }

  const status = runGit(
    projectRoot,
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...STORE_LITE_RELEASE_SOURCE_PATHS],
    'inspect the Store Lite release source tree',
  );
  return {
    revision,
    clean: String(status.stdout || '').trim() === '',
  };
}

function runGit(cwd, args, action) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim();
    throw new Error(`Unable to ${action}${detail ? `: ${detail}` : '.'}`);
  }
  return result;
}
