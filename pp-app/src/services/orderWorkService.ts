import type { AppOrder, FeedPost, PostImage } from '../types/api';

export type WorkActor = 'creator' | 'photographer';
export type WorkCompletionActor = WorkActor | 'auto';
export type WorkPreviewMode = 'low_res_watermarked' | 'original_released';
export type WorkDeliveryStatus = 'draft' | 'preview_ready' | 'confirmed' | 'disputed' | 'released';
export type OrderWorkActivity = {
  id: string;
  actor: WorkActor | 'system';
  action: string;
  summary: string;
  at: string;
};

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
  venueType: string;
  shootTime: string;
  activityCategory: string;
  durationMinutes: number;
  budgetCents: number;
  creatorConfirmed: boolean;
  photographerConfirmed: boolean;
  creatorConfirmedAt?: string;
  photographerConfirmedAt?: string;
  bothConfirmedAt?: string;
  publishToCreator: boolean;
  publishToPhotographer: boolean;
  publishToCreatorAt?: string;
  publishToPhotographerAt?: string;
  changeRequestBy?: WorkActor;
  changeAccepted: boolean;
  collaborationEvents?: OrderWorkActivity[];
  lastEditedBy?: WorkActor;
  lastEditedAt?: string;
  orderCompletedAt?: string;
  orderCompletedBy?: WorkCompletionActor;
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
  const activityCategory = seedPost?.activityCategory ?? normalizeActivityCategory(order.activityName ?? order.title);
  const createdAt = new Date().toISOString();

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
    venueType: seedPost?.venueType ?? inferVenueType(order, seedPost),
    shootTime: seedPost?.shootTime ?? inferShootTime(order, seedPost),
    activityCategory,
    durationMinutes: order.durationMinutes ?? seedPost?.durationMinutes ?? 120,
    budgetCents: order.amountCents ?? seedPost?.budgetCents ?? 0,
    creatorConfirmed: false,
    photographerConfirmed: false,
    publishToCreator: false,
    publishToPhotographer: false,
    changeAccepted: true,
    collaborationEvents: [
      {
        id: createActivityId(),
        actor: 'system',
        action: 'created',
        summary: '创建成片协作空间，双方可共同编辑并查看修改记录。',
        at: createdAt,
      },
    ],
    updatedAt: createdAt,
  };
}

export function isOrderWorkConfirmed(record: OrderWorkRecord) {
  return record.creatorConfirmed && record.photographerConfirmed;
}

export function isOriginalReleased(record: OrderWorkRecord) {
  return Boolean(record.orderCompletedAt) || record.deliveryStatus === 'released';
}

export function canEditOrderWork(record: OrderWorkRecord) {
  return !isOrderWorkConfirmed(record) || Boolean(record.changeRequestBy && record.changeAccepted);
}

export function appendOrderWorkActivity(record: OrderWorkRecord, actor: WorkActor | 'system', action: string, summary: string, at = new Date().toISOString()): OrderWorkRecord {
  return {
    ...record,
    collaborationEvents: [
      {
        id: createActivityId(),
        actor,
        action,
        summary,
        at,
      },
      ...(record.collaborationEvents ?? []),
    ].slice(0, 24),
  };
}

export function completeOrderWork(record: OrderWorkRecord, actor: WorkCompletionActor): OrderWorkRecord {
  const now = new Date().toISOString();
  const summary = actor === 'auto' ? '双方确认超过 24 小时，平台自动确认完成并结算托管尾款。' : '创作者确认完成订单，平台结算托管尾款给摄影师。';
  return normalizeOrderWorkRecord(
    appendOrderWorkActivity(
      {
        ...record,
        orderCompletedAt: now,
        orderCompletedBy: actor,
        previewMode: 'original_released',
        deliveryStatus: 'released',
        updatedAt: now,
      },
      actor === 'auto' ? 'system' : actor,
      'completed',
      summary,
      now,
    ),
  );
}

