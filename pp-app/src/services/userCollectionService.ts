import type { FeedPost } from '../types/api';
import { getPostTitle } from './feedService';
import { readDomainJson, writeDomainJson } from './scopedStorage';
import { getActiveAccountStorageScope } from './authService';
import { listTestAccounts, type PublicRole } from './accountDirectory';

export type UserCollectionState = {
  likedPostIds: string[];
  favoritePostIds: string[];
  followingIds: string[];
};

const storageKey = 'user-collections-v1';

function seedCollections(posts: FeedPost[]): UserCollectionState {
  const account = getActiveTestAccount();
  if (account) return seedAccountCollections(posts, account);

  return {
    likedPostIds: posts.slice(0, 6).map((post) => post.id),
    favoritePostIds: posts.slice(6, 12).map((post) => post.id),
    followingIds: getDefaultFollowingPeople(posts).map((person) => person.id),
  };
}

export function readUserCollections(posts: FeedPost[]): UserCollectionState {
  const seeded = seedCollections(posts);
  const stored = readStoredCollections();
  return {
    likedPostIds: normalizeIds(stored?.likedPostIds, seeded.likedPostIds),
    favoritePostIds: normalizeIds(stored?.favoritePostIds, seeded.favoritePostIds),
    followingIds: normalizeIds(stored?.followingIds, seeded.followingIds),
  };
}

export function writeUserCollections(collections: UserCollectionState) {
  writeDomainJson(storageKey, {
    likedPostIds: uniqueIds(collections.likedPostIds),
    favoritePostIds: uniqueIds(collections.favoritePostIds),
    followingIds: uniqueIds(collections.followingIds),
  });
}

export function isPostLiked(postId: string, posts: FeedPost[]) {
  return readUserCollections(posts).likedPostIds.includes(postId);
}

export function isPostFavorited(postId: string, posts: FeedPost[]) {
  return readUserCollections(posts).favoritePostIds.includes(postId);
}

export function toggleLikedPost(postId: string, posts: FeedPost[]) {
  const collections = readUserCollections(posts);
  const liked = !collections.likedPostIds.includes(postId);
  writeUserCollections({
    ...collections,
    likedPostIds: liked ? [postId, ...collections.likedPostIds] : collections.likedPostIds.filter((id) => id !== postId),
  });
  return liked;
}

export function toggleFavoritePost(postId: string, posts: FeedPost[]) {
  const collections = readUserCollections(posts);
  const favorited = !collections.favoritePostIds.includes(postId);
  writeUserCollections({
    ...collections,
    favoritePostIds: favorited ? [postId, ...collections.favoritePostIds] : collections.favoritePostIds.filter((id) => id !== postId),
  });
  return favorited;
}

export function getLikedPosts(posts: FeedPost[]) {
  const ids = readUserCollections(posts).likedPostIds;
  return ids.map((id) => posts.find((post) => post.id === id)).filter((post): post is FeedPost => Boolean(post));
}

export function getFavoritePosts(posts: FeedPost[]) {
  const ids = readUserCollections(posts).favoritePostIds;
  return ids.map((id) => posts.find((post) => post.id === id)).filter((post): post is FeedPost => Boolean(post));
}

export function getFollowingPeople(posts: FeedPost[]) {
  const people = getDefaultFollowingPeople(posts);
  const ids = readUserCollections(posts).followingIds;
  return ids.map((id) => people.find((person) => person.id === id)).filter((person): person is ReturnType<typeof getDefaultFollowingPeople>[number] => Boolean(person));
}

export function getPostLikeCount(postId: string, posts: FeedPost[]) {
  return getAllVirtualCollections(posts).filter((collections) => collections.likedPostIds.includes(postId)).length;
}

export function getPostFavoriteCount(postId: string, posts: FeedPost[]) {
  return getAllVirtualCollections(posts).filter((collections) => collections.favoritePostIds.includes(postId)).length;
}

export function getFollowerCountForPerson(personId: string, posts: FeedPost[]) {
  return getAllVirtualCollections(posts).filter((collections) => collections.followingIds.includes(personId)).length;
}

