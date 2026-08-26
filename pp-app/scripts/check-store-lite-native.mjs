import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STORE_LITE_PROFILE,
  listFiles,
  serializeJson,
  sha256,
  verifyStoreLiteRelease,
} from './store-lite-release-integrity.mjs';
import { resolveStoreLiteSourceState } from './store-lite-source-state.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = parseArguments(process.argv.slice(2));
const iosRoot = resolve(projectRoot, 'ios', 'App');
const sourcePublic = resolve(options.source || resolve(iosRoot, 'App', 'public'));
const dist = resolve(options.dist || resolve(projectRoot, 'dist-store-lite'));
const builtPublic = options.built ? resolve(options.built) : null;
const NATIVE_SEAL_FILE = 'store-lite-native.sha256.json';
const CAPACITOR_RUNTIME_FILES = [
  'capacitor.js',
  'capacitor.js.map',
  'cordova.js',
  'cordova_plugins.js',
];

try {
  if (!existsSync(iosRoot)) {
    if (options.requireIos) throw new Error('Store Lite iOS project is missing.');
    console.log('Store Lite native guard skipped: ios/App is not present.');
    process.exit(0);
  }

  verifyInfoPlist(resolve(iosRoot, 'App', 'Info.plist'));
  verifySwiftPackage(resolve(iosRoot, 'CapApp-SPM', 'Package.swift'));
  verifyXcodeProject(resolve(iosRoot, 'App.xcodeproj', 'project.pbxproj'));
  verifyCapacitorConfig(resolve(projectRoot, 'capacitor.config.ts'));
  verifyCapacitorVersions();

  if (!existsSync(sourcePublic)) {
    if (options.requireIos) throw new Error('Store Lite native public directory is missing; run ios:sync:store-lite first.');
    console.log('Store Lite native policy passed; integrity comparison skipped because native public is not synced.');
    process.exit(0);
  }

  const webRelease = verifyStoreLiteRelease(dist);
  verifySourceRevision(webRelease.marker);
  const allowedNativeExtras = [...CAPACITOR_RUNTIME_FILES, NATIVE_SEAL_FILE];
  const nativeRelease = verifyStoreLiteRelease(sourcePublic, { allowedExtraPaths: allowedNativeExtras });
  assertSameRelease(webRelease, nativeRelease, 'native source public');
  if (options.sealNative) writeNativeSeal(sourcePublic, webRelease.marker.releaseId);
  const nativeSeal = verifyNativeSeal(sourcePublic, webRelease.marker.releaseId);

  if (builtPublic) {
    if (!existsSync(builtPublic)) throw new Error('Store Lite built app public directory is missing.');
    const builtRelease = verifyStoreLiteRelease(builtPublic, { allowedExtraPaths: allowedNativeExtras });
    assertSameRelease(webRelease, builtRelease, 'built app public');
    const builtSeal = verifyNativeSeal(builtPublic, webRelease.marker.releaseId);
    if (!nativeSeal.equals(builtSeal)) throw new Error('Store Lite built app native seal differs from native source public.');
  }

  console.log(`Store Lite native guard passed (${webRelease.marker.releaseId}${options.sealNative ? ', native sealed' : ''}${builtPublic ? ', built app verified' : ''}).`);
} catch (error) {
  console.error(`Store Lite native guard failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function parseArguments(args) {
  const result = { requireIos: false, sealNative: false, source: '', dist: '', built: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--require-ios') result.requireIos = true;
    else if (arg === '--if-present') result.requireIos = false;
    else if (arg === '--seal-native') result.sealNative = true;
    else if (['--source', '--dist', '--built'].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path.`);
      result[arg.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown Store Lite native guard option: ${arg}.`);
    }
  }
  if (result.sealNative && result.built) throw new Error('--seal-native cannot be combined with --built.');
  return result;
}

function writeNativeSeal(directory, releaseId) {
  const runtimeFiles = listFiles(directory).filter((path) => CAPACITOR_RUNTIME_FILES.includes(path));
  const seal = {
    schemaVersion: 1,
    profile: STORE_LITE_PROFILE,
    releaseId,
    algorithm: 'sha256',
    files: runtimeFiles.map((path) => {
      const bytes = readFileSync(resolve(directory, ...path.split('/')));
      return { path, size: bytes.length, sha256: sha256(bytes) };
    }),
  };
  writeFileSync(resolve(directory, NATIVE_SEAL_FILE), serializeJson(seal), 'utf8');
}

function verifyNativeSeal(directory, releaseId) {
  const sealPath = resolve(directory, NATIVE_SEAL_FILE);
  const bytes = readRequiredBytes(sealPath, 'Store Lite native seal');
  let seal;
  try {
    seal = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Store Lite native seal is not valid JSON.');
  }
  if (
    seal?.schemaVersion !== 1
    || seal.profile !== STORE_LITE_PROFILE
    || seal.releaseId !== releaseId
    || seal.algorithm !== 'sha256'
    || !Array.isArray(seal.files)
  ) {
    throw new Error('Store Lite native seal metadata is invalid.');
  }

  const actualRuntimeFiles = listFiles(directory).filter((path) => CAPACITOR_RUNTIME_FILES.includes(path));
  const declaredPaths = [];
  for (const entry of seal.files) {
    if (!entry || typeof entry !== 'object' || !CAPACITOR_RUNTIME_FILES.includes(entry.path)) {
      throw new Error('Store Lite native seal contains an unapproved runtime file.');
    }
    if (declaredPaths.includes(entry.path)) throw new Error(`Store Lite native seal contains a duplicate path: ${entry.path}.`);
    declaredPaths.push(entry.path);
    const runtimeBytes = readRequiredBytes(resolve(directory, ...entry.path.split('/')), `native runtime ${entry.path}`);
    if (!Number.isSafeInteger(entry.size) || entry.size !== runtimeBytes.length || entry.sha256 !== sha256(runtimeBytes)) {
      throw new Error(`Store Lite native runtime integrity mismatch: ${entry.path}.`);
    }
  }
  if (declaredPaths.sort().join(',') !== actualRuntimeFiles.sort().join(',')) {
    throw new Error('Store Lite native seal does not cover every generated runtime file.');
  }
  return bytes;
}

function verifyInfoPlist(path) {
  const source = readRequiredText(path, 'Info.plist');
  const forbiddenKeys = [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSPhotoLibraryAddUsageDescription',
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
    'NSLocationAlwaysUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSUserTrackingUsageDescription',
    'NSContactsUsageDescription',
    'NSSpeechRecognitionUsageDescription',
  ];
  for (const key of forbiddenKeys) {
    if (new RegExp(`<key>\\s*${key}\\s*</key>`).test(source)) throw new Error(`Info.plist contains forbidden Store Lite permission: ${key}.`);
  }
}

function verifySwiftPackage(path) {
  const source = readRequiredText(path, 'CapApp-SPM/Package.swift');
  const packageCalls = [...source.matchAll(/\.package\s*\(/g)];
  const packageUrls = [...source.matchAll(/\.package\s*\(\s*url:\s*"([^"]+)"/g)].map((match) => match[1]);
  const products = [...source.matchAll(/\.product\s*\(\s*name:\s*"([^"]+)"/g)].map((match) => match[1]).sort();
  const exactVersions = [...source.matchAll(/\bexact:\s*"([^"]+)"/g)].map((match) => match[1]);
  if (
    packageCalls.length !== 1
    || packageUrls.length !== 1
    || packageUrls[0] !== 'https://github.com/ionic-team/capacitor-swift-pm.git'
    || exactVersions.length !== 1
    || exactVersions[0] !== '8.4.1'
    || products.join(',') !== 'Capacitor,Cordova'
  ) {
    throw new Error('CapApp-SPM must contain only Capacitor/Cordova 8.4.1.');
  }
}

function verifyXcodeProject(path) {
  const source = readRequiredText(path, 'App.xcodeproj/project.pbxproj');
  const phaseId = 'A19F4C0A2E72D00100A11CE1';
  const requiredPhaseFragments = [
    'alwaysOutOfDate = 1;',
    'name = "Verify Store Lite Release";',
    'showEnvVarsInLog = 0;',
    'if [ \\"$CONFIGURATION\\" != \\"Release\\" ]; then exit 0; fi',
    'command -v node || true',
    'check-store-lite-bundle.mjs',
    'check-store-lite-native.mjs',
    '--require-ios',
    '--built',
  ];
  const phaseMatch = source.match(new RegExp(`${phaseId} /\\* Verify Store Lite Release \\*/ = \\{([\\s\\S]*?)\\n\\t\\t\\};`));
  if (!phaseMatch) throw new Error('Xcode project is missing the Store Lite release shell phase.');
  if ((source.match(/isa = PBXShellScriptBuildPhase;/g) || []).length !== 1) {
    throw new Error('Xcode project must contain only the approved Store Lite shell build phase.');
  }
  for (const value of requiredPhaseFragments) {
    if (!phaseMatch[1].includes(value)) throw new Error(`Xcode Store Lite release phase is missing: ${value}`);
  }
  const targetMatch = source.match(/504EC3031FED79650016851F \/\* App \*\/ = \{([\s\S]*?)\n\t\t\};/);
  const buildPhasesMatch = targetMatch?.[1].match(/buildPhases = \(([\s\S]*?)\n\t\t\t\);/);
  const phaseIds = buildPhasesMatch
    ? [...buildPhasesMatch[1].matchAll(/\b([A-F0-9]{24}) \/\*[^*]+\*\//g)].map((match) => match[1])
    : [];
  const expectedPhases = [
    '504EC3001FED79650016851F',
    '504EC3011FED79650016851F',
    '504EC3021FED79650016851F',
    phaseId,
  ];
  if (phaseIds.join(',') !== expectedPhases.join(',')) {
    throw new Error('Xcode App target build phases must end with the Store Lite verifier after Sources, Frameworks, and Resources.');
  }

  const targetReleaseMatch = source.match(/504EC3181FED79650016851F \/\* Release \*\/ = \{([\s\S]*?)\n\t\t\};/);
  const targetDebugMatch = source.match(/504EC3171FED79650016851F \/\* Debug \*\/ = \{([\s\S]*?)\n\t\t\};/);
  if (!targetReleaseMatch?.[1].includes('STILL_RELEASE_PROFILE = store_lite;')) {
    throw new Error('Xcode target Release configuration is missing STILL_RELEASE_PROFILE=store_lite.');
  }
  if (targetDebugMatch?.[1].includes('STILL_RELEASE_PROFILE')) {
    throw new Error('Xcode target Debug configuration must not claim the Store Lite release profile.');
  }
}

function verifyCapacitorConfig(path) {
  const source = readRequiredText(path, 'capacitor.config.ts');
  for (const value of [
    "const storeLiteRelease = releaseProfile === 'store_lite'",
    "process.env.STORE_LITE_CAPACITOR_WRAPPER !== 'store-lite-wrapper-v1'",
    "webDir: storeLiteRelease ? 'dist-store-lite' : 'dist'",
    'storeLiteRelease ? { includePlugins: [] } : {}',
  ]) {
    if (!source.includes(value)) throw new Error(`Capacitor config is missing Store Lite lock: ${value}.`);
  }
}

function verifyCapacitorVersions() {
  const packageJson = parseRequiredJson(resolve(projectRoot, 'package.json'), 'package.json');
  const packageLock = parseRequiredJson(resolve(projectRoot, 'package-lock.json'), 'package-lock.json');
  const expected = '8.4.1';
  const values = [
    packageJson.dependencies?.['@capacitor/core'],
    packageJson.devDependencies?.['@capacitor/cli'],
    packageJson.devDependencies?.['@capacitor/ios'],
    packageLock.packages?.['']?.dependencies?.['@capacitor/core'],
    packageLock.packages?.['']?.devDependencies?.['@capacitor/cli'],
    packageLock.packages?.['']?.devDependencies?.['@capacitor/ios'],
    packageLock.packages?.['node_modules/@capacitor/core']?.version,
    packageLock.packages?.['node_modules/@capacitor/cli']?.version,
    packageLock.packages?.['node_modules/@capacitor/ios']?.version,
  ];
  if (values.some((value) => value !== expected)) throw new Error('Capacitor core/CLI/iOS must all be pinned to 8.4.1.');
}

function verifySourceRevision(marker) {
  const source = resolveStoreLiteSourceState(projectRoot);
  if (marker.sourceRevision !== source.revision) {
    throw new Error('Store Lite release marker source revision does not match the current build revision.');
  }
  if (marker.sourceTreeClean !== true || !source.clean) {
    throw new Error('Store Lite iOS Release requires a clean, committed Store Lite source tree and a freshly rebuilt bundle.');
  }
}

function assertSameRelease(expected, actual, label) {
  if (!expected.markerBytes.equals(actual.markerBytes)) throw new Error(`Store Lite ${label} release marker differs from dist-store-lite.`);
  if (!expected.assetManifestBytes.equals(actual.assetManifestBytes)) throw new Error(`Store Lite ${label} asset manifest differs from dist-store-lite.`);
}

function readRequiredText(path, label) {
  return readRequiredBytes(path, label).toString('utf8');
}

function parseRequiredJson(path, label) {
  try {
    return JSON.parse(readRequiredText(path, label));
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('is missing or unreadable.')) throw error;
    throw new Error(`${label} is not valid JSON.`);
  }
}

function readRequiredBytes(path, label) {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${label} is missing or unreadable.`);
  }
}
