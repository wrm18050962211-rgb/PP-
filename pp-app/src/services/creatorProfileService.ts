import type { AuthSession, FeedPost, UserRole } from '../types/api';
import { readDomainJson, writeDomainJson } from './scopedStorage';

export type CreatorProfileDraft = {
  creatorId: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  updatedAt: string;
};

const storageKey = 'creator-profile-v1';

export function readCreatorProfile(role?: UserRole) {
  return readDomainJson<CreatorProfileDraft | null>(storageKey, null, role);
}

export function saveCreatorProfile(profile: CreatorProfileDraft, role?: UserRole) {
  writeDomainJson(storageKey, { ...profile, updatedAt: new Date().toISOString() }, role);
}

export function createDefaultCreatorProfile(session: AuthSession | null, post: FeedPost): CreatorProfileDraft {
  const creator = getCreatorIdentity(post);
  return {
    creatorId: session?.user.id || creator.id,
    displayName: session?.user.nickname && session.user.nickname !== 'Demo Consumer' ? session.user.nickname : creator.name,
    avatarUrl: session?.user.avatarUrl || creator.avatar,
    bio: buildDefaultCreatorBio(post),
    updatedAt: new Date().toISOString(),
  };
}

export function applyCreatorProfile<T extends { id: string; name: string; avatar: string }>(creator: T, profile: CreatorProfileDraft | null) {
  if (!profile || profile.creatorId !== creator.id) return creator;
  return {
    ...creator,
    name: profile.displayName || creator.name,
    avatar: profile.avatarUrl || creator.avatar,
  };
}

export function getCreatorBio(post: FeedPost, profile: CreatorProfileDraft | null) {
  const creator = getCreatorIdentity(post);
  if (profile?.creatorId === creator.id && profile.bio.trim()) return profile.bio.trim();
  return buildDefaultCreatorBio(post);
}

export function getCreatorIdentity(post: FeedPost) {
  if (post.creator) {
    return {
      id: post.creator.id,
      name: post.creator.name,
      avatar: post.creator.avatar || post.images[1]?.url || post.images[0]?.url || post.companion.avatar,
    };
  }

  return {
    id: `creator-${post.id}`,
    name: post.companion.isVirtual ? `${post.companion.name} Creator` : '作品创作者',
    avatar: post.images[1]?.url || post.companion.photo || post.companion.avatar,
  };
}

function buildDefaultCreatorBio(post: FeedPost) {
  const tags = post.styleTags.slice(0, 2).join(' / ');
  const location = post.locationName || post.location;
  return `${location} · ${tags || '创作样片'}。喜欢用作品记录路线、场景和可复拍的风格。`;
}
