import { Camera, MapPin, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';
import { PhotoCard, type PhotoCardVariant } from './PhotoCard';

type FeedLayoutRule = {
  variant: PhotoCardVariant;
};

type RecommendationTile = {
  id: string;
  kind: 'place' | 'photographer' | 'same-style';
  eyebrow: string;
  title: string;
  meta: string;
  href: string;
};

type DiscoveryFeedItem =
  | { type: 'post'; post: FeedPost; index: number }
  | { type: 'recommendation'; tile: RecommendationTile; index: number };

export function PhotoFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) {
    return (
      <section className="bg-[#050505] px-4 pb-24 pt-8">
        <div className="rounded-[8px] border border-dashed border-white/20 bg-white/6 px-5 py-8 text-center">
          <p className="text-base font-black text-white">没有找到匹配的陪拍</p>
          <p className="mt-2 text-sm leading-6 text-white/58">换个地点、时间或预算试试，平台会优先展示可预约且已通过审核的陪拍者。</p>
        </div>
      </section>
    );
  }

  const feedItems = createDiscoveryFeedItems(posts);

  return (
    <section className="bg-[#050505] px-2 pb-24 pt-2">
      <div className="columns-2 gap-2">
        {feedItems.map((item) => {
          if (item.type === 'recommendation') {
            return <RecommendationCard key={item.tile.id} tile={item.tile} />;
          }

          const layout = getDiscoveryLayoutRule(item.post, item.index);
          return (
            <PhotoCard
              key={item.post.id}
              post={item.post}
              priority={item.index < 4}
              variant={layout.variant}
              className="mb-2 break-inside-avoid"
            />
          );
        })}
      </div>
    </section>
  );
}

function createDiscoveryFeedItems(posts: FeedPost[]): DiscoveryFeedItem[] {
  const recommendationSlots = new Map<number, RecommendationTile>([
    [1, createPlaceRecommendation(posts[0])],
    [4, createPhotographerRecommendation(posts[3] ?? posts[0])],
    [8, createSameStyleRecommendation(posts[6] ?? posts[0])],
    [13, createPlaceRecommendation(posts[10] ?? posts[0], 'recommend-place-2')],
    [17, createPhotographerRecommendation(posts[14] ?? posts[0], 'recommend-photographer-2')],
  ]);

  return posts.flatMap((post, index) => {
    const items: DiscoveryFeedItem[] = [{ type: 'post', post, index }];
    const tile = recommendationSlots.get(index);
    if (tile) items.push({ type: 'recommendation', tile, index });
    return items;
  });
}

function getDiscoveryLayoutRule(post: FeedPost, index: number): FeedLayoutRule {
  const cover = post.images[0];
  const ratio = cover?.width && cover?.height ? cover.width / cover.height : 0;
  const isRealHorizontal = ratio >= 1.16;

  // Discovery feed rule: true horizontal works stay in one column; vertical cards
  // alternate heights so the two columns keep a staggered rhythm.
  if (isRealHorizontal) {
    return { variant: 'wide' };
  }

  const verticalCycle: PhotoCardVariant[] = ['tall', 'soft', 'portrait', 'tall', 'portrait', 'soft'];
  return { variant: verticalCycle[index % verticalCycle.length] };
}

function RecommendationCard({ tile }: { tile: RecommendationTile }) {
  const Icon = tile.kind === 'place' ? MapPin : tile.kind === 'photographer' ? Camera : Sparkles;

  return (
    <Link
      to={tile.href}
      className="mb-2 flex min-h-24 break-inside-avoid flex-col justify-between overflow-hidden rounded-[2px] border border-white/10 bg-white px-3 py-2.5 text-black"
    >
      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
        <Icon size={11} />
        {tile.eyebrow}
      </span>
      <span className="line-clamp-2 text-sm font-black leading-4">{tile.title}</span>
      <span className="truncate text-[11px] font-bold text-zinc-500">{tile.meta}</span>
    </Link>
  );
}

function createPlaceRecommendation(post?: FeedPost, id = 'recommend-place'): RecommendationTile {
  const area = post?.locationName || post?.companion.areas[0] || '武康路';
  return {
    id,
    kind: 'place',
    eyebrow: '网红地点',
    title: `${area} 附近可拍`,
    meta: '自动筛选地点去拍摄',
    href: `/consumer/companions?area=${encodeURIComponent(area)}`,
  };
}

function createPhotographerRecommendation(post?: FeedPost, id = 'recommend-photographer'): RecommendationTile {
  const style = post?.activity || post?.styleTags[0] || 'Citywalk';
  return {
    id,
    kind: 'photographer',
    eyebrow: '摄影师',
    title: `${style} 摄影师`,
    meta: '按风格直接找人',
    href: `/consumer/companions?style=${encodeURIComponent(style)}`,
  };
}

function createSameStyleRecommendation(post?: FeedPost): RecommendationTile {
  const title = post?.locationName || post?.location || '同款作品';
  const style = post?.activity || post?.styleTags[0] || '街拍';
  return {
    id: 'recommend-same-style',
    kind: 'same-style',
    eyebrow: '创作者同款',
    title: `${title} 拍同款`,
    meta: '带作品条件进入拍摄',
    href: `/consumer/companions?sameStyle=${encodeURIComponent(post?.id ?? '')}&style=${encodeURIComponent(style)}`,
  };
}
