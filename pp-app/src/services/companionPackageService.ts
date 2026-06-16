import type { Companion } from '../types/api';
import { readDomainJson, writeDomainJson } from './scopedStorage';

export type CompanionPackage = {
  id: string;
  name: string;
  durationMinutes: number;
  basePriceCents: number;
  depositCents: number;
  balanceDueTiming: 'before_shoot';
  includedRetouchedCount: number;
  includedOriginals: number;
  description: string;
};

export type CompanionPackageSettings = {
  packages: CompanionPackage[];
  addOns: {
    extraPersonPerHourCents: number;
    outdoorFeeCents: number;
    hotWeatherFeeCents: number;
    nightFeeCents: number;
    remoteLocationFeeCents: number;
    retouchPerImageCents: number;
    videoPerClipCents: number;
    polaroidPerShotCents: number;
    specialDeviceFeeCents: number;
  };
  rules: {
    availableTimeRanges: string;
    minBookingAdvanceDays: number;
    reschedulePolicy: string;
    cancellationPolicy: string;
    latePolicy: string;
    weatherPolicy: string;
    publicationPolicy: string;
    excludedScenes: string;
    travelFeePolicy: string;
    ticketFeePolicy: string;
    routePlanningPolicy: string;
    deliveryPolicy: string;
  };
  updatedAt: string;
};

const storageKey = 'companion-package-settings-v1';
const sharedPackageStorageKey = 'pp-cloud-db:shared:companion-package-settings-by-companion-v1';

export function readCompanionPackageSettings(companion?: Companion | null) {
  const sharedSettings = readSharedCompanionPackageSettings(companion?.id);
  if (sharedSettings) return sharedSettings;
  const legacySettings = readLegacyScopedCompanionPackageSettings(companion?.id);
  if (legacySettings) return legacySettings;
  if (companion?.id) return createDefaultPackageSettings(companion);
  return readDomainJson<CompanionPackageSettings | null>(storageKey, null, 'companion') ?? createDefaultPackageSettings(companion);
}

export function saveCompanionPackageSettings(settings: CompanionPackageSettings, companionId?: string | null) {
  const nextSettings = { ...settings, updatedAt: new Date().toISOString() };
  writeDomainJson(storageKey, nextSettings, 'companion');
  if (companionId) writeSharedCompanionPackageSettings(companionId, nextSettings);
}

export function createDefaultPackageSettings(companion?: Companion | null): CompanionPackageSettings {
  const firstActivity = companion?.activities[0];
  const basePriceCents = firstActivity?.priceCents ?? 31600;
  return {
    packages: [
      {
        id: 'package-basic',
        name: firstActivity?.name || '基础陪拍',
        durationMinutes: firstActivity?.durationMinutes ?? 120,
        basePriceCents,
        depositCents: Math.min(10000, Math.round(basePriceCents * 0.32)),
        balanceDueTiming: 'before_shoot',
        includedRetouchedCount: 4,
        includedOriginals: 60,
        description: '适合 Citywalk、探店、日常头像和轻写真。',
      },
      {
        id: 'package-half-day',
        name: '半天拍摄',
        durationMinutes: 240,
        basePriceCents: 56800,
        depositCents: 15000,
        balanceDueTiming: 'before_shoot',
        includedRetouchedCount: 8,
        includedOriginals: 120,
        description: '适合多地点路线、展览、景区和半日内容创作。',
      },
      {
        id: 'package-full-day',
        name: '全天拍摄',
        durationMinutes: 480,
        basePriceCents: 108800,
        depositCents: 30000,
        balanceDueTiming: 'before_shoot',
        includedRetouchedCount: 16,
        includedOriginals: 220,
        description: '适合旅行、活动记录和完整路线陪拍。',
      },
    ],
    addOns: {
      extraPersonPerHourCents: 5000,
      outdoorFeeCents: 0,
      hotWeatherFeeCents: 6000,
      nightFeeCents: 8000,
      remoteLocationFeeCents: 12000,
      retouchPerImageCents: 800,
      videoPerClipCents: 5000,
      polaroidPerShotCents: 1200,
      specialDeviceFeeCents: 10000,
    },
    rules: {
      availableTimeRanges: '10:00-12:00 / 14:00-18:00 / 19:00-21:00',
      minBookingAdvanceDays: 1,
      reschedulePolicy: '拍摄前 24 小时可协商改期一次。',
      cancellationPolicy: '待确认阶段摄影师拒绝定金全退；已确认后取消按定金和押金规则处理。',
      latePolicy: '迟到 15 分钟内尽量顺延，超过 30 分钟需协商加时或改期。',
      weatherPolicy: '恶劣天气可协商改期，室内场地按原计划执行。',
      publicationPolicy: '客片发布需双方在平台内确认。',
      excludedScenes: '不接危险、高风险、违法或明显私下交易场景。',
      travelFeePolicy: '远距离交通费由创作者承担，报价时提前说明。',
      ticketFeePolicy: '门票、入园、展览和探店消费默认由创作者承担。',
      routePlanningPolicy: '基础路线建议包含，复杂路线规划需提前沟通。',
      deliveryPolicy: '摄影师上传原图后，平台先提供低清水印预览；确认完成后开放原图或进入争议处理。',
    },
    updatedAt: new Date().toISOString(),
  };
}

export function formatCents(cents: number) {
  return `¥${Math.round(cents / 100)}`;
}

function readSharedCompanionPackageSettings(companionId?: string | null) {
  if (!companionId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(sharedPackageStorageKey);
    const records = raw ? (JSON.parse(raw) as Record<string, CompanionPackageSettings>) : {};
    return records[companionId] ?? null;
  } catch {
    return null;
  }
}

function writeSharedCompanionPackageSettings(companionId: string, settings: CompanionPackageSettings) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(sharedPackageStorageKey);
    const records = raw ? (JSON.parse(raw) as Record<string, CompanionPackageSettings>) : {};
    localStorage.setItem(sharedPackageStorageKey, JSON.stringify({ ...records, [companionId]: settings }));
  } catch {
    localStorage.setItem(sharedPackageStorageKey, JSON.stringify({ [companionId]: settings }));
  }
}

function readLegacyScopedCompanionPackageSettings(companionId?: string | null) {
  if (!companionId || typeof localStorage === 'undefined') return null;
  try {
    const scopedSuffix = `:${storageKey}`;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.endsWith(scopedSuffix) || !key.includes(`:${companionId}:`)) continue;
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as CompanionPackageSettings;
    }
    return null;
  } catch {
    return null;
  }
}
