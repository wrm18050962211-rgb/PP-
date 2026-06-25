import type { CompanionBookingSettings } from '../types/api';

const appDataStorageKey = 'app-data-v1';
const sharedBookingStorageKey = 'pp-cloud-db:shared:companion-booking-settings-by-companion-v1';

export function readCompanionBookingSettings(companionId?: string | null): CompanionBookingSettings | null {
  if (!companionId || typeof localStorage === 'undefined') return null;
  return readSharedCompanionBookingSettings(companionId) ?? readLegacyScopedCompanionBookingSettings(companionId);
}

export function saveCompanionBookingSettings(settings: CompanionBookingSettings, companionId?: string | null) {
  if (!companionId || typeof localStorage === 'undefined') return;
  writeSharedCompanionBookingSettings(companionId, {
    ...settings,
    companionId,
    updatedAt: new Date().toISOString(),
  });
}

function readSharedCompanionBookingSettings(companionId: string) {
  try {
    const raw = localStorage.getItem(sharedBookingStorageKey);
    const records = raw ? (JSON.parse(raw) as Record<string, CompanionBookingSettings>) : {};
    return records[companionId] ?? null;
  } catch {
    return null;
  }
}

function writeSharedCompanionBookingSettings(companionId: string, settings: CompanionBookingSettings) {
  try {
    const raw = localStorage.getItem(sharedBookingStorageKey);
    const records = raw ? (JSON.parse(raw) as Record<string, CompanionBookingSettings>) : {};
    localStorage.setItem(sharedBookingStorageKey, JSON.stringify({ ...records, [companionId]: settings }));
  } catch {
    localStorage.setItem(sharedBookingStorageKey, JSON.stringify({ [companionId]: settings }));
  }
}

function readLegacyScopedCompanionBookingSettings(companionId: string) {
  try {
    const scopedSuffix = `:${appDataStorageKey}`;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.endsWith(scopedSuffix) || !key.includes(`:${companionId}:`)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { bookingSettings?: CompanionBookingSettings };
      if (parsed.bookingSettings) return parsed.bookingSettings;
    }
    return null;
  } catch {
    return null;
  }
}
