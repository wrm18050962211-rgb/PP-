import { Camera, MapPin, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPostTitle } from '../../services/feedService';
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
  heroes: Array<{ post: FeedPost; index: number }>;
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

              {section.heroes.map((hero) => (
                <PhotoCard key={hero.post.id} post={hero.post} priority={hero.index < 4} variant="wide" className="w-full" />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function renderColumnItem(item: FeedColumnItem, priority: boolean) {
  if (item.type === 'recommendation') {
    return <RecommendationCard key={item.tile.id} tile={item.tile} />;
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

  while (verticalCursor + 6 <= verticalItems.length) {
    const heroCount = sectionIndex % 2 === 0 ? 1 : 2;
    if (horizontalCursor + heroCount > horizontalItems.length) break;

    const verticalSlice = verticalItems.slice(verticalCursor, verticalCursor + 6);
    verticalCursor += verticalSlice.length;

    const leftColumn = verticalSlice
      .filter((_, index) => index % 2 === 0)
      .map((item): FeedColumnItem => ({ type: 'post', post: item.post, index: item.index }));
    const rightColumn = verticalSlice
      .filter((_, index) => index % 2 === 1)
      .map((item): FeedColumnItem => ({ type: 'post', post: item.post, index: item.index }));

    const heroes = horizontalItems.slice(horizontalCursor, horizontalCursor + heroCount);
    horizontalCursor += heroes.length;

    if (verticalSlice.length > 0) {
      const firstPost = verticalSlice[0]?.post ?? heroes[0]?.post;
      const lastPost = verticalSlice[verticalSlice.length - 1]?.post ?? heroes[0]?.post;
      const leftTile: FeedColumnItem = { type: 'recommendation', tile: createPlaceRecommendation(firstPost, `recommend-place-${sectionIndex}`) };
      const rightTile: FeedColumnItem = {
        type: 'recommendation',
        tile:
          sectionIndex % 2 === 0
            ? createSameStyleRecommendation(heroes[0]?.post ?? lastPost, `recommend-same-style-${sectionIndex}`)
            : createPhotographerRecommendation(lastPost, `recommend-photographer-${sectionIndex}`),
      };

      if (sectionIndex % 2 === 0) {
        insertColumnItem(leftColumn, leftTile, 'middle');
        insertColumnItem(rightColumn, rightTile, 'end');
      } else {
        insertColumnItem(leftColumn, leftTile, 'end');
        insertColumnItem(rightColumn, rightTile, 'middle');
      }
    }

    sections.push({
      id: `feed-section-${sectionIndex}`,
      columns: [leftColumn, rightColumn],
      heroes,
    });
    sectionIndex += 1;
  }

  return sections;
}

function insertColumnItem(column: FeedColumnItem[], item: FeedColumnItem, placement: 'middle' | 'end') {
  if (placement === 'middle') {
    column.splice(Math.min(1, column.length), 0, item);
    return;
  }

  column.push(item);
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
      className={`flex h-10 items-center gap-1.5 overflow-hidden rounded-[2px] bg-transparent px-2 text-white/54 transition active:bg-white/[0.04] ${className}`}
      title={[tile.eyebrow, tile.title, tile.meta].filter(Boolean).join(' · ')}
    >
      <Icon size={11} className="shrink-0 text-white/30" />
      <span className="min-w-0 truncate text-[11px] font-semibold leading-none text-white/58">
        <span className="text-white/34">{tile.eyebrow}</span>
        <span className="px-1 text-white/22">·</span>
        <span>{tile.title}</span>
        {tile.meta ? (
          <>
            <span className="px-1 text-white/22">·</span>
            <span className="text-white/38">{tile.meta}</span>
          </>
        ) : null}
      </span>
    </Link>
  );
}

function createPlaceRecommendation(post?: FeedPost, id = 'recommend-place'): RecommendationTile {
  const area = post?.locationName || post?.companion.areas[0] || '武康路';
  return {
    id,
    kind: 'place',
    eyebrow: '拍摄地',
    title: area,
    meta: post ? getPostTitle(post) : '',
    href: `/consumer/companions?area=${encodeURIComponent(area)}`,
  };
}

function createPhotographerRecommendation(post?: FeedPost, id = 'recommend-photographer'): RecommendationTile {
  const style = post?.activity || post?.styleTags[0] || 'Citywalk';
  const photographer = post?.companion.name || style;
  return {
    id,
    kind: 'photographer',
    eyebrow: '摄影师',
    title: photographer,
    meta: post ? getPostTitle(post) : '',
    href: `/consumer/companions?style=${encodeURIComponent(style)}`,
  };
}

function createSameStyleRecommendation(post?: FeedPost, id = 'recommend-same-style'): RecommendationTile {
  const title = post ? getPostTitle(post) : '同款作品';
  const style = post?.activity || post?.styleTags[0] || '街拍';
  return {
    id,
    kind: 'same-style',
    eyebrow: '样板',
    title,
    meta: post?.companion.name || '',
    href: `/consumer/companions?sameStyle=${encodeURIComponent(post?.id ?? '')}&style=${encodeURIComponent(style)}`,
  };
}
