import { createHmac, randomInt, randomUUID } from 'node:crypto';

export const phoneVerificationDefaults = Object.freeze({
  purpose: 'auth',
  codeDigits: 6,
  expiresInSeconds: 5 * 60,
  cooldownSeconds: 60,
  phoneHourlyLimit: 5,
  ipHourlyLimit: 20,
  maxAttempts: 5,
});

export class PhoneVerificationError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'PhoneVerificationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createPhoneVerificationService({
  repository,
  sender,
  provider = 'mock',
  pepper,
  appEnv = 'development',
  clock = () => new Date(),
  generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
  config = {},
} = {}) {
  assertRepository(repository);
  if (!sender || typeof sender.sendVerificationCode !== 'function') {
    throw new Error('Phone verification sender is required.');
  }
  const settings = { ...phoneVerificationDefaults, ...config };
  const normalizedProvider = normalizeProvider(provider);
  const normalizedAppEnv = String(appEnv || 'development').trim().toLowerCase();
  const hashPepper = String(pepper || '').trim();
  if (!hashPepper && normalizedAppEnv === 'production') {
    throw new Error('PHONE_OTP_PEPPER is required in production.');
  }
  const effectivePepper = hashPepper || 'still-local-phone-otp-pepper';

  return {
    provider: normalizedProvider,

    async requestCode({ phone, ip = null, purpose = settings.purpose } = {}) {
      const normalizedPhone = normalizeMainlandPhone(phone);
      const normalizedPurpose = normalizePurpose(purpose);
      const code = String(generateCode());
      if (!new RegExp(`^\\d{${settings.codeDigits}}$`).test(code)) {
        throw new Error(`Phone verification code generator must return ${settings.codeDigits} digits.`);
      }

      const createdAt = clock();
      const expiresAt = new Date(createdAt.getTime() + settings.expiresInSeconds * 1000);
      const challenge = {
        id: randomUUID(),
        phone: normalizedPhone,
        purpose: normalizedPurpose,
        codeHash: hashPhoneCode({
          phone: normalizedPhone,
          purpose: normalizedPurpose,
          code,
          pepper: effectivePepper,
        }),
        requestedIp: normalizeIp(ip),
        provider: normalizedProvider,
        maxAttempts: settings.maxAttempts,
        expiresAt: expiresAt.toISOString(),
        createdAt: createdAt.toISOString(),
        cooldownSeconds: settings.cooldownSeconds,
        phoneHourlyLimit: settings.phoneHourlyLimit,
        ipHourlyLimit: settings.ipHourlyLimit,
      };

      try {
        await repository.issue(challenge);
      } catch (error) {
        throw mapRepositoryError(error);
      }

      try {
        const delivery = await sender.sendVerificationCode({
          phone: normalizedPhone,
          code,
          expiresInMinutes: Math.ceil(settings.expiresInSeconds / 60),
          sessionContext: challenge.id,
        });
        await repository.markSent({
          challengeId: challenge.id,
          providerRequestId: delivery?.providerRequestId || null,
          sentAt: clock().toISOString(),
        });
      } catch (error) {
        await repository.markFailed({
          challengeId: challenge.id,
          failedAt: clock().toISOString(),
          failureCode: String(error?.code || 'SMS_DELIVERY_FAILED').slice(0, 80),
        });
        if (error?.code === 'SMS_NOT_CONFIGURED') {
          throw new PhoneVerificationError('SMS_NOT_CONFIGURED', error.message, 501);
        }
        throw new PhoneVerificationError('SMS_DELIVERY_FAILED', 'Verification message could not be sent. Please try again later.', 502);
      }

      return {
        expiresInSeconds: settings.expiresInSeconds,
        cooldownSeconds: settings.cooldownSeconds,
        ...(normalizedProvider === 'mock' && normalizedAppEnv !== 'production' ? { testCode: code } : {}),
      };
    },

    async verifyCode({ phone, code, purpose = settings.purpose } = {}) {
      const normalizedPhone = normalizeMainlandPhone(phone);
      const normalizedPurpose = normalizePurpose(purpose);
      const normalizedCode = String(code || '').trim();
      if (!new RegExp(`^\\d{${settings.codeDigits}}$`).test(normalizedCode)) {
        throw new PhoneVerificationError('PHONE_CODE_INVALID', `Enter the ${settings.codeDigits}-digit verification code.`, 400);
      }

      const result = await repository.verify({
        phone: normalizedPhone,
        purpose: normalizedPurpose,
        codeHash: hashPhoneCode({
          phone: normalizedPhone,
          purpose: normalizedPurpose,
          code: normalizedCode,
          pepper: effectivePepper,
        }),
        verifiedAt: clock().toISOString(),
      });

      if (result?.status === 'verified') {
        return { phone: normalizedPhone, challengeId: result.challengeId };
      }
      if (result?.status === 'expired') {
        throw new PhoneVerificationError('PHONE_CODE_EXPIRED', 'The verification code has expired. Request a new code.', 401);
      }
      if (result?.status === 'too_many_attempts') {
        throw new PhoneVerificationError('PHONE_CODE_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.', 429);
      }
      if (result?.status === 'consumed') {
        throw new PhoneVerificationError('PHONE_CODE_ALREADY_USED', 'The verification code has already been used.', 401);
      }
      throw new PhoneVerificationError('PHONE_CODE_INVALID', 'The verification code is incorrect.', 401, {
        attemptsRemaining: result?.attemptsRemaining,
      });
    },
  };
}

export function normalizeMainlandPhone(value) {
  const phone = String(value || '').replace(/\D/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new PhoneVerificationError('PHONE_INVALID', 'Enter a valid mainland China mobile number.', 400);
  }
  return phone;
}

export function hashPhoneCode({ phone, purpose, code, pepper }) {
  return createHmac('sha256', pepper)
    .update(`${purpose}:${phone}:${code}`)
    .digest('hex');
}

function mapRepositoryError(error) {
  if (error?.code === 'PHONE_CODE_COOLDOWN') {
    return new PhoneVerificationError('PHONE_CODE_COOLDOWN', 'Please wait before requesting another code.', 429, {
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  if (error?.code === 'PHONE_CODE_PHONE_RATE_LIMIT') {
    return new PhoneVerificationError('PHONE_CODE_RATE_LIMIT', 'Too many verification messages were requested for this phone number.', 429, {
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  if (error?.code === 'PHONE_CODE_IP_RATE_LIMIT') {
    return new PhoneVerificationError('PHONE_CODE_RATE_LIMIT', 'Too many verification messages were requested from this network.', 429, {
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  return error;
}

function assertRepository(repository) {
  for (const method of ['issue', 'markSent', 'markFailed', 'verify']) {
    if (typeof repository?.[method] !== 'function') {
      throw new Error(`Phone verification repository.${method} is required.`);
    }
  }
}

function normalizeProvider(provider) {
  const normalized = String(provider || 'mock').trim().toLowerCase();
  if (!['mock', 'tencent'].includes(normalized)) {
    throw new Error(`Unsupported PHONE_SMS_PROVIDER "${provider}". Use "mock" or "tencent".`);
  }
  return normalized;
}

function normalizePurpose(purpose) {
  const normalized = String(purpose || phoneVerificationDefaults.purpose).trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(normalized)) {
    throw new PhoneVerificationError('PHONE_CODE_PURPOSE_INVALID', 'Invalid phone verification purpose.', 400);
  }
  return normalized;
}

function normalizeIp(ip) {
  const value = String(ip || '').trim();
  return value || null;
}
