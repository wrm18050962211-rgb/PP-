import type { AppOrder, FeedPost, PostImage } from '../types/api';
import { readDomainJson, writeDomainJson } from './scopedStorage';

export type WorkActor = 'creator' | 'photographer';

export type OrderWorkRecord = {
  orderId: string;
  title: string;
  caption: string;
  imageUrls: string[];
  creatorConfirmed: boolean;
  photographerConfirmed: boolean;
  publishToCreator: boolean;
  publishToPhotographer: boolean;
  changeRequestBy?: WorkActor;
  changeAccepted: boolean;
  updatedAt: string;
};

const storageKey = 'order-workspaces-v1';

export function listOrderWorkRecords(): OrderWorkRecord[] {
  return readDomainJson<OrderWorkRecord[]>(storageKey, []);
}

export function saveOrderWorkRecord(record: OrderWorkRecord) {
  const records = listOrderWorkRecords();
  const nextRecords = [record, ...records.filter((item) => item.orderId !== record.orderId)];
  writeDomainJson(storageKey, nextRecords);
  return nextRecords;
}

export function createOrderWorkRecord(order: AppOrder, seedPost?: FeedPost): OrderWorkRecord {
  return {
    orderId: order.id,
    title: `${order.place} ${order.activityName ?? order.title}`,
    caption: `来自订单 ${order.orderNo} 的共同成片，创作者和摄影师确认后可同步到各自主页。`,
    imageUrls: seedPost?.images.slice(0, 4).map((image) => image.url) ?? [],
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

export function canEditOrderWork(record: OrderWorkRecord) {
  return !isOrderWorkConfirmed(record) || Boolean(record.changeRequestBy && record.changeAccepted);
}

export function orderWorkToFeedPost(record: OrderWorkRecord, order: AppOrder, seedPost: FeedPost): FeedPost {
  const images: PostImage[] = record.imageUrls.map((url, index) => ({
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
  };
}

function isVideoUrl(url: string) {
  return parseDataUrlContentType(url).startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
}

function parseDataUrlContentType(url: string) {
  const match = url.match(/^data:([^;,]+)/);
  return match?.[1] ?? '';
}
