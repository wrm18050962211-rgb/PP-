import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const tempDirectory = await mkdtemp(resolve(tmpdir(), 'still-phone-auth-'));
const storePath = resolve(tempDirectory, 'store.json');
const port = 19000 + Math.floor(Math.random() * 1000);
let serverProcess = null;
let serverOutput = '';

try {
  await startServer();
  const requestResult = await post('/api/auth/phone/request-code', {
    phone: '13800138000',
  });
  assert(requestResult.success, 'request-code route succeeds');
  assert(/^\d{6}$/.test(requestResult.data.testCode), 'mock route returns an internal test code');

  const verifyResult = await post('/api/auth/phone/verify', {
    phone: '13800138000',
    code: requestResult.data.testCode,
    role: 'consumer',
    intent: 'register',
  });
  assert(verifyResult.success, 'verify route succeeds');
  assert(verifyResult.data.provider === 'phone', 'session provider is phone');
  assert(verifyResult.data.role === 'consumer', 'new phone account receives consumer role');
  assert(verifyResult.data.user.phone === '13800138000', 'session includes the verified phone');
  assert(Boolean(verifyResult.data.token), 'session includes a bearer token');
  const firstToken = verifyResult.data.token;
  const firstExpiry = verifyResult.data.expiresAt;

  const restoredBeforeRestart = await get('/api/auth/session', firstToken);
  assert(restoredBeforeRestart.success, 'bearer token restores the active session');
  assert(restoredBeforeRestart.data.token === firstToken, 'session restore keeps the bearer token');
  assert(restoredBeforeRestart.data.expiresAt === firstExpiry, 'session restore does not extend expiry');

  const companionCodeResult = await post('/api/auth/phone/request-code', {
    phone: '13900139000',
  });
  const companionLoginResult = await post('/api/auth/phone/verify', {
    phone: '13900139000',
    code: companionCodeResult.data.testCode,
    role: 'companion',
    intent: 'login',
  });
  assert(!companionLoginResult.success, 'unapproved phone account cannot enter the companion role');
  assert(companionLoginResult.error.code === 'PHONE_ROLE_NOT_AVAILABLE', 'companion role denial is stable');

  const consumedResult = await post('/api/auth/phone/verify', {
    phone: '13800138000',
    code: requestResult.data.testCode,
    role: 'consumer',
    intent: 'login',
  });
  assert(!consumedResult.success, 'used code cannot authenticate again');
  assert(consumedResult.error.code === 'PHONE_CODE_ALREADY_USED', 'used code returns the expected error');

  await stopServer();
  await startServer();

  const restoredAfterRestart = await get('/api/auth/session', firstToken);
  assert(restoredAfterRestart.success, 'persisted bearer session survives a server restart');
  assert(restoredAfterRestart.data.user.phone === '13800138000', 'restarted session keeps the user identity');
  assert(restoredAfterRestart.data.expiresAt === firstExpiry, 'restarted session keeps the original expiry');

  const reloginCodeResult = await post('/api/auth/phone/request-code', {
    phone: '13800138000',
  });
  const reloginResult = await post('/api/auth/phone/verify', {
    phone: '13800138000',
    code: reloginCodeResult.data.testCode,
    role: 'consumer',
    intent: 'login',
  });
  assert(reloginResult.success, 'verified phone can log in again');
  assert(reloginResult.data.user.id === verifyResult.data.user.id, 're-login reuses the persisted user');
  assert(reloginResult.data.token !== firstToken, 're-login creates a distinct session token');

  const logoutResult = await post('/api/auth/logout', {}, reloginResult.data.token);
  assert(logoutResult.success, 'logout succeeds');
  const revokedSessionResult = await get('/api/auth/session', reloginResult.data.token);
  assert(!revokedSessionResult.success, 'logged-out bearer token is rejected');
  assert(revokedSessionResult.error.code === 'AUTH_REQUIRED', 'revoked token returns the authentication error');

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'request-code-route',
          'phone-session',
          'bearer-session-restore',
          'fixed-session-expiry',
          'companion-role-boundary',
          'consume-once-route',
          'restart-persistence',
          're-login',
          'distinct-session-token',
          'logout-revocation',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer();
  await rm(tempDirectory, { recursive: true, force: true });
}

async function startServer() {
  serverOutput = '';
  serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      APP_ENV: 'test',
      STORE_DRIVER: 'json',
      STORE_PATH: storePath,
      PORT: String(port),
      PHONE_SMS_PROVIDER: 'mock',
      PHONE_OTP_PEPPER: 'route-test-phone-otp-pepper',
      ENABLE_TEST_ROLE_SWITCH: 'true',
      SESSION_TTL_DAYS: '30',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer();
}

async function stopServer() {
  if (!serverProcess) return;
  const processToStop = serverProcess;
  serverProcess = null;
  processToStop.kill();
  await new Promise((resolveExit) => {
    if (processToStop.exitCode !== null) return resolveExit();
    processToStop.once('exit', resolveExit);
    setTimeout(resolveExit, 2000);
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode !== null) {
      throw new Error(`Phone auth test server exited early.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Phone auth test server did not start.\n${serverOutput}`);
}

async function get(path, token) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return response.json();
}

async function post(path, body, token = '') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(`Phone auth route check failed: ${message}\n${serverOutput}`);
}
