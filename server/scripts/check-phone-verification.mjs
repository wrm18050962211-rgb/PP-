import { createPhoneVerificationService, PhoneVerificationError } from '../services/phoneVerification.mjs';
import { createMockSmsSender } from '../services/tencentSms.mjs';
import { createMemoryPhoneVerificationWrites } from '../store/memoryPhoneVerificationWrites.mjs';

let currentTime = new Date('2026-07-24T08:00:00.000Z');
const clock = () => new Date(currentTime);
const repository = createMemoryPhoneVerificationWrites();
const service = createPhoneVerificationService({
  repository,
  sender: createMockSmsSender(),
  provider: 'mock',
  pepper: 'test-phone-otp-pepper',
  appEnv: 'test',
  clock,
  generateCode: () => '123456',
});

const issued = await service.requestCode({ phone: '13800138000', ip: '127.0.0.1' });
assert(issued.testCode === '123456', 'mock mode returns the test code outside production');
assert(issued.cooldownSeconds === 60, 'response includes cooldown');

await assertPhoneError(
  () => service.requestCode({ phone: '13800138000', ip: '127.0.0.1' }),
  'PHONE_CODE_COOLDOWN',
  'repeated requests are rate limited',
);

await assertPhoneError(
  () => service.verifyCode({ phone: '13800138000', code: '000000' }),
  'PHONE_CODE_INVALID',
  'incorrect codes are rejected',
);
const verified = await service.verifyCode({ phone: '13800138000', code: '123456' });
assert(verified.phone === '13800138000', 'correct code verifies the phone');
await assertPhoneError(
  () => service.verifyCode({ phone: '13800138000', code: '123456' }),
  'PHONE_CODE_ALREADY_USED',
  'verification codes can only be consumed once',
);

currentTime = new Date('2026-07-24T09:00:00.000Z');
const expiryRepository = createMemoryPhoneVerificationWrites();
const expiryService = createPhoneVerificationService({
  repository: expiryRepository,
  sender: createMockSmsSender(),
  provider: 'mock',
  pepper: 'test-phone-otp-pepper',
  appEnv: 'test',
  clock,
  generateCode: () => '654321',
});
await expiryService.requestCode({ phone: '13900139000', ip: '127.0.0.2' });
currentTime = new Date('2026-07-24T09:06:00.000Z');
await assertPhoneError(
  () => expiryService.verifyCode({ phone: '13900139000', code: '654321' }),
  'PHONE_CODE_EXPIRED',
  'expired codes are rejected',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['mock-delivery', 'cooldown', 'invalid-code', 'consume-once', 'expiry'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Phone verification check failed: ${message}`);
}

async function assertPhoneError(callback, expectedCode, message) {
  try {
    await callback();
  } catch (error) {
    assert(error instanceof PhoneVerificationError, `${message} uses a domain error`);
    assert(error.code === expectedCode, `${message} (${expectedCode})`);
    return;
  }
  throw new Error(`Phone verification check failed: ${message}`);
}
