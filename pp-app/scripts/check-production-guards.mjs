import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const checks = [
  {
    file: 'src/services/apiClient.ts',
    includes: [
      'Production app builds require VITE_API_BASE_URL',
      'if (isProductionAppEnv) return false',
    ],
  },
  {
    file: 'src/services/scopedStorage.ts',
    includes: [
      'function canUseLocalStorageLayer',
      "return layer === 'local' || isMockFallbackAllowed()",
    ],
  },
  {
    file: 'src/app/AppDataProvider.tsx',
    includes: [
      'isMockFallbackAllowed() ? listSeedOrders() : []',
      '订单同步失败，请检查网络后重试。',
    ],
  },
  {
    file: 'src/services/virtualOrderLedger.ts',
    includes: [
      'Local order ledger is disabled when mock fallback is disabled.',
      'if (!isMockFallbackAllowed()) return []',
    ],
  },
];

const failures = [];

for (const check of checks) {
  const source = readFileSync(resolve(root, check.file), 'utf8');
  for (const expected of check.includes) {
    if (!source.includes(expected)) failures.push(`${check.file} missing: ${expected}`);
  }
}

if (failures.length) {
  console.error('Production guard check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production guard check passed.');