export function shouldAutoCompleteOrderWork(record: OrderWorkRecord, now = Date.now()) {
  if (!isOrderWorkConfirmed(record) || record.orderCompletedAt) return false;
  const confirmedAt = record.bothConfirmedAt ? Date.parse(record.bothConfirmedAt) : Number.NaN;
  if (!Number.isFinite(confirmedAt)) return false;
  return now - confirmedAt >= 24 * 60 * 60 * 1000;
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
  const completed = Boolean(record.orderCompletedAt) || record.deliveryStatus === 'released';
  const activityCategory = record.activityCategory || normalizeActivityCategory(`${record.title} ${record.caption}`);
  const bothConfirmedAt = confirmed ? record.bothConfirmedAt ?? record.updatedAt ?? new Date().toISOString() : undefined;

  return {
    ...record,
    imageUrls: originalUrls,
    originalUrls,
    previewUrls,
    venueType: record.venueType || inferVenueTypeFromText(`${record.title} ${record.caption}`),
    shootTime: record.shootTime || inferShootTimeFromText(`${record.title} ${record.caption}`),
    activityCategory,
    durationMinutes: record.durationMinutes || 120,
    budgetCents: record.budgetCents || 0,
    bothConfirmedAt,
    collaborationEvents: record.collaborationEvents ?? [],
    previewMode: completed ? 'original_released' : 'low_res_watermarked',
    deliveryStatus: completed ? 'released' : confirmed ? 'confirmed' : record.deliveryStatus ?? (previewUrls.length ? 'preview_ready' : 'draft'),
  };
}

function createActivityId() {
  return `work-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    title: normalized.title,
    location: order.place,
    locationName: order.place,
    timeLabel: order.dateLabel || order.time,
    caption: normalized.caption,
    activity: normalized.activityCategory || order.activityName || order.title,
    venueType: normalized.venueType,
    shootTime: normalized.shootTime,
    activityCategory: normalized.activityCategory,
    durationMinutes: normalized.durationMinutes,
    budgetCents: normalized.budgetCents,
    styleTags: Array.from(new Set(['订单成片', '共同确认', normalized.venueType, normalized.shootTime, normalized.activityCategory, ...seedPost.styleTags.slice(0, 2)].filter(Boolean))),
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

function inferVenueType(order: AppOrder, seedPost?: FeedPost) {
  return inferVenueTypeFromText(`${order.place} ${order.activityName ?? order.title} ${seedPost?.caption ?? ''}`);
}

function inferVenueTypeFromText(value: string) {
  const text = value.toLowerCase();
  if (['室内', '餐厅', '探店', '咖啡', '书店', '展览', '美术馆', '酒店', '影棚', '空间'].some((keyword) => text.includes(keyword.toLowerCase()))) return '室内';
  if (['室外', '街拍', 'citywalk', '旅行', '景点', '公园', '外滩', '武康路', '安福路'].some((keyword) => text.includes(keyword.toLowerCase()))) return '室外';
  return '不限';
}

function inferShootTime(order: AppOrder, seedPost?: FeedPost) {
  return inferShootTimeFromText(`${order.timeLabel ?? order.time} ${seedPost?.timeLabel ?? ''}`);
}

function inferShootTimeFromText(value: string) {
  const hour = Number(value.match(/\d{1,2}/)?.[0]);
  if (Number.isFinite(hour)) {
    if (hour >= 6 && hour < 11) return '早上';
    if (hour >= 11 && hour < 14) return '中午';
    if (hour >= 14 && hour < 18) return '下午';
    return '晚上';
  }
  if (value.includes('早上') || value.includes('上午')) return '早上';
  if (value.includes('中午') || value.includes('午间')) return '中午';
  if (value.includes('下午')) return '下午';
  if (value.includes('晚上') || value.includes('夜景')) return '晚上';
  return '不限';
}

function normalizeActivityCategory(value: string) {
  const text = value.toLowerCase();
  if (['景点', '游客照', '景区', '公园', '外滩', '西湖'].some((keyword) => text.includes(keyword.toLowerCase()))) return '景点游客照';
  if (['探店', '餐厅', '咖啡', '书店', '网红', '吃饭'].some((keyword) => text.includes(keyword.toLowerCase()))) return '网红餐厅拍照';
  if (['街拍', 'citywalk', '城市', '武康路', '安福路'].some((keyword) => text.includes(keyword.toLowerCase()))) return '城市街拍';
  if (['旅行', '跟拍', '路线', '陪逛'].some((keyword) => text.includes(keyword.toLowerCase()))) return '旅行跟拍';
  if (['节日', '生日', '毕业', '纪念', '圣诞', '周年'].some((keyword) => text.includes(keyword.toLowerCase()))) return '节日纪念';
  if (['情侣', '婚纱', '结婚', '婚礼', '订婚', '领证'].some((keyword) => text.includes(keyword.toLowerCase()))) return '情侣/婚纱';
  if (['亲子', '宠物', '猫', '狗', '家庭'].some((keyword) => text.includes(keyword.toLowerCase()))) return '亲子/宠物';
  if (['形象', '证件', '职业', '商务', '品牌', '商业', '头像'].some((keyword) => text.includes(keyword.toLowerCase()))) return '商业形象';
  return '城市街拍';
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
