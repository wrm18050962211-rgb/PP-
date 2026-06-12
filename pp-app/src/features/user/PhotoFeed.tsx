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

type FeedColumnItem =
  | { type: 'post'; post: FeedPost; index: number }
  | { type: 'recommendation'; tile: RecommendationTile };

type FeedSection = {
  id: string;
  columns: [FeedColumnItem[], FeedColumnItem[]];
  hero?: { post: FeedPost; index: number };
};

export function PhotoFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) {
    return (
      <section className="bg-[#050505] px-4 pb-24 pt-8">
        <div className="rounded-[8px] border border-dashed border-white/20 bg-white/6 px-5 py-8 text-center">
          <p className="text-base font-black text-white">没有找到匹配的摄影师</p>
          <p className="mt-2 text-sm leading-6 text-white/58">换个地点、时间或预算试试，平台会优先展示可预约且已通过审核的摄影师。</p>
        </div>
      </section>
    );
  }

  const sections = createDiscoverySections(posts);

  return (
    <section className="bg-[#050505] px-2 pb-24 pt-2">
      <div className="space-y-2">
        {sections.map((section) => {
          const hasColumns = section.columns.some((column) => column.length > 0);
          return (
            <div key={section.id} className="space-y-2">
              {hasColumns ? (
                <div className="grid grid-cols-2 gap-2">
                  {section.columns.map((column, columnIndex) => (
                    <div key={`${section.id}-${columnIndex}`} className="flex h-full flex-col gap-2">
                      {column.map((item) => renderColumnItem(item, item.type === 'post' && item.index < 4))}
                    </div>
                  ))}
                </div>
              ) : null}

              {section.hero ? <PhotoCard post={section.hero.post} priority={section.hero.index < 4} variant="wide" className="w-full" /> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function renderColumnItem(item: FeedColumnItem, priority: boolean) {
  if (item.type === 'recommendation') {
    return <RecommendationCard key={item.tile.id} tile={item.tile} className="flex-1" />;
  }

  const layout = getDiscoveryLayoutRule(item.post, item.index);
  return <PhotoCard key={item.post.id} post={item.post} priority={priority} variant={layout.variant} className="w-full" />;
}

function createDiscoverySections(posts: FeedPost[]): FeedSection[] {
  const verticalItems: Array<{ post: FeedPost; index: number }> = [];
  const horizontalItems: Array<{ post: FeedPost; index: number }> = [];

  posts.forEach((post, index) => {
    if (isHorizontalPost(post)) horizontalItems.push({ post, index });
    else verticalItems.push({ post, index });
  });

  const sections: FeedSection[] = [];
  let verticalCursor = 0;
  let horizontalCursor = 0;
  let sectionIndex = 0;

  while (verticalCursor < verticalItems.length || horizontalCursor < horizontalItems.length) {
    const verticalSlice = verticalItems.slice(verticalCursor, verticalCursor + 6);
    verticalCursor += verticalSlice.length;

    const leftColumn = verticalSlice
      .filter((_, index) => index % 2 === 0)
      .map((item): FeedColumnItem => ({ type: 'post', post: item.post, index: item.index }));
    const rightColumn = verticalSlice
      .filter((_, index) => index % 2 === 1)
      .map((item): FeedColumnItem => ({ type: 'post', post: item.post, index: item.index }));

    const hero = horizontalItems[horizontalCursor];
    if (hero) horizontalCursor += 1;

    if (verticalSlice.length > 0) {
      const firstPost = verticalSlice[0]?.post ?? hero?.post;
      const lastPost = verticalSlice[verticalSlice.length - 1]?.post ?? hero?.post;
      leftColumn.push({ type: 'recommendation', tile: createPlaceRecommendation(firstPost, `recommend-place-${sectionIndex}`) });
      rightColumn.push({
        type: 'recommendation',
        tile:
          sectionIndex % 2 === 0
            ? createSameStyleRecommendation(hero?.post ?? lastPost, `recommend-same-style-${sectionIndex}`)
            : createPhotographerRecommendation(lastPost, `recommend-photographer-${sectionIndex}`),
      });
    }

    sections.push({
      id: `feed-section-${sectionIndex}`,
      columns: [leftColumn, rightColumn],
      hero,
    });
    sectionIndex += 1;
  }

  return sections;
}

function isHorizontalPost(post: FeedPost) {
  const cover = post.images[0];
  const ratio = cover?.width && cover?.height ? cover.width / cover.height : 0;
  return ratio >= 1.16;
}

function getDiscoveryLayoutRule(post: FeedPost, index: number): FeedLayoutRule {
  if (isHorizontalPost(post)) {
    return { variant: 'wide' };
  }

  const verticalCycle: PhotoCardVariant[] = ['tall', 'soft', 'portrait', 'tall', 'portrait', 'soft'];
  return { variant: verticalCycle[index % verticalCycle.length] };
}

function RecommendationCard({ tile, className = '' }: { tile: RecommendationTile; className?: string }) {
  const Icon = tile.kind === 'place' ? MapPin : tile.kind === 'photographer' ? Camera : Sparkles;

  return (
    <Link
      to={tile.href}
      className={`flex min-h-20 flex-col justify-between overflow-hidden rounded-[2px] border border-white/10 bg-white px-3 py-2.5 text-black ${className}`}
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
    meta: '点开自动筛选地点',
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

function createSameStyleRecommendation(post?: FeedPost, id = 'recommend-same-style'): RecommendationTile {
  const title = post?.locationName || post?.location || '同款作品';
  const style = post?.activity || post?.styleTags[0] || '街拍';
  return {
    id,
    kind: 'same-style',
    eyebrow: '创作者同款',
    title: `${title} 拍同款`,
    meta: '带作品条件进入拍摄',
    href: `/consumer/companions?sameStyle=${encodeURIComponent(post?.id ?? '')}&style=${encodeURIComponent(style)}`,
  };
}
