import { companions, feedPosts } from '../data/mockApi';
import type { ActivityPricing, AvailabilitySlot, Companion, CompanionExtra, FeedPost, PublishedWorkDraft } from '../types/api';
import { apiGet, isApiEnabled } from './apiClient';

export type FeedPageRequest = {
  limit?: number;
  cursor?: string | null;
  city?: string;
};

export type FeedPostPage = {
  items: FeedPost[];
  nextCursor: string | null;
  hasMore: boolean;
};

const defaultFeedPageSize = 18;
const maxFeedPageSize = 50;

export function listFeedPosts(): FeedPost[] {
  return getExtendedFeedPosts().map(withPostTitle);
}

export function listFeedPostPage(options: FeedPageRequest = {}): FeedPostPage {
  const { limit, cursor, city } = normalizeFeedPageRequest(options);
  const cityKeyword = city.trim().toLowerCase();
  const source = listFeedPosts().filter((post) => {
    if (!cityKeyword) return true;
    return [post.city, post.location, post.locationName].filter(Boolean).join(' ').toLowerCase().includes(cityKeyword);
  });
  const start = parseFeedCursor(cursor);
  const items = source.slice(start, start + limit);
  const nextOffset = start + items.length;

  return {
    items,
    nextCursor: nextOffset < source.length ? String(nextOffset) : null,
    hasMore: nextOffset < source.length,
  };
}

export function getPostDetail(postId?: string): FeedPost {
  const extendedFeedPosts = listFeedPosts();
  return extendedFeedPosts.find((post) => post.id === postId) ?? extendedFeedPosts[0];
}

export function buildApprovedWorkPost(workDraft: PublishedWorkDraft): FeedPost | null {
  if (workDraft.reviewStatus !== '已通过' || workDraft.images.length === 0) return null;

  const images = [...workDraft.images]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((image, index) => ({ ...image, sortOrder: index + 1 }));
  const coverIndex = Math.max(
    0,
    images.findIndex((image) => image.id === workDraft.coverImageId),
  );
  const [coverImage] = images.splice(coverIndex, 1);

  return {
    id: 'local-approved-work',
    title: getPostTitle({
      location: workDraft.location,
      caption: workDraft.caption,
      activity: workDraft.activity,
      styleTags: workDraft.tags,
    }),
    location: workDraft.location,
    timeLabel: workDraft.timeLabel,
    caption: workDraft.caption,
    styleTags: workDraft.tags,
    activity: workDraft.activity,
    images: coverImage ? [coverImage, ...images] : images,
    companion: companions[0],
  };
}

export function mergeApprovedWorkIntoFeed(posts: FeedPost[], workDraft: PublishedWorkDraft): FeedPost[] {
  const approvedPost = buildApprovedWorkPost(workDraft);
  if (!approvedPost) return posts;

  return [approvedPost, ...posts.filter((post) => post.id !== approvedPost.id)];
}

export async function fetchFeedPostPage(options: FeedPageRequest = {}): Promise<FeedPostPage> {
  if (!isApiEnabled()) return listFeedPostPage(options);

  try {
    const response = await apiGet<FeedPostPage>(buildFeedPostsPath(options));
    return response.success
      ? {
          items: response.data.items.map(withPostTitle),
          nextCursor: response.data.nextCursor ?? null,
          hasMore: Boolean(response.data.hasMore),
        }
      : listFeedPostPage(options);
  } catch {
    return listFeedPostPage(options);
  }
}

export async function fetchFeedPosts(): Promise<FeedPost[]> {
  const page = await fetchFeedPostPage({ limit: maxFeedPageSize });
  return page.items;
}

export function getPostTitle(post: Partial<FeedPost>): string {
  const explicitTitle = post.title?.trim();
  if (explicitTitle) return explicitTitle;

  const location = getShortPostLocation(post);
  const style = post.activity || post.styleTags?.[0] || '';
  const captionLead = getCaptionLead(post.caption);
  return [location, style].filter(Boolean).join(' ') || captionLead || '作品样板';
}

function withPostTitle(post: FeedPost): FeedPost {
  const title = getPostTitle(post);
  return post.title === title ? post : { ...post, title };
}

function normalizeFeedPageRequest(options: FeedPageRequest) {
  return {
    limit: clampFeedLimit(options.limit),
    cursor: options.cursor ?? null,
    city: options.city ?? '',
  };
}

function clampFeedLimit(limit?: number) {
  if (!Number.isFinite(limit)) return defaultFeedPageSize;
  return Math.max(1, Math.min(Math.floor(limit as number), maxFeedPageSize));
}

