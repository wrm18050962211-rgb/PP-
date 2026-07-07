import { existsSync, readFileSync } from 'node:fs';
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

if (existsSync(resolve(root, 'src/features/companion/CompanionComingSoonPage.tsx'))) {
  failures.push('src/features/companion/CompanionComingSoonPage.tsx should be removed from production mobile app');
}

if (failures.length) {
  console.error('Production guard check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production guard check passed.');
