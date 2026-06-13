import type { FeedPost } from '../types/api';
import { getPostTitle } from './feedService';
import { readDomainJson, writeDomainJson } from './scopedStorage';

export type UserCollectionState = {
  likedPostIds: string[];
  favoritePostIds: string[];
  followingIds: string[];
};

const storageKey = 'user-collections-v1';

function seedCollections(posts: FeedPost[]): UserCollectionState {
  return {
    likedPostIds: posts
      .filter((_, index) => index % 2 === 0)
      .slice(0, 12)
      .map((post) => post.id),
    favoritePostIds: posts
      .filter((_, index) => index % 3 === 1 || index % 5 === 0)
      .slice(0, 10)
      .map((post) => post.id),
    followingIds: getDefaultFollowingPeople(posts).map((person) => person.id),
  };
}

export function readUserCollections(posts: FeedPost[]): UserCollectionState {
  const seeded = seedCollections(posts);
  const stored = readDomainJson<Partial<UserCollectionState> | null>(storageKey, null);
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
