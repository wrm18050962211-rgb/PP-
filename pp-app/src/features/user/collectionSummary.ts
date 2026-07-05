import { Bookmark, Heart, UserRound } from 'lucide-react';
import { getFavoritePosts, getFollowingPeople, getLikedPosts } from '../../services/userCollectionService';
import type { FeedPost } from '../../types/api';
import type { UserCollectionBasePath } from './UserCollectionPage';

export function getCollectionSummary(posts: FeedPost[], basePath: UserCollectionBasePath = '/consumer') {
  return [
    { icon: Heart, label: '我的喜欢', value: getLikedPosts(posts).length, to: `${basePath}/likes` },
    { icon: Bookmark, label: '我的收藏', value: getFavoritePosts(posts).length, to: `${basePath}/favorites` },
    { icon: UserRound, label: '我的关注', value: getFollowingPeople(posts).length, to: `${basePath}/following` },
  ];
}
