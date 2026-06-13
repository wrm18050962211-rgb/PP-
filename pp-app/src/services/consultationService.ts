import type { AuthSession, Companion, CreateOrderInput, FeedPost } from '../types/api';
import { evaluateMessageRisk } from '../utils/messageRisk';
import { readDomainJson, writeDomainJson } from './scopedStorage';
import { createDefaultPackageSettings } from './companionPackageService';

export type ConsultationRequestCard = {
  date: string;
  timeRange: string;
  place: string;
  peopleCount: number;
  packageId: string;
  packageName: string;
  sceneType: 'outdoor' | 'indoor';
  needsRetouch: boolean;
  needsVideo: boolean;
  needsPolaroid: boolean;
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
  const now = new Date().toISOString();
  const record: ConsultationRecord = {
    id: `consultation-${Date.now()}`,
    creatorId: session?.user.id,
    creatorName: session?.user.nickname,
    creatorPhone: session?.user.phone,
    photographerId: post.companion.id,
    photographerName: post.companion.name,
    photographerAvatar: post.companion.avatar || post.companion.photo,
    postId: post.id,
    status: 'consulting',
    requestCard: card,
    createdAt: now,
    updatedAt: now,
  };
  writeConsultations([record, ...readConsultations()]);
  return record;
}

export function sendQuoteForConsultation(id: string, companion: Companion | undefined) {
  const settings = createDefaultPackageSettings(companion);
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
      totalCents += settings.addOns.videoPerClipCents;
      addOnLines.push(`视频片段 ¥${Math.round(settings.addOns.videoPerClipCents / 100)}`);
    }
    if (item.requestCard.needsPolaroid) {
      totalCents += settings.addOns.polaroidPerShotCents * 5;
      addOnLines.push(`拍立得 5 张 ¥${Math.round((settings.addOns.polaroidPerShotCents * 5) / 100)}`);
    }
    if (item.requestCard.sceneType === 'outdoor' && settings.addOns.outdoorFeeCents) {
      totalCents += settings.addOns.outdoorFeeCents;
      addOnLines.push(`室外附加 ¥${Math.round(settings.addOns.outdoorFeeCents / 100)}`);
    }
    const depositCents = selectedPackage.depositCents;
    return {
      ...item,
      status: 'quoted' as const,
      quote: {
        id: `quote-${Date.now()}`,
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        totalCents,
        depositCents,
        balanceCents: Math.max(0, totalCents - depositCents),
        addOnLines,
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
    slotId: `consultation-slot-${record.id}`,
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    dateLabel,
    timeLabel,
    durationMinutes: 120,
    durationLabel: '按报价沟通',
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
  return readDomainJson<ConsultationRecord[]>(storageKey, []);
}

function writeConsultations(records: ConsultationRecord[]) {
  writeDomainJson(storageKey, records);
}
