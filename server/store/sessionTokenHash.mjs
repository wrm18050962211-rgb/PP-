import { createHash } from 'node:crypto';

export function hashSessionToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) throw new Error('Session token is required');
  return createHash('sha256').update(normalized).digest('hex');
}
