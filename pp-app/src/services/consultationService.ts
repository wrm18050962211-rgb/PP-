import type { AuthSession, Companion, CreateOrderInput, FeedPost, OrderImageQuantityMode } from '../types/api';
import { evaluateMessageRisk } from '../utils/messageRisk';
import { listTestAccounts } from './accountDirectory';
import { readCompanionPackageSettings } from './companionPackageService';

export type ConsultationRequestCard = {
  date: string;
  timeRange: string;
  slotId?: string;
  startAt?: string;
  endAt?: string;
  place: string;
  placeLat?: number;
  placeLng?: number;
  peopleCount: number;
  packageId: string;
  packageName: string;
  sceneType: 'outdoor' | 'indoor';
  imageQuantityMode: OrderImageQuantityMode;
  customImageQuantity?: number;
  needsRetouch: boolean;
  retouchSelection?: '4' | '9' | 'all' | 'custom';
  customRetouchCount?: number;
  needsVideo: boolean;
  videoCount?: number;
  videoAverageDurationSeconds?: number;
  needsPolaroid: boolean;
  polaroidCount?: number;
  acceptsPublication: boolean;
  needsRoutePlanning: boolean;
  needsCompanionQueueing: boolean;
  hasTicketOrEntry: boolean;
  note: string;
  referenceImages: string[];
};

export type ConsultationQuote = {
  id: string;
  packageId: string;
  packageName: string;
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  addOnLines: string[];
  place: string;
  time: string;
  createdAt: string;
};

export type ConsultationQuoteOverride = {
  totalCents?: number;
  depositCents?: number;
  addOnLines?: string[];
};

export type ConsultationQuoteEstimate = {
  totalCents: number;
  depositCents: number;
  balanceCents: number;
  addOnLines: string[];
};

export type ConsultationRecord = {
  id: string;
  creatorId?: string;
  creatorName?: string;
  creatorPhone?: string;
  photographerId: string;
  photographerName: string;
  photographerAvatar?: string;
  postId: string;
  status: 'consulting' | 'quoted' | 'closed';
  requestCard: ConsultationRequestCard;
  quote?: ConsultationQuote;
  createdAt: string;
  updatedAt: string;
};

const storageKey = 'consultations-v1';
const sharedConsultationStorageKey = `pp-cloud-db:shared:${storageKey}`;

export function listConsultations(session?: AuthSession | null) {
  const records = readConsultations();
  if (!session) return [];
  if (session.role === 'companion') return records.filter((item) => item.photographerId === session.companionId);
  if (session.role === 'consumer') return records.filter((item) => item.creatorId === session.user.id || item.creatorPhone === session.user.phone);
  return records;
}

export function getConsultation(id?: string) {
  if (!id) return null;
  return readConsultations().find((item) => item.id === id) ?? null;
}

export function createConsultation(post: FeedPost, card: ConsultationRequestCard, session: AuthSession | null) {
  if (isSelfConsultation(post, session)) {
    throw new Error('不能用自己的创作者身份预约自己的摄影师身份');
  }

  const now = new Date().toISOString();
  const record: ConsultationRecord = {
    id: `consultation-${Date.now()}`,
    creatorId: session?.user.id,
    creatorName: session?.user.nickname,
    creatorPhone: session?.user.phone,
    photographerId: post.companion.id,
    photographerName: post.companion.name,
    photographerAvatar: post.companion.avatar,
    postId: post.id,
    status: 'consulting',
    requestCard: card,
    createdAt: now,
    updatedAt: now,
  };
  writeConsultations([record, ...readConsultations()]);
  return record;
}

export function isSelfConsultation(post: FeedPost, session: AuthSession | null) {
  if (!session?.user.phone) return false;
  if (session.companionId && session.companionId === post.companion.id) return true;
  const photographerAccount = listTestAccounts().find((account) => account.role === 'companion' && account.companionId === post.companion.id);
  if (photographerAccount?.phone === session.user.phone) return true;
  return post.companion.id === `companion-local-${session.user.phone}`;
}

