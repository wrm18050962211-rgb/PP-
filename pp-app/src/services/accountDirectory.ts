import { listFeedPosts } from './feedService';
import type { UserRole } from '../types/api';

export type TestAccount = {
  id: string;
  role: Extract<UserRole, 'consumer' | 'companion'>;
  phone: string;
  name: string;
  avatar?: string;
  entityId: string;
  postId?: string;
  profilePath: string;
  note: string;
};

export function listTestAccounts(): TestAccount[] {
  const posts = listFeedPosts();
  const creators = posts.map((post, index): TestAccount => {
    const creatorId = `creator-${post.id}`;
    const name = post.companion.isVirtual ? `${post.companion.name} Creator` : `Creator ${index + 1}`;
    return {
      id: `account-${creatorId}`,
      role: 'consumer',
      phone: buildPhone('1391001', index + 1),
      name,
      avatar: post.images[1]?.url || post.images[0]?.url || post.companion.avatar,
      entityId: creatorId,
      postId: post.id,
      profilePath: `/consumer/creator/${creatorId}`,
      note: `发现页作品 ${post.title || post.locationName || post.location}`,
    };
  });

  const photographerMap = new Map<string, TestAccount>();
  posts.forEach((post, index) => {
    const photographer = post.companion;
    if (photographerMap.has(photographer.id)) return;
    photographerMap.set(photographer.id, {
      id: `account-${photographer.id}`,
      role: 'companion',
      phone: buildPhone('1392002', photographerMap.size + 1),
      name: photographer.name,
      avatar: photographer.avatar || photographer.photo || post.images[0]?.url,
      entityId: photographer.id,
      postId: post.id,
      profilePath: `/consumer/photographer/${photographer.id}`,
      note: `摄影师端账号，代表作品 ${post.title || post.locationName || post.location}`,
    });
  });

  return [...creators, ...photographerMap.values()];
}

export function findTestAccountByPhone(phone: string) {
  return listTestAccounts().find((account) => account.phone === phone) ?? null;
}

export function findTestAccountByEntityId(entityId?: string | null) {
  if (!entityId) return null;
  return listTestAccounts().find((account) => account.entityId === entityId) ?? null;
}

function buildPhone(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(4, '0')}`;
}
