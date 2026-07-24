export function createMemoryPhoneVerificationWrites() {
  const challenges = [];

  return {
    async issue(draft) {
      const createdAtMs = Date.parse(draft.createdAt);
      const hourStartMs = createdAtMs - 60 * 60 * 1000;
      const active = challenges.filter((item) => ['pending', 'sent'].includes(item.deliveryStatus));
      const latest = active
        .filter((item) => item.phone === draft.phone && item.purpose === draft.purpose)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
      if (latest) {
        const retryAfterSeconds = Math.ceil((Date.parse(latest.createdAt) + draft.cooldownSeconds * 1000 - createdAtMs) / 1000);
        if (retryAfterSeconds > 0) throw repositoryError('PHONE_CODE_COOLDOWN', retryAfterSeconds);
      }

      const phoneCount = active.filter((item) => item.phone === draft.phone && Date.parse(item.createdAt) >= hourStartMs).length;
      if (phoneCount >= draft.phoneHourlyLimit) {
        throw repositoryError('PHONE_CODE_PHONE_RATE_LIMIT', secondsUntilWindowReset(active, 'phone', draft.phone, createdAtMs));
      }
      if (draft.requestedIp) {
        const ipCount = active.filter((item) => item.requestedIp === draft.requestedIp && Date.parse(item.createdAt) >= hourStartMs).length;
        if (ipCount >= draft.ipHourlyLimit) {
          throw repositoryError('PHONE_CODE_IP_RATE_LIMIT', secondsUntilWindowReset(active, 'requestedIp', draft.requestedIp, createdAtMs));
        }
      }

      const challenge = {
        ...draft,
        deliveryStatus: 'pending',
        attempts: 0,
        consumedAt: null,
      };
      challenges.push(challenge);
      return { ...challenge };
    },

    async markSent({ challengeId, providerRequestId, sentAt }) {
      const challenge = challenges.find((item) => item.id === challengeId);
      if (!challenge) return null;
      Object.assign(challenge, {
        deliveryStatus: 'sent',
        providerRequestId,
        sentAt,
      });
      return { ...challenge };
    },

    async markFailed({ challengeId, failureCode, failedAt }) {
      const challenge = challenges.find((item) => item.id === challengeId);
      if (!challenge) return null;
      Object.assign(challenge, {
        deliveryStatus: 'failed',
        failureCode,
        failedAt,
      });
      return { ...challenge };
    },

    async verify({ phone, purpose, codeHash, verifiedAt }) {
      const challenge = challenges
        .filter((item) => item.phone === phone && item.purpose === purpose && item.deliveryStatus === 'sent')
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
      if (!challenge) return { status: 'not_found' };
      if (challenge.consumedAt) return { status: 'consumed', challengeId: challenge.id };
      if (Date.parse(challenge.expiresAt) < Date.parse(verifiedAt)) return { status: 'expired', challengeId: challenge.id };
      if (challenge.attempts >= challenge.maxAttempts) return { status: 'too_many_attempts', challengeId: challenge.id };

      if (challenge.codeHash !== codeHash) {
        challenge.attempts += 1;
        const attemptsRemaining = Math.max(0, challenge.maxAttempts - challenge.attempts);
        return {
          status: attemptsRemaining === 0 ? 'too_many_attempts' : 'invalid',
          challengeId: challenge.id,
          attemptsRemaining,
        };
      }

      challenge.consumedAt = verifiedAt;
      return { status: 'verified', challengeId: challenge.id };
    },
  };
}

function repositoryError(code, retryAfterSeconds) {
  const error = new Error(code);
  error.code = code;
  error.retryAfterSeconds = Math.max(1, retryAfterSeconds || 3600);
  return error;
}

function secondsUntilWindowReset(items, field, value, nowMs) {
  const oldest = items
    .filter((item) => item[field] === value && Date.parse(item.createdAt) >= nowMs - 60 * 60 * 1000)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0];
  return oldest ? Math.ceil((Date.parse(oldest.createdAt) + 60 * 60 * 1000 - nowMs) / 1000) : 3600;
}