export function estimateConsultationQuote(record: ConsultationRecord, companion: Companion | undefined): ConsultationQuoteEstimate {
  const settings = readCompanionPackageSettings(companion);
  const selectedPackage = settings.packages.find((pkg) => pkg.id === record.requestCard.packageId) ?? settings.packages[0];
  const extraPeople = Math.max(0, record.requestCard.peopleCount - 1);
  const addOnLines: string[] = [];
  let totalCents = selectedPackage.basePriceCents;

  if (extraPeople) {
    const amount = extraPeople * settings.addOns.extraPersonPerHourCents * Math.max(1, selectedPackage.durationMinutes / 60);
    totalCents += amount;
    addOnLines.push(`多人加价 ${formatEstimateMoney(amount)}`);
  }
  if (record.requestCard.needsVideo) {
    const videoCount = Math.max(1, record.requestCard.videoCount ?? 1);
    const amount = settings.addOns.videoPerClipCents * videoCount;
    totalCents += amount;
    addOnLines.push(`视频 ${videoCount} 条 ${formatEstimateMoney(amount)}`);
  }
  if (record.requestCard.needsPolaroid) {
    const polaroidCount = Math.max(1, record.requestCard.polaroidCount ?? 1);
    const amount = settings.addOns.polaroidPerShotCents * polaroidCount;
    totalCents += amount;
    addOnLines.push(`拍立得/胶片 ${polaroidCount} 张 ${formatEstimateMoney(amount)}`);
  }
  if (record.requestCard.sceneType === 'outdoor' && settings.addOns.outdoorFeeCents) {
    totalCents += settings.addOns.outdoorFeeCents;
    addOnLines.push(`室外附加 ${formatEstimateMoney(settings.addOns.outdoorFeeCents)}`);
  }
  if (settings.addOns.travelFeeCents) {
    totalCents += settings.addOns.travelFeeCents;
    addOnLines.push(`交通费 ${formatEstimateMoney(settings.addOns.travelFeeCents)}`);
  }

  const depositCents = Math.min(totalCents, selectedPackage.depositCents);
  return {
    totalCents,
    depositCents,
    balanceCents: Math.max(0, totalCents - depositCents),
    addOnLines,
  };
}

