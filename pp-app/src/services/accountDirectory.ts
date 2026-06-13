import type { UserRole } from '../types/api';
import { listFeedPosts } from './feedService';

export type PublicRole = Extract<UserRole, 'consumer' | 'companion'>;

export type TestAccount = {
  id: string;
  roles: PublicRole[];
  defaultRole: PublicRole;
  phone: string;
  name: string;
  avatar?: string;
  creatorId?: string;
  companionId?: string;
  postId?: string;
  profilePath: string;
  note: string;
};

export function listTestAccounts(): TestAccount[] {
  const posts = listFeedPosts();
  const baseCreatorPosts = posts.filter((post) => !post.companion.isVirtual);
  const virtualPosts = posts.filter((post) => post.companion.isVirtual);

  const creatorOnly = baseCreatorPosts.map((post, index): TestAccount => {
    const creatorId = `creator-${post.id}`;
    return {
      id: `account-${creatorId}`,
      roles: ['consumer'],
      defaultRole: 'consumer',
      phone: buildPhone('1391001', index + 1),
      name: `Creator ${index + 1}`,
      avatar: post.images[1]?.url || post.images[0]?.url || post.companion.avatar,
      creatorId,
      postId: post.id,
      profilePath: `/consumer/creator/${creatorId}`,
      note: `创作者账号，对应发现页作品 ${post.title || post.locationName || post.location}`,
    };
  });

  const basePhotographerMap = new Map<string, TestAccount>();
  baseCreatorPosts.forEach((post) => {
    const photographer = post.companion;
    if (basePhotographerMap.has(photographer.id)) return;
    basePhotographerMap.set(photographer.id, {
      id: `account-${photographer.id}`,
      roles: ['companion'],
      defaultRole: 'companion',
      phone: buildPhone('1392002', basePhotographerMap.size + 1),
      name: photographer.name,
      avatar: photographer.avatar || photographer.photo || post.images[0]?.url,
      companionId: photographer.id,
      postId: post.id,
      profilePath: `/consumer/photographer/${photographer.id}`,
      note: `摄影师账号，代表作品 ${post.title || post.locationName || post.location}`,
    });
  });

  const dualRole = virtualPosts.map((post, index): TestAccount => {
    const photographer = post.companion;
    const creatorId = `creator-${post.id}`;
    return {
      id: `account-both-${photographer.id}`,
      roles: ['consumer', 'companion'],
      defaultRole: 'consumer',
      phone: buildPhone('1393003', index + 1),
      name: photographer.name,
      avatar: photographer.avatar || photographer.photo || post.images[1]?.url,
      creatorId,
      companionId: photographer.id,
      postId: post.id,
      profilePath: `/consumer/creator/${creatorId}`,
      note: `双身份账号，可作为创作者 ${photographer.name} Creator，也可作为摄影师 ${photographer.name}`,
    };
  });

  return [...creatorOnly, ...basePhotographerMap.values(), ...dualRole];
}

export function findTestAccountByPhone(phone: string) {
  return listTestAccounts().find((account) => account.phone === phone) ?? null;
}

function buildPhone(prefix: string, index: number) {
  return `${prefix}${String(index).padStart(4, '0')}`;
}