function getDefaultFollowingPeople(posts: FeedPost[]) {
  const photographers = Array.from(new Map(posts.map((post) => [post.companion.id, post.companion])).values())
    .slice(0, 4)
    .map((photographer) => ({
      id: `photographer-${photographer.id}`,
      kind: '摄影师' as const,
      name: photographer.name,
      avatar: photographer.avatar || photographer.photo,
      meta: photographer.areas.slice(0, 2).join(' / '),
      to: `/consumer/photographer/${photographer.id}`,
    }));

  const creators = posts.slice(0, 4).map((post) => {
    const creator = buildCreatorSummary(post);
    return {
      id: creator.id,
      kind: '创作者' as const,
      name: creator.name,
      avatar: creator.avatar,
      meta: getPostTitle(post),
      to: `/consumer/creator/${creator.id}`,
    };
  });

  return [...photographers, ...creators];
}

function seedAccountCollections(posts: FeedPost[], account: { role: PublicRole; postId?: string; companionId?: string; creatorId?: string; phone: string }) {
  const ownPost = account.postId ? posts.find((post) => post.id === account.postId) : undefined;
  const ownCompanionId = account.companionId ?? ownPost?.companion.id;
  const ownCreatorId = account.creatorId ?? (ownPost ? `creator-${ownPost.id}` : undefined);
  const accountSeed = numberSeed(`${account.phone}:${account.role}:${account.postId ?? account.companionId ?? account.creatorId ?? 'guest'}`);
  const candidates = rotatePosts(
    posts.filter((post) => post.id !== ownPost?.id && post.companion.id !== ownCompanionId),
    accountSeed,
  );
  const likedPostIds = pickRealPostIds(candidates, account.role === 'companion' ? 5 : 7);
  const favoriteSource = candidates.filter((post) => !likedPostIds.includes(post.id));
  const favoritePostIds = pickRealPostIds(rotatePosts(favoriteSource, accountSeed + 3), account.role === 'companion' ? 4 : 6);
  const people = getDefaultFollowingPeople(posts).filter((person) => person.id !== ownCreatorId && person.id !== `photographer-${ownCompanionId}`);
  const followingIds = rotateItems(people, accountSeed + 5)
    .slice(0, account.role === 'companion' ? 5 : 7)
    .map((person) => person.id);

  return {
    likedPostIds,
    favoritePostIds,
    followingIds,
  };
}

function getAllVirtualCollections(posts: FeedPost[]): UserCollectionState[] {
  const activeAccount = getActiveTestAccount();
  const activeStored = readStoredCollections();
  return listTestAccounts().map((account) => {
    if (activeAccount && activeStored && account.id === activeAccount.id) {
      const seeded = seedAccountCollections(posts, account);
      return {
        likedPostIds: normalizeIds(activeStored.likedPostIds, seeded.likedPostIds),
        favoritePostIds: normalizeIds(activeStored.favoritePostIds, seeded.favoritePostIds),
        followingIds: normalizeIds(activeStored.followingIds, seeded.followingIds),
      };
    }
    return seedAccountCollections(posts, account);
  });
}

function readStoredCollections() {
  return readDomainJson<Partial<UserCollectionState> | null>(storageKey, null);
}

function getActiveTestAccount() {
  const [phone, role, identityId] = getActiveAccountStorageScope().split(':') as [string, PublicRole | undefined, string | undefined];
  if (!phone || (role !== 'consumer' && role !== 'companion')) return null;
  return (
    listTestAccounts().find((account) => {
      const currentIdentityId = role === 'companion' ? account.companionId : account.creatorId;
      return account.phone === phone && account.role === role && currentIdentityId === identityId;
    }) ?? null
  );
}

function pickRealPostIds(posts: FeedPost[], count: number) {
  return posts.slice(0, count).map((post) => post.id);
}

function rotatePosts(posts: FeedPost[], offset: number) {
  return rotateItems(posts, offset);
}

function rotateItems<T>(items: T[], offset: number) {
  if (items.length === 0) return [];
  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function numberSeed(value: string) {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function buildCreatorSummary(post: FeedPost) {
  return {
    id: `creator-${post.id}`,
    name: post.companion.isVirtual ? `${post.companion.name} Creator` : '作品创作者',
    avatar: post.images[1]?.url || post.companion.photo || post.companion.avatar,
  };
}

function normalizeIds(stored: string[] | undefined, fallback: string[]) {
  return stored ? uniqueIds(stored) : fallback;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}