export function sendQuoteForConsultation(id: string, companion: Companion | undefined, override: ConsultationQuoteOverride = {}) {
  const settings = readCompanionPackageSettings(companion);
  const records = readConsultations();
  const nextRecords = records.map((item) => {
    if (item.id !== id) return item;
    const selectedPackage = settings.packages.find((pkg) => pkg.id === item.requestCard.packageId) ?? settings.packages[0];
    const extraPeople = Math.max(0, item.requestCard.peopleCount - 1);
    const addOnLines: string[] = [];
    let totalCents = selectedPackage.basePriceCents;
    if (extraPeople) {
      const amount = extraPeople * settings.addOns.extraPersonPerHourCents * Math.max(1, selectedPackage.durationMinutes / 60);
      totalCents += amount;
      addOnLines.push(`多人加价 ¥${Math.round(amount / 100)}`);
    }
    if (item.requestCard.needsVideo) {
      const videoCount = Math.max(1, item.requestCard.videoCount ?? 1);
      const amount = settings.addOns.videoPerClipCents * videoCount;
      totalCents += amount;
      addOnLines.push(`视频 ${videoCount} 条 ¥${Math.round(amount / 100)}`);
    }
    if (item.requestCard.needsPolaroid) {
      const polaroidCount = Math.max(1, item.requestCard.polaroidCount ?? 1);
      const amount = settings.addOns.polaroidPerShotCents * polaroidCount;
      totalCents += amount;
      addOnLines.push(`拍立得/胶片 ${polaroidCount} 张 ¥${Math.round(amount / 100)}`);
    }
    if (item.requestCard.sceneType === 'outdoor' && settings.addOns.outdoorFeeCents) {
      totalCents += settings.addOns.outdoorFeeCents;
      addOnLines.push(`室外附加 ¥${Math.round(settings.addOns.outdoorFeeCents / 100)}`);
    }
    if (settings.addOns.travelFeeCents) {
      totalCents += settings.addOns.travelFeeCents;
      addOnLines.push(`交通费 ¥${Math.round(settings.addOns.travelFeeCents / 100)}`);
    }
    const totalCentsWithOverride = Math.max(0, override.totalCents ?? totalCents);
    const depositCents = Math.min(totalCentsWithOverride, Math.max(0, override.depositCents ?? selectedPackage.depositCents));
    const addOnLinesWithOverride = override.addOnLines ?? addOnLines;
    return {
      ...item,
      status: 'quoted' as const,
      quote: {
        id: `quote-${Date.now()}`,
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        totalCents: totalCentsWithOverride,
        depositCents,
        balanceCents: Math.max(0, totalCentsWithOverride - depositCents),
        addOnLines: addOnLinesWithOverride,
        place: item.requestCard.place,
        time: `${item.requestCard.date} ${item.requestCard.timeRange}`,
        createdAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
  });
  writeConsultations(nextRecords);
  return nextRecords.find((item) => item.id === id) ?? null;
}

export function closeConsultation(id: string) {
  const nextRecords = readConsultations().map((item) => (item.id === id ? { ...item, status: 'closed' as const, updatedAt: new Date().toISOString() } : item));
  writeConsultations(nextRecords);
}

export function consultationToOrderInput(record: ConsultationRecord): CreateOrderInput | null {
  if (!record.quote) return null;
  const [dateLabel, timeLabel = record.requestCard.timeRange] = record.quote.time.split(' ');
  const startAt = record.requestCard.startAt ?? new Date().toISOString();
  const endAt = record.requestCard.endAt ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  return {
    title: `${record.quote.packageName} 咨询报价`,
    time: record.quote.time,
    place: record.quote.place,
    amountCents: record.quote.totalCents,
    companion: record.photographerName,
    companionId: record.photographerId,
    postId: record.postId,
    activityId: record.quote.packageId,
    activityName: record.quote.packageName,
    slotId: record.requestCard.slotId ?? `consultation-slot-${record.id}`,
    startAt,
    endAt,
    dateLabel,
    timeLabel,
    durationMinutes: getConsultationDurationMinutes(startAt, endAt),
    durationLabel: record.requestCard.timeRange,
    imageQuantityMode: record.requestCard.imageQuantityMode,
    customImageQuantity: record.requestCard.imageQuantityMode === 'custom' ? record.requestCard.customImageQuantity : undefined,
    addOns: [],
    consultationId: record.id,
    quoteId: record.quote.id,
    depositCents: record.quote.depositCents,
    balanceCents: record.quote.balanceCents,
    depositStatus: 'paid',
    balanceStatus: 'unpaid',
    fundsStatus: 'deposit_escrowed',
    settlementStatus: 'pending',
  };
}

export function getConsultationRiskText(record: ConsultationRecord) {
  const risk = evaluateMessageRisk(`${record.requestCard.note} ${record.requestCard.place}`);
  if (risk.level === 'clean') return '需求卡已通过基础风控检查';
  return `需求卡包含需关注表达：${risk.hits.map((hit) => hit.keyword).join('、')}`;
}

function readConsultations() {
  if (typeof localStorage === 'undefined') return [];
  const records = new Map<string, ConsultationRecord>();

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || key === sharedConsultationStorageKey || !key.endsWith(`:${storageKey}`)) continue;
    for (const record of readConsultationStorageValue(key)) {
      setNewestConsultation(records, record);
    }
  }

  for (const record of readConsultationStorageValue(sharedConsultationStorageKey)) {
    setNewestConsultation(records, record);
  }

  return Array.from(records.values()).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function writeConsultations(records: ConsultationRecord[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(sharedConsultationStorageKey, JSON.stringify(records));
}

function readConsultationStorageValue(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ConsultationRecord[]) : [];
  } catch {
    return [];
  }
}

function setNewestConsultation(records: Map<string, ConsultationRecord>, record: ConsultationRecord) {
  const current = records.get(record.id);
  if (!current || new Date(record.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
    records.set(record.id, record);
  }
}

function getConsultationDurationMinutes(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 120;
  return Math.round((end - start) / 60000);
}

function formatEstimateMoney(amountCents: number) {
  return `¥${Math.round(amountCents / 100)}`;
}
