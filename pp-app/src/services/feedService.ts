import { feedPosts } from '../data/mockApi';
import type { FeedPost } from '../types/api';
import { apiGet, isApiEnabled } from './apiClient';

export function listFeedPosts(): FeedPost[] {
  return extendedFeedPosts;
}

export function getPostDetail(postId?: string): FeedPost {
  return extendedFeedPosts.find((post) => post.id === postId) ?? extendedFeedPosts[0];
}

export async function fetchFeedPosts(): Promise<FeedPost[]> {
  if (!isApiEnabled()) return listFeedPosts();

  try {
    const response = await apiGet<{ items: FeedPost[] }>('/api/feed/posts');
    return response.success ? response.data.items : listFeedPosts();
  } catch {
    return listFeedPosts();
  }
}

const extendedFeedPosts: FeedPost[] = [
  ...feedPosts,
  {
    ...feedPosts[0],
    id: '00000000-0000-0000-0000-000000000704',
    location: '上海 · 安福路书店',
    timeLabel: '上午 / 阴天柔光 / 2026年5月',
    caption: '书店门口和街角橱窗适合安静一点的照片，不需要太多夸张动作。',
    activity: '街区陪拍',
    styleTags: ['文艺', '自然光', '安静感'],
    images: [
      {
        id: '00000000-0000-0000-0000-000000000741',
        url: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
        width: 900,
        height: 1200,
        sortOrder: 1,
      },
      {
        id: '00000000-0000-0000-0000-000000000742',
        url: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80',
        width: 900,
        height: 1200,
        sortOrder: 2,
      },
    ],
  },
  {
    ...feedPosts[1],
    id: '00000000-0000-0000-0000-000000000705',
    location: '上海 · 新天地弄堂',
    timeLabel: '下午 / 周五 / 2026年5月',
    caption: '红砖、窄巷和玻璃橱窗层次很多，适合一组干净利落的城市照片。',
    activity: '逛街拍照',
    styleTags: ['城市感', '街拍', '小红书'],
    images: [
      {
        id: '00000000-0000-0000-0000-000000000751',
        url: 'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=80',
        width: 900,
        height: 1200,
        sortOrder: 1,
      },
      {
        id: '00000000-0000-0000-0000-000000000752',
        url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
        width: 900,
        height: 1200,
        sortOrder: 2,
      },
    ],
  },
  {
    ...feedPosts[2],
    id: '00000000-0000-0000-0000-000000000706',
    location: '上海 · 苏州河',
    timeLabel: '蓝调时刻 / 工作日 / 2026年5月',
    caption: '水边步道适合慢慢走，蓝调时刻能拍出更干净的城市轮廓。',
    activity: '夜景散步',
    styleTags: ['蓝调', '夜景', '散步'],
    images: [
      {
        id: '00000000-0000-0000-0000-000000000761',
        url: 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=900&q=80',
        width: 900,
        height: 1200,
        sortOrder: 1,
      },
      {
        id: '00000000-0000-0000-0000-000000000762',
        url: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=80',
        width: 900,
        height: 1200,
        sortOrder: 2,
      },
    ],
  },
];

export async function fetchPostDetail(postId?: string): Promise<FeedPost> {
  if (!isApiEnabled() || !postId) return getPostDetail(postId);

  try {
    const response = await apiGet<FeedPost>(`/api/posts/${postId}`);
    return response.success ? response.data : getPostDetail(postId);
  } catch {
    return getPostDetail(postId);
  }
}
