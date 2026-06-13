import type { AppOrder, FeedPost, PostImage } from '../types/api';

export type WorkActor = 'creator' | 'photographer';
export type WorkPreviewMode = 'low_res_watermarked' | 'original_released';
export type WorkDeliveryStatus = 'draft' | 'preview_ready' | 'confirmed' | 'disputed' | 'released';

export type OrderWorkRecord = {
  orderId: string;
  title: string;
  caption: string;
  imageUrls: string[];
  originalUrls?: string[];
  previewUrls?: string[];
  watermarkText?: string;
  previewMode?: WorkPreviewMode;
  deliveryStatus?: WorkDeliveryStatus;
  disputeReason?: string;
  creatorConfirmed: boolean;
  photographerConfirmed: boolean;
  publishToCreator: boolean;
  publishToPhotographer: boolean;
  changeRequestBy?: WorkActor;
  changeAccepted: boolean;
  updatedAt: string;
};

const storageKey = 'order-workspaces-v1';
const sharedStorageKey = `pp-cloud-db:shared:${storageKey}`;

export function listOrderWorkRecords(): OrderWorkRecord[] {
  return readSharedWorkRecords();
}

export function saveOrderWorkRecord(record: OrderWorkRecord) {
  const records = listOrderWorkRecords();
  const nextRecords = [normalizeOrderWorkRecord(record), ...records.filter((item) => item.orderId !== record.orderId)];
  writeSharedWorkRecords(nextRecords);
  return nextRecords;
}

export function createOrderWorkRecord(order: AppOrder, seedPost?: FeedPost): OrderWorkRecord {
  const seedUrls = seedPost?.images.slice(0, 4).map((image) => image.url) ?? [];

  return {
    orderId: order.id,
    title: `${order.place} ${order.activityName ?? order.title}`,
    caption: `来自订单 ${order.orderNo} 的共同成片，创作者和摄影师确认后可同步到各自主页。`,
    imageUrls: seedUrls,
    originalUrls: seedUrls,
    previewUrls: seedUrls,
    watermarkText: createWatermarkText(order),
    previewMode: 'low_res_watermarked',
    deliveryStatus: seedUrls.length ? 'preview_ready' : 'draft',
    creatorConfirmed: false,
    photographerConfirmed: false,
    publishToCreator: false,
    publishToPhotographer: false,
    changeAccepted: true,
    updatedAt: new Date().toISOString(),
  };
}

export function isOrderWorkConfirmed(record: OrderWorkRecord) {
  return record.creatorConfirmed && record.photographerConfirmed;
}

export function isOriginalReleased(record: OrderWorkRecord) {
  return isOrderWorkConfirmed(record) || record.deliveryStatus === 'released' || record.previewMode === 'original_released';
}

export function canEditOrderWork(record: OrderWorkRecord) {
  return !isOrderWorkConfirmed(record) || Boolean(record.changeRequestBy && record.changeAccepted);
}

export function getOrderWorkOriginalUrls(record: OrderWorkRecord) {
  return record.originalUrls?.length ? record.originalUrls : record.imageUrls;
}

export function getOrderWorkPreviewUrls(record: OrderWorkRecord) {
  return record.previewUrls?.length ? record.previewUrls : getOrderWorkOriginalUrls(record);
}

export function getOrderWorkDisplayUrls(record: OrderWorkRecord) {
  return isOriginalReleased(record) ? getOrderWorkOriginalUrls(record) : getOrderWorkPreviewUrls(record);
}

export function createWatermarkText(order: AppOrder) {
  return `${order.orderNo} ${order.creatorId ?? order.creatorPhone ?? 'creator'} ${new Date().toLocaleDateString('zh-CN')}`;
}

export function markOrderWorkDisputed(record: OrderWorkRecord, reason: string): OrderWorkRecord {
  return normalizeOrderWorkRecord({
    ...record,
    deliveryStatus: 'disputed',
    previewMode: 'low_res_watermarked',
    disputeReason: reason.trim() || '创作者对水印预览发起争议',
    publishToCreator: false,
    publishToPhotographer: false,
    updatedAt: new Date().toISOString(),
  });
}

export function normalizeOrderWorkRecord(record: OrderWorkRecord): OrderWorkRecord {
  const originalUrls = record.originalUrls?.length ? record.originalUrls : record.imageUrls;
  const previewUrls = record.previewUrls?.length ? record.previewUrls : originalUrls;
  const confirmed = isOrderWorkConfirmed(record);

  return {
    ...record,
    imageUrls: originalUrls,
    originalUrls,
    previewUrls,
    previewMode: confirmed ? 'original_released' : record.previewMode ?? 'low_res_watermarked',
    deliveryStatus: confirmed ? 'confirmed' : record.deliveryStatus ?? (previewUrls.length ? 'preview_ready' : 'draft'),
  };
}

export function orderWorkToFeedPost(record: OrderWorkRecord, order: AppOrder, seedPost: FeedPost): FeedPost {
  const normalized = normalizeOrderWorkRecord(record);
  const images: PostImage[] = getOrderWorkOriginalUrls(normalized).map((url, index) => ({
    id: `${record.orderId}-work-image-${index + 1}`,
    url,
    mediaKind: isVideoUrl(url) ? 'live' : seedPost.images[index]?.mediaKind || 'image',
    videoUrl: isVideoUrl(url) ? url : seedPost.images[index]?.videoUrl,
    posterUrl: seedPost.images[index]?.posterUrl,
    contentType: parseDataUrlContentType(url) || seedPost.images[index]?.contentType,
    width: seedPost.images[index]?.width ?? seedPost.images[0]?.width ?? 900,
    height: seedPost.images[index]?.height ?? seedPost.images[0]?.height ?? 1200,
    sortOrder: index + 1,
    provider: url.startsWith('data:') ? 'local' : seedPost.images[index]?.provider,
  }));

  return {
    ...seedPost,
    id: `order-work-${record.orderId}`,
    title: record.title,
    location: order.place,
    locationName: order.place,
    timeLabel: order.dateLabel || order.time,
    caption: record.caption,
    activity: order.activityName ?? order.title,
    styleTags: Array.from(new Set(['订单成片', '共同确认', ...seedPost.styleTags.slice(0, 2)])),
    images: images.length ? images : seedPost.images,
    creator: order.creatorId
      ? {
          id: order.creatorId,
          name: order.creatorName || order.creatorPhone || '预约用户',
          avatar: seedPost.images[1]?.url || seedPost.images[0]?.url,
          phone: order.creatorPhone,
          source: 'order',
        }
      : undefined,
  };
}

function isVideoUrl(url: string) {
  return parseDataUrlContentType(url).startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}

function parseDataUrlContentType(url: string) {
  const match = url.match(/^data:([^;,]+)/);
  return match?.[1] ?? '';
}

function readSharedWorkRecords(): OrderWorkRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(sharedStorageKey);
    const records = raw ? (JSON.parse(raw) as OrderWorkRecord[]) : [];
    return records.map(normalizeOrderWorkRecord);
  } catch {
    return [];
  }
}

function writeSharedWorkRecords(records: OrderWorkRecord[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(sharedStorageKey, JSON.stringify(records.map(normalizeOrderWorkRecord)));
}
