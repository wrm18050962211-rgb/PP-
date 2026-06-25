import type { UserRole } from '../types/api';
import { listFeedPosts } from './feedService';

export type PublicRole = Extract<UserRole, 'consumer' | 'companion'>;

export type TestAccountIdentity = {
  id: string;
  role: PublicRole;
  phone: string;
  name: string;
  avatar?: string;
  creatorId?: string;
  companionId?: string;
  postId?: string;
  profilePath: string;
  note: string;
};

export function listTestAccounts(): TestAccountIdentity[] {
  const posts = listFeedPosts();
  const baseCreatorPosts = posts.filter((post) => !post.companion.isVirtual);
  const virtualPosts = posts.filter((post) => post.companion.isVirtual);

  const creatorOnly = baseCreatorPosts.map((post, index): TestAccountIdentity => createCreatorIdentity(post, buildPhone('1391001', index + 1), `Creator ${index + 1}`));

  const basePhotographerMap = new Map<string, TestAccountIdentity>();
  baseCreatorPosts.forEach((post) => {
    const photographer = post.companion;
    if (basePhotographerMap.has(photographer.id)) return;
    basePhotographerMap.set(photographer.id, createPhotographerIdentity(post, buildPhone('1392002', basePhotographerMap.size + 1), photographer.name));
  });

  const virtualPhotographers = virtualPosts.map((post, index): TestAccountIdentity => {
    const phone = buildPhone('1393003', index + 1);
    return createPhotographerIdentity(post, phone, post.companion.name);
  });

  return [...creatorOnly, ...basePhotographerMap.values(), ...virtualPhotographers];
}

export function findTestAccountIdentitiesByPhone(phone: string) {
  return listTestAccounts().filter((account) => account.phone === phone);
}

function createCreatorIdentity(post: ReturnType<typeof listFeedPosts>[number], phone: string, name: string): TestAccountIdentity {
  const creatorId = `creator-${post.id}`;
  return {
    id: `account-${creatorId}`,
    role: 'consumer',
    phone,
    name,
    avatar: post.images[1]?.url || post.images[0]?.url || post.companion.avatar,
    creatorId,
    postId: post.id,
    profilePath: `/consumer/creator/${creatorId}`,
    note: `创作者身份，对应发现页作品 ${post.title || post.locationName || post.location}`,
  };
}

function createPhotographerIdentity(post: ReturnType<typeof listFeedPosts>[number], phone: string, name: string): TestAccountIdentity {
  const photographer = post.companion;
  return {
    id: `account-${photographer.id}`,
    role: 'companion',
    phone,
    name,
    avatar: photographer.avatar || photographer.photo || post.images[0]?.url,
    companionId: photographer.id,
    postId: post.id,
    profilePath: `/consumer/photographer/${photographer.id}`,
    note: `摄影师身份，代表作品 ${post.title || post.locationName || post.location}`,
  };
}

function buildPhone(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(4, '0')}`;
}
