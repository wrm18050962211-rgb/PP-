import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const tempDirectory = await mkdtemp(resolve(tmpdir(), 'still-phone-auth-'));
const port = 19000 + Math.floor(Math.random() * 1000);
const serverProcess = spawn(process.execPath, ['server.mjs'], {
  cwd: resolve(import.meta.dirname, '..'),
  env: {
    ...process.env,
    APP_ENV: 'test',
    STORE_DRIVER: 'json',
    STORE_PATH: resolve(tempDirectory, 'store.json'),
    PORT: String(port),
    PHONE_SMS_PROVIDER: 'mock',
    PHONE_OTP_PEPPER: 'route-test-phone-otp-pepper',
    ENABLE_TEST_ROLE_SWITCH: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
serverProcess.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
serverProcess.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(port);
  const requestResult = await post(port, '/api/auth/phone/request-code', {
    phone: '13800138000',
  });
  assert(requestResult.success, 'request-code route succeeds');
  assert(/^\d{6}$/.test(requestResult.data.testCode), 'mock route returns a six-digit test code');

  const verifyResult = await post(port, '/api/auth/phone/verify', {
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

  const consumedResult = await post(port, '/api/auth/phone/verify', {
    phone: '13800138000',
    code: requestResult.data.testCode,
    role: 'consumer',
    intent: 'login',
  });
  assert(!consumedResult.success, 'used code cannot authenticate again');
  assert(consumedResult.error.code === 'PHONE_CODE_ALREADY_USED', 'used code returns the expected error');

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: ['request-code-route', 'phone-session', 'verified-phone', 'bearer-token', 'consume-once-route'],
      },
      null,
      2,
    ),
  );
} finally {
  serverProcess.kill();
  await new Promise((resolveExit) => {
    if (serverProcess.exitCode !== null) return resolveExit();
    serverProcess.once('exit', resolveExit);
    setTimeout(resolveExit, 2000);
  });
  await rm(tempDirectory, { recursive: true, force: true });
}

async function waitForServer(serverPort) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Phone auth test server exited early.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Phone auth test server did not start.\n${serverOutput}`);
}

async function post(serverPort, path, body) {
  const response = await fetch(`http://127.0.0.1:${serverPort}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(`Phone auth route check failed: ${message}\n${serverOutput}`);
}
