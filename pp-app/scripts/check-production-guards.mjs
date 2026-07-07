import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
  {
    file: 'src/services/paymentService.ts',
    includes: [
      "const mockPaymentSuccessSuffix = import.meta.env.PROD ? '' : '/mock-success'",
      "if (payment.mode === 'mock' && !isMockFallbackAllowed())",
      "if (payment.mode !== 'mock' && !isMockFallbackAllowed())",
      'return fetchPaymentStatus(payment.paymentId)',
    ],
  },
  {
    file: 'src/services/mediaService.ts',
    includes: [
      "if (policy?.mode === 'production') throw new Error",
      'if (!isMockFallbackAllowed()) throw new Error',
      "return getApiFallback(await readFileAsDataUrl(file), 'Media upload')",
      'await wxUploadFile(policy.uploadUrl, filePath, { key: policy.objectKey })',
    ],
  },
  {
    file: 'src/services/messageService.ts',
    includes: [
      'export async function sendImageMessage',
      'if (!isMockFallbackAllowed()) {',
      "throw new Error('",
      'return getApiFallback({',
      "if (!isMockFallbackAllowed()) return;",
      'if (!isMockFallbackAllowed()) return {};',
    ],
  },
  {
    file: 'src/services/companionBookingSettingsService.ts',
    includes: [
      'function canUseSharedBookingStorage',
      'return isMockFallbackAllowed()',
      'if (!canUseSharedBookingStorage()',
    ],
  },
  {
    file: 'src/services/companionPackageService.ts',
    includes: [
      'function canUseSharedPackageStorage',
      'return isMockFallbackAllowed()',
      'if (!canUseSharedPackageStorage()',
    ],
  },
  {
    file: 'src/services/companionProfileService.ts',
    includes: [
      'function canUseSharedProfileStorage',
      'return isMockFallbackAllowed()',
      'if (!canUseSharedProfileStorage()',
    ],
  },
  {
    file: 'src/services/userCollectionService.ts',
    includes: [
      'if (!isMockFallbackAllowed()) return emptyCollections()',
      'if (!isMockFallbackAllowed()) return []',
      'function emptyCollections',
    ],
  },
  {
    file: 'src/services/consultationService.ts',
    includes: [
      'function assertLocalConsultationAllowed',
      'if (!isMockFallbackAllowed()) throw new Error',
      'if (!isMockFallbackAllowed()) return []',
      'if (!isMockFallbackAllowed()) return null',
    ],
  },
  {
    file: 'src/services/orderWorkService.ts',
    includes: [
      'function assertLocalOrderWorkAllowed',
      'if (!isMockFallbackAllowed()) throw new Error',
      'if (!isMockFallbackAllowed()) return []',
    ],
  },
  {
    file: 'src/services/authService.ts',
    includes: [
      "if (!isTestRoleSwitchAllowed()) return Boolean(getApiAuthToken('public'))",
      "if (!isTestRoleSwitchAllowed()) return Boolean(getApiAuthToken('admin'))",
      "if (!isTestRoleSwitchAllowed()) throw new Error('登录状态获取失败，请重新登录。')",
      "ensureTestAuthAllowed('验证码登录')",
      "ensureTestAuthAllowed('本地手机号注册')",
      "ensureTestAuthAllowed('本地验证码登录')",
      "ensureTestAuthAllowed('本地管理员登录')",
    ],
  },
  {
    file: 'src/features/auth/AuthPages.tsx',
    includes: [
      'const showTestCode = isTestRoleSwitchAllowed();',
      '{showTestCode && demoCode ?',
    ],
  },
  {
    file: 'src/features/auth/AdminAuthPages.tsx',
    includes: ["placeholder={isTestRoleSwitchAllowed() ? '本地测试口令 000000' : '请输入管理员口令'}"],
  },
  {
    file: 'vite.mobile.config.ts',
    includes: ["replacement: fileURLToPath(new URL('./src/app/MobileApp.tsx', import.meta.url))"],
  },
  {
    file: 'vite.admin.config.ts',
    includes: ["replacement: fileURLToPath(new URL('./src/app/AdminApp.tsx', import.meta.url))"],
  },
  {
    file: 'src/app/AdminApp.tsx',
    includes: ["<Route path=\"/admin/login\" element={<AdminLoginPage />} />"],
  },
];

const failures = [];

for (const check of checks) {
  const source = readFileSync(resolve(root, check.file), 'utf8');
  for (const expected of check.includes) {
    if (!source.includes(expected)) failures.push(`${check.file} missing: ${expected}`);
  }
}

const mobileAppSource = readFileSync(resolve(root, 'src/app/MobileApp.tsx'), 'utf8');
if (mobileAppSource.includes('AdminDashboard') || mobileAppSource.includes('/admin/login')) {
  failures.push('src/app/MobileApp.tsx must not include admin dashboard or admin login routes');
}

if (mobileAppSource.includes('CompanionComingSoonPage')) {
  failures.push('src/app/MobileApp.tsx must not include companion coming-soon routes');
}

const roleShellSource = readFileSync(resolve(root, 'src/layouts/RoleShell.tsx'), 'utf8');
if (roleShellSource.includes('敬请期待')) {
  failures.push('src/layouts/RoleShell.tsx must not include production-visible coming-soon tabs');
}

const adminDashboardSource = readFileSync(resolve(root, 'src/features/admin/AdminDashboard.tsx'), 'utf8');
if (adminDashboardSource.includes('Demo Creator')) {
  failures.push('src/features/admin/AdminDashboard.tsx must not include production-visible demo account names');
}

const visibleSourceFiles = [
  ...collectSourceFiles('src/app'),
  ...collectSourceFiles('src/components'),
  ...collectSourceFiles('src/features'),
  'src/services/feedService.ts',
];
const forbiddenVisibleCopy = ['MVP', '本地模拟', '演示', '敬请期待', '待开放', '虚拟样例', '资料待替换', '流程演示'];
for (const file of visibleSourceFiles) {
  const source = readFileSync(resolve(root, file), 'utf8');
  for (const forbidden of forbiddenVisibleCopy) {
    if (source.includes(forbidden)) failures.push(`${file} must not include production-visible copy: ${forbidden}`);
  }
}

if (existsSync(resolve(root, 'src/features/companion/CompanionComingSoonPage.tsx'))) {
  failures.push('src/features/companion/CompanionComingSoonPage.tsx should be removed from production mobile app');
}

if (failures.length) {
  console.error('Production guard check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production guard check passed.');

function collectSourceFiles(relativeDir) {
  const dir = resolve(root, relativeDir);
  if (!existsSync(dir)) return [];

  const files = [];
  for (const entry of readdirSync(dir)) {
    const absolute = resolve(dir, entry);
    const relative = `${relativeDir}/${entry}`;
    if (statSync(absolute).isDirectory()) {
      files.push(...collectSourceFiles(relative));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(relative);
    }
  }
  return files;
}
