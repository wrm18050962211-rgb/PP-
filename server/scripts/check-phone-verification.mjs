import {
  createPhoneVerificationService,
  PhoneVerificationError,
  readPhoneVerificationConfig,
} from '../services/phoneVerification.mjs';
import { createMockSmsSender } from '../services/tencentSms.mjs';
import { createMemoryPhoneVerificationWrites } from '../store/memoryPhoneVerificationWrites.mjs';

let currentTime = new Date('2026-07-24T08:00:00.000Z');
const clock = () => new Date(currentTime);
const service = createTestService({
  repository: createMemoryPhoneVerificationWrites(),
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
const expiryService = createTestService({
  repository: createMemoryPhoneVerificationWrites(),
  generateCode: () => '654321',
});
await expiryService.requestCode({ phone: '13900139000', ip: '127.0.0.2' });
currentTime = new Date('2026-07-24T09:06:00.000Z');
await assertPhoneError(
  () => expiryService.verifyCode({ phone: '13900139000', code: '654321' }),
  'PHONE_CODE_EXPIRED',
  'expired codes are rejected',
);

currentTime = new Date('2026-07-24T10:00:00.000Z');
const attemptsService = createTestService({
  repository: createMemoryPhoneVerificationWrites(),
  generateCode: () => '234567',
  config: { maxAttempts: 3 },
});
await attemptsService.requestCode({ phone: '13700137000', ip: '127.0.0.3' });
await assertPhoneError(() => attemptsService.verifyCode({ phone: '13700137000', code: '000000' }), 'PHONE_CODE_INVALID', 'first incorrect attempt');
await assertPhoneError(() => attemptsService.verifyCode({ phone: '13700137000', code: '000000' }), 'PHONE_CODE_INVALID', 'second incorrect attempt');
await assertPhoneError(
  () => attemptsService.verifyCode({ phone: '13700137000', code: '000000' }),
  'PHONE_CODE_ATTEMPTS_EXCEEDED',
  'maximum attempts lock the challenge',
);
await assertPhoneError(
  () => attemptsService.verifyCode({ phone: '13700137000', code: '234567' }),
  'PHONE_CODE_ATTEMPTS_EXCEEDED',
  'locked challenges remain locked',
);

currentTime = new Date('2026-07-24T11:00:00.000Z');
const failedDeliveryRepository = createMemoryPhoneVerificationWrites();
const failedDeliveryService = createTestService({
  repository: failedDeliveryRepository,
  sender: {
    async sendVerificationCode() {
      const error = new Error('provider-private-detail');
      error.code = 'SMS_PROVIDER_UNAVAILABLE';
      throw error;
    },
  },
  generateCode: () => '345678',
  config: { cooldownSeconds: 30, phoneHourlyLimit: 2 },
});
await assertPhoneError(
  () => failedDeliveryService.requestCode({ phone: '13600136000', ip: '127.0.0.4' }),
  'SMS_DELIVERY_UNAVAILABLE',
  'provider transport failures are stable',
  'provider-private-detail',
);
currentTime = new Date(currentTime.getTime() + 31_000);
await assertPhoneError(
  () => failedDeliveryService.requestCode({ phone: '13600136000', ip: '127.0.0.4' }),
  'SMS_DELIVERY_UNAVAILABLE',
  'repeated provider transport failures remain stable',
  'provider-private-detail',
);
currentTime = new Date(currentTime.getTime() + 31_000);
await assertPhoneError(
  () => failedDeliveryService.requestCode({ phone: '13600136000', ip: '127.0.0.4' }),
  'PHONE_CODE_RATE_LIMIT',
  'failed delivery attempts count toward the hourly phone limit',
);

currentTime = new Date('2026-07-24T12:00:00.000Z');
const ipLimitService = createTestService({
  repository: createMemoryPhoneVerificationWrites(),
  generateCode: () => '456789',
  config: { ipHourlyLimit: 2 },
});
await ipLimitService.requestCode({ phone: '13500135000', ip: '127.0.0.5' });
await ipLimitService.requestCode({ phone: '13400134000', ip: '127.0.0.5' });
await assertPhoneError(
  () => ipLimitService.requestCode({ phone: '13300133000', ip: '127.0.0.5' }),
  'PHONE_CODE_RATE_LIMIT',
  'network hourly limit applies across phone numbers',
);

const providerRateLimitService = createTestService({
  repository: createMemoryPhoneVerificationWrites(),
  sender: {
    async sendVerificationCode() {
      const error = new Error('provider-private-detail');
      error.code = 'SMS_PROVIDER_RATE_LIMITED';
      throw error;
    },
  },
  generateCode: () => '567890',
});
await assertPhoneError(
  () => providerRateLimitService.requestCode({ phone: '13200132000', ip: '127.0.0.6' }),
  'SMS_DELIVERY_RATE_LIMITED',
  'provider rate limit maps to a stable domain error',
  'provider-private-detail',
);

assertThrows(
  () =>
    createPhoneVerificationService({
      repository: createMemoryPhoneVerificationWrites(),
      sender: createMockSmsSender(),
      provider: 'mock',
      pepper: 'production-test-pepper',
      appEnv: 'production',
    }),
  'Production phone verification requires',
  'production refuses the mock SMS provider',
);
assert(readPhoneVerificationConfig({ PHONE_OTP_MAX_ATTEMPTS: '4' }).maxAttempts === 4, 'environment limits are parsed');
assertThrows(
  () => readPhoneVerificationConfig({ PHONE_OTP_COOLDOWN_SECONDS: '1' }),
  'PHONE_OTP_COOLDOWN_SECONDS',
  'unsafe environment limits are rejected',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'mock-delivery',
        'cooldown',
        'invalid-code',
        'consume-once',
        'expiry',
        'max-attempts',
        'failed-delivery-frequency',
        'network-frequency',
        'stable-provider-errors',
        'production-provider-guard',
        'environment-limit-validation',
      ],
    },
    null,
    2,
  ),
);

function createTestService({ repository, sender = createMockSmsSender(), generateCode, config = {} }) {
  return createPhoneVerificationService({
    repository,
    sender,
    provider: 'mock',
    pepper: 'test-phone-otp-pepper',
    appEnv: 'test',
    clock,
    generateCode,
    config,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Phone verification check failed: ${message}`);
}

async function assertPhoneError(callback, expectedCode, message, forbiddenMessagePart = '') {
  try {
    await callback();
  } catch (error) {
    assert(error instanceof PhoneVerificationError, `${message} uses a domain error`);
    assert(error.code === expectedCode, `${message} (${expectedCode})`);
    if (forbiddenMessagePart) assert(!error.message.includes(forbiddenMessagePart), `${message} hides provider detail`);
    return;
  }
  throw new Error(`Phone verification check failed: ${message}`);
}

function assertThrows(callback, expectedMessagePart, message) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(expectedMessagePart), message);
    return;
  }
  throw new Error(`Phone verification check failed: ${message}`);
}