function parseFeedCursor(cursor?: string | null) {
  const offset = Number.parseInt(cursor || '0', 10);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function buildFeedPostsPath(options: FeedPageRequest) {
  const request = normalizeFeedPageRequest(options);
  const params = new URLSearchParams();
  params.set('limit', String(request.limit));
  if (request.cursor) params.set('cursor', request.cursor);
  if (request.city) params.set('city', request.city);
  return `/api/feed/posts?${params.toString()}`;
}

function getShortPostLocation(post: Partial<FeedPost>) {
  const raw = post.locationName || post.location || post.companion?.areas?.[0] || '';
  return raw
    .replace(/^上海\s*[·\-｜|路]\s*/, '')
    .split(/[·\-｜|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .pop() || raw.trim();
}

function getCaptionLead(caption?: string) {
  return (caption ?? '')
    .split(/[，。,.]/)[0]
    .trim()
    .slice(0, 16);
}

function getExtendedFeedPosts(): FeedPost[] {
  return [
  ...feedPosts,
  ...createVirtualTransactionPosts(),
  ...createVirtualFeedPosts(),
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
}

function createVirtualTransactionPosts(): FeedPost[] {
  const trades = [
    {
      id: 'virtual-trade-post-1',
      companion: companions[0],
      creator: {
        id: 'creator-00000000-0000-0000-0000-000000000701',
        name: 'Creator 1',
        avatar: feedPosts[0].images[1]?.url || feedPosts[0].images[0]?.url,
        phone: '13910010001',
        source: 'order',
      },
      location: '上海 · 武康路',
      timeLabel: '订单成片 / 今天 17:30',
      activity: 'Citywalk',
      caption: 'Creator 1 和 Mori 完成的 Citywalk 成片，保留街角自然光、走动抓拍和低干扰沟通节奏。',
      styleTags: ['订单成片', 'Citywalk', '自然光', '共同确认'],
      images: [
        image('virtual-trade-post-1-image-1', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80', 900, 1200, 1),
        image('virtual-trade-post-1-image-2', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80', 900, 1200, 2),
      ],
    },
    {
      id: 'virtual-trade-post-2',
      companion: companions[1],
      creator: {
        id: 'creator-00000000-0000-0000-0000-000000000702',
        name: 'Creator 2',
        avatar: feedPosts[1].images[1]?.url || feedPosts[1].images[0]?.url,
        phone: '13910010002',
        source: 'order',
      },
      location: '上海 · 巨鹿路',
      timeLabel: '订单成片 / 昨天 15:30',
      activity: '探店生活照',
      caption: 'Creator 2 和 Nana 的探店订单成片，咖啡店窗边光、桌面层次和日常穿搭都已双方确认。',
      styleTags: ['订单成片', '探店', '日常感', '共同确认'],
      images: [
        image('virtual-trade-post-2-image-1', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80', 900, 1200, 1),
        image('virtual-trade-post-2-image-2', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80', 900, 1200, 2),
      ],
    },
    {
      id: 'virtual-trade-post-3',
      companion: companions[2],
      creator: {
        id: 'creator-00000000-0000-0000-0000-000000000703',
        name: 'Creator 3',
        avatar: feedPosts[2].images[1]?.url || feedPosts[2].images[0]?.url,
        phone: '13910010003',
        source: 'order',
      },
      location: '上海 · 外滩',
      timeLabel: '订单成片 / 6月11日 19:30',
      activity: '夜景散步',
      caption: 'Creator 3 和 Echo 的夜景散步订单成片，蓝调时刻、江边线条和补光人像已完成共同编辑。',
      styleTags: ['订单成片', '夜景', '蓝调', '共同确认'],
      images: [
        image('virtual-trade-post-3-image-1', 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=1200&q=80', 1200, 800, 1),
        image('virtual-trade-post-3-image-2', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=80', 900, 1200, 2),
      ],
    },
    {
      id: 'virtual-trade-post-4',
      companion: companions[0],
      creator: {
        id: 'creator-00000000-0000-0000-0000-000000000704',
        name: 'Creator 4',
        avatar: feedPosts[0].images[0]?.url,
        phone: '13910010004',
        source: 'order',
      },
      location: '上海 · 安福路',
      timeLabel: '订单成片 / 6月10日 10:00',
      activity: '书店街拍',
      caption: 'Creator 4 和 Mori 的安福路书店街拍，门窗、书店外立面和阴天柔光适合做主页作品。',
      styleTags: ['订单成片', '街拍', '文艺', '共同确认'],
      images: [
        image('virtual-trade-post-4-image-1', 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80', 900, 1200, 1),
        image('virtual-trade-post-4-image-2', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80', 900, 1200, 2),
      ],
    },
  ] satisfies FeedPost[];

  return trades.map((post) => ({ ...post, city: '上海', locationName: post.location }));
}

function image(id: string, url: string, width: number, height: number, sortOrder: number) {
  return { id, url, width, height, sortOrder, mediaKind: 'image' };
}

const virtualProfiles = [
  {
    name: 'Luna',
    gender: 'female',
    area: '武康路',
    areas: ['武康路', '安福路', '湖南路', '衡山路'],
    activity: 'Citywalk 陪拍',
    tags: ['自然抓拍', '会指导动作', '适合第一次拍照'],
    styleTags: ['Citywalk', '自然光', '松弛感'],
    bio: '偏温柔沟通，会先帮你确认穿搭和路线，现场以自然走动抓拍为主。',
    priceCents: 39900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Aki',
    gender: 'female',
    area: '巨鹿路',
    areas: ['巨鹿路', '富民路', '长乐路', '静安寺'],
    activity: '探店生活照',
    tags: ['探店构图', '小红书风格', '穿搭建议'],
    styleTags: ['探店', '日常感', '咖啡店'],
    bio: '熟悉咖啡店和街角光线，适合想要轻松日常头像和朋友圈照片的用户。',
    priceCents: 32900,
    durationMinutes: 90,
    image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Rin',
    gender: 'female',
    area: '新天地',
    areas: ['新天地', '淮海中路', '思南路', '复兴公园'],
    activity: '城市街拍',
    tags: ['都市感', '干净构图', '情绪引导'],
    styleTags: ['城市感', '街拍', '高级感'],
    bio: '擅长红砖、玻璃、街巷背景，适合想要利落一点的城市人像。',
    priceCents: 42900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1526510747491-58f928ec870f?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Mika',
    gender: 'female',
    area: '苏州河',
    areas: ['苏州河', '外滩源', '北外滩', '南京东路'],
    activity: '夜景散步',
    tags: ['夜景路线熟', '安全提醒', '游客友好'],
    styleTags: ['夜景', '蓝调', '旅行感'],
    bio: '熟悉夜景人流和安全路线，会提醒集合点、动线和收尾时间。',
    priceCents: 29900,
    durationMinutes: 60,
    image: 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Yoyo',
    gender: 'female',
    area: '徐家汇',
    areas: ['徐家汇', '衡山路', '徐汇滨江', '天平路'],
    activity: '校园感写真',
    tags: ['清新风格', '笑容引导', '适合学生党'],
    styleTags: ['清新', '校园感', '自然光'],
    bio: '偏清爽自然的照片，会帮助缓解镜头尴尬，适合学生和毕业季。',
    priceCents: 26900,
    durationMinutes: 90,
    image: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Cici',
    gender: 'female',
    area: '外滩',
    areas: ['外滩', '外白渡桥', '圆明园路', '南京东路'],
    activity: '旅行跟拍',
    tags: ['游客路线', '地标机位', '出片效率高'],
    styleTags: ['旅行', '地标', '明亮'],
    bio: '适合来上海短暂停留的游客，路线紧凑，优先保证地标合影和自然抓拍。',
    priceCents: 69900,
    durationMinutes: 240,
    image: 'https://images.unsplash.com/photo-1502325966718-85a90488dc29?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Niko',
    gender: 'male',
    area: '愚园路',
    areas: ['愚园路', '中山公园', '江苏路', '番禺路'],
    activity: '男生头像',
    tags: ['男生友好', '不尴尬', '街头感'],
    styleTags: ['街头', '头像', '松弛'],
    bio: '适合男生头像、社交主页照片，会用简单指令减少摆拍感。',
    priceCents: 29900,
    durationMinutes: 90,
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Sora',
    gender: 'female',
    area: '静安寺',
    areas: ['静安寺', '南京西路', '铜仁路', '常德路'],
    activity: '通勤形象照',
    tags: ['职业形象', '干净背景', '效率高'],
    styleTags: ['通勤', '简洁', '职业感'],
    bio: '适合 LinkedIn、简历、商务社交头像，路线会避开过度游客化背景。',
    priceCents: 45900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Peach',
    gender: 'female',
    area: '滨江',
    areas: ['徐汇滨江', '龙美术馆', '油罐艺术中心', '西岸'],
    activity: '宠物友好陪拍',
    tags: ['宠物友好', '耐心等待', '户外路线'],
    styleTags: ['宠物', '户外', '暖色'],
    bio: '可以陪同宠物出镜，节奏会留出休息和互动时间，适合轻松户外照。',
    priceCents: 36900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Bean',
    gender: 'female',
    area: '田子坊',
    areas: ['田子坊', '打浦桥', '瑞金二路', '思南路'],
    activity: '复古胶片感',
    tags: ['复古色调', '老街路线', '情绪片'],
    styleTags: ['复古', '胶片感', '老街'],
    bio: '偏复古和情绪表达，会选择老街、门窗、墙面做背景，适合安静风格。',
    priceCents: 39900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Noir',
    gender: 'male',
    area: '西岸',
    areas: ['西岸', '龙美术馆', '油罐艺术中心', '徐汇滨江'],
    activity: '黑白大片',
    tags: ['黑白构图', '广告感', '会指导姿态'],
    styleTags: ['黑白', '杂志感', '大片'],
    bio: '偏广告大片和黑白情绪，会把建筑线条、人物姿态和留白一起设计。',
    priceCents: 52900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Iris',
    gender: 'female',
    area: '安福路',
    areas: ['安福路', '武康路', '湖南路', '常熟路'],
    activity: '时装街拍',
    tags: ['穿搭友好', '街拍比例', '背景干净'],
    styleTags: ['时装', '街拍', '黑白'],
    bio: '适合穿搭记录和主理人形象照，会控制背景干净度和人物比例。',
    priceCents: 48900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'June',
    gender: 'female',
    area: '龙美术馆',
    areas: ['龙美术馆', '西岸', '徐汇滨江', '油罐艺术中心'],
    activity: '艺术馆大片',
    tags: ['极简空间', '大片留白', '安静引导'],
    styleTags: ['艺术馆', '大片', '极简'],
    bio: '偏极简展馆和大面积留白，适合冷静、干净、像广告图的作品。',
    priceCents: 55900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=240&q=80',
  },
  {
    name: 'Vera',
    gender: 'female',
    area: '前滩',
    areas: ['前滩', '东方体育中心', '后滩', '世博源'],
    activity: '都市广告感',
    tags: ['广告感', '都市光影', '干净构图'],
    styleTags: ['广告感', '都市', '黑白'],
    bio: '用玻璃幕墙、台阶和光影做画面，适合想要更成熟质感的用户。',
    priceCents: 49900,
    durationMinutes: 120,
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80',
  },
] as const;

const virtualLandscapeIndexes = new Set([1, 4, 7, 10, 13, 16]);
const virtualLandscapeImages = [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1200&q=80',
] as const;

const virtualLiveVideoUrls = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
] as const;

function createVirtualPostImages(postId: string, profile: (typeof virtualProfiles)[number], index: number) {
  const isLandscape = virtualLandscapeIndexes.has(index);
  const isLive = index % 4 === 1 || index % 7 === 0;
  const landscapeImageIndex = Math.floor(index / 3) % virtualLandscapeImages.length;
  const coverUrl = isLandscape ? virtualLandscapeImages[landscapeImageIndex] : profile.image;
  const liveVideoUrl = virtualLiveVideoUrls[index % virtualLiveVideoUrls.length];
  return [
    {
      id: `${postId}-image-1`,
      url: coverUrl,
      mediaKind: isLive ? 'live' : 'image',
      videoUrl: isLive ? liveVideoUrl : undefined,
      posterUrl: coverUrl,
      width: isLandscape ? 1200 : 900,
      height: isLandscape ? 800 : 1200,
      sortOrder: 1,
    },
    { id: `${postId}-image-2`, url: profile.avatar, mediaKind: 'image', width: 900, height: 1200, sortOrder: 2 },
  ];
}

function createVirtualFeedPosts(): FeedPost[] {
  return virtualProfiles.map((profile, index): FeedPost => {
    const companion = createVirtualCompanion(profile, index);
    const postId = `virtual-post-${index + 1}`;
    return {
      id: postId,
      location: `上海 · ${profile.area}`,
      timeLabel: `${index % 2 === 0 ? '下午' : '傍晚'} / 虚拟样例 / 可替换资料`,
      caption: `${profile.bio} 这是一条虚拟陪拍者样例资料，用于填充页面和调试预约流程。`,
      styleTags: [...profile.styleTags, '虚拟样例'],
      activity: profile.activity,
      images: createVirtualPostImages(postId, profile, index),
      companion,
    };
  });
}

function createVirtualCompanion(profile: (typeof virtualProfiles)[number], index: number): Companion {
  return {
    id: `virtual-companion-${index + 1}`,
    userId: `virtual-user-${index + 1}`,
    name: profile.name,
    isVirtual: true,
    avatar: profile.avatar,
    photo: profile.image,
    bio: profile.bio,
    gender: profile.gender,
    baseCity: '上海',
    status: 'approved',
    serviceEnabled: true,
    ratingAvg: 4.6 + (index % 4) / 10,
    ratingCount: 8 + index * 3,
    tags: [...profile.tags],
    safetyBadges: ['虚拟样例', '资料待替换', '流程演示'],
    areas: [...profile.areas],
    slots: createVirtualSlots(index),
    activities: createVirtualActivities(profile, index),
    extras: createVirtualExtras(index),
  };
}

function createVirtualSlots(index: number): AvailabilitySlot[] {
  const day = 28 + (index % 5);
  const hour = 10 + (index % 7);
  return [
    virtualSlot(index, 1, `明天 ${hour}:00`, `2026-05-${String(day).padStart(2, '0')}T${String(hour - 8).padStart(2, '0')}:00:00.000Z`, `2026-05-${String(day).padStart(2, '0')}T${String(hour - 6).padStart(2, '0')}:00:00.000Z`),
    virtualSlot(index, 2, `周五 ${hour + 2}:30`, `2026-05-${String(day + 1).padStart(2, '0')}T${String(hour - 6).padStart(2, '0')}:30:00.000Z`, `2026-05-${String(day + 1).padStart(2, '0')}T${String(hour - 4).padStart(2, '0')}:30:00.000Z`),
    virtualSlot(index, 3, `周末 ${hour + 4}:00`, `2026-06-${String((index % 3) + 1).padStart(2, '0')}T${String(hour - 4).padStart(2, '0')}:00:00.000Z`, `2026-06-${String((index % 3) + 1).padStart(2, '0')}T${String(hour - 2).padStart(2, '0')}:00:00.000Z`),
  ];
}

function virtualSlot(index: number, sort: number, label: string, startAt: string, endAt: string): AvailabilitySlot {
  const [dateLabel, timeLabel] = label.split(' ');
  return {
    id: `virtual-slot-${index + 1}-${sort}`,
    label,
    dateLabel,
    timeLabel,
    startAt,
    endAt,
    status: 'available',
  };
}

function createVirtualActivities(profile: (typeof virtualProfiles)[number], index: number): ActivityPricing[] {
  return [
    {
      id: `virtual-activity-${index + 1}-main`,
      name: profile.activity,
      durationMinutes: profile.durationMinutes,
      durationLabel: profile.durationMinutes === 60 ? '1小时' : profile.durationMinutes === 90 ? '1.5小时' : profile.durationMinutes === 240 ? '4小时' : '2小时',
      priceCents: profile.priceCents,
      priceText: `¥${Math.round(profile.priceCents / 100)}`,
    },
    {
      id: `virtual-activity-${index + 1}-light`,
      name: '轻量头像快拍',
      durationMinutes: 60,
      durationLabel: '1小时',
      priceCents: Math.max(profile.priceCents - 12000, 19900),
      priceText: `¥${Math.round(Math.max(profile.priceCents - 12000, 19900) / 100)}`,
    },
  ];
}

function createVirtualExtras(index: number): CompanionExtra[] {
  return [
    { id: `virtual-extra-${index + 1}-retouch`, name: '精修', unit: 'per_photo', unitLabel: '张', priceCents: 3000, priceText: '¥30/张' },
    { id: `virtual-extra-${index + 1}-rush`, name: '加急出图', unit: 'per_order', unitLabel: '单', priceCents: 8000, priceText: '¥80' },
    { id: `virtual-extra-${index + 1}-video`, name: '短视频花絮', unit: 'per_order', unitLabel: '单', priceCents: 12000, priceText: '¥120' },
  ];
}

export async function fetchPostDetail(postId?: string): Promise<FeedPost> {
  if (!isApiEnabled() || !postId) return getPostDetail(postId);

  try {
    const response = await apiGet<FeedPost>(`/api/posts/${postId}`);
    return response.success ? withPostTitle(response.data) : getPostDetail(postId);
  } catch {
    return getPostDetail(postId);
  }
}
