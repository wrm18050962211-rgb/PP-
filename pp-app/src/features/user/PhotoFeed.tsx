import { Camera, MapPin, Sparkles } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
  | { type: 'recommendation'; tile: RecommendationTile }
  | { type: 'spacer'; id: string; heightUnits: number };

type FeedSection = {
  id: string;
  columns: [FeedColumnItem[], FeedColumnItem[]];
  heroes: Array<{ post: FeedPost; index: number }>;
};

export const PhotoFeed = memo(function PhotoFeed({ posts }: { posts: FeedPost[] }) {
  const sections = useMemo(() => createDiscoverySections(posts), [posts]);
  const feedRef = useRef<HTMLDivElement>(null);
  const [activeLivePostId, setActiveLivePostId] = useState<string | null>(null);

  useEffect(() => {
    let frameId = 0;

    function updateActiveLivePost() {
      frameId = 0;
      const feedElement = feedRef.current;
      if (!feedElement) return;

      const liveCards = Array.from(feedElement.querySelectorAll<HTMLElement>('[data-feed-live-card="1"]'));
      const viewportCenterY = window.innerHeight / 2;
      const viewportCenterX = window.innerWidth / 2;
      let closest: { id: string; score: number } | null = null;

      liveCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        if (visibleHeight <= 0 || visibleWidth <= 0) return;

        const cardCenterY = rect.top + rect.height / 2;
        const cardCenterX = rect.left + rect.width / 2;
        const verticalDistance = Math.abs(cardCenterY - viewportCenterY);
        const horizontalDistance = Math.abs(cardCenterX - viewportCenterX);
        const visibilityPenalty = 1 - Math.min(1, visibleHeight / Math.max(rect.height, 1));
        const score = verticalDistance + horizontalDistance * 0.22 + visibilityPenalty * 320;
        const id = card.dataset.feedPostId;
        if (!id) return;
        if (!closest || score < closest.score) closest = { id, score };
      });

      setActiveLivePostId((current) => (current === closest?.id ? current : closest?.id ?? null));
    }

    function scheduleUpdate() {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateActiveLivePost);
    }

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [posts]);

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

  return (
    <section ref={feedRef} className="bg-[#050505] px-[1px] pb-24 pt-[1px]">
      <div className="space-y-[1px]">
        {sections.map((section) => {
          const hasColumns = section.columns.some((column) => column.length > 0);
          return (
            <div key={section.id} className="space-y-[1px]">
              {hasColumns ? (
                <div className="grid grid-cols-2 gap-[1px]">
                  {section.columns.map((column, columnIndex) => (
                    <div key={`${section.id}-${columnIndex}`} className="flex h-full flex-col gap-[1px]">
                      {column.map((item) => renderColumnItem(item, item.type === 'post' && item.index < 4, activeLivePostId))}
                    </div>
                  ))}
                </div>
              ) : null}

              {section.heroes.map((hero) => (
                <PhotoCard key={hero.post.id} post={hero.post} priority={hero.index < 4} variant="wide" className="w-full" playLive={activeLivePostId === hero.post.id} />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
});

function renderColumnItem(item: FeedColumnItem, priority: boolean, activeLivePostId: string | null) {
  if (item.type === 'recommendation') {
    return <RecommendationCard key={item.tile.id} tile={item.tile} />;
  }

  if (item.type === 'spacer') {
    return <ColumnSpacer key={item.id} heightUnits={item.heightUnits} />;
  }

  const layout = getDiscoveryLayoutRule(item.post, item.index);
  return <PhotoCard key={item.post.id} post={item.post} priority={priority} variant={layout.variant} className="w-full" playLive={activeLivePostId === item.post.id} />;
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
    const heroCount = sectionIndex % 2 === 0 ? 1 : 2;

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
        if (verticalSlice.length >= 4) insertColumnItem(rightColumn, rightTile, 'end');
      } else {
        insertColumnItem(leftColumn, leftTile, 'end');
        if (verticalSlice.length >= 4) insertColumnItem(rightColumn, rightTile, 'middle');
      }

      if (heroes.length > 0) balanceColumnsBeforeHero(leftColumn, rightColumn, sectionIndex);
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

function balanceColumnsBeforeHero(leftColumn: FeedColumnItem[], rightColumn: FeedColumnItem[], sectionIndex: number) {
  const columns: [FeedColumnItem[], FeedColumnItem[]] = [leftColumn, rightColumn];
  const heights = columns.map(estimateColumnHeight);
  const shorterIndex = heights[0] <= heights[1] ? 0 : 1;
  const diff = Math.abs(heights[0] - heights[1]);

  if (diff < 0.06) {
    insertColumnItem(columns[shorterIndex], { type: 'spacer', id: `column-spacer-${sectionIndex}-${shorterIndex}`, heightUnits: 0.08 }, 'end');
    return;
  }

  insertColumnItem(columns[shorterIndex], { type: 'spacer', id: `column-spacer-${sectionIndex}-${shorterIndex}`, heightUnits: diff }, 'end');
}

function estimateColumnHeight(column: FeedColumnItem[]) {
  return column.reduce((height, item) => height + estimateItemHeight(item), 0);
}

function estimateItemHeight(item: FeedColumnItem) {
  if (item.type === 'recommendation') return 0.16;
  if (item.type === 'spacer') return item.heightUnits;
  const variant = getDiscoveryLayoutRule(item.post, item.index).variant;
  if (variant === 'tall') return 1.35;
  if (variant === 'portrait') return 1.22;
  if (variant === 'soft') return 1.04;
  return 0.58;
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
      className={`flex h-6 items-center gap-1 overflow-hidden bg-[#050505] px-1 text-white/42 transition active:bg-white/[0.035] ${className}`}
      title={[tile.eyebrow, tile.title, tile.meta].filter(Boolean).join(' · ')}
    >
      <Icon size={9} className="shrink-0 text-white/24" />
      <span className="min-w-0 truncate text-[9px] font-semibold leading-none text-white/48">
        <span className="text-white/30">{tile.eyebrow}</span>
        <span className="px-0.5 text-white/22">·</span>
        <span>{tile.title}</span>
        {tile.meta ? (
          <>
            <span className="px-0.5 text-white/22">·</span>
            <span className="text-white/34">{tile.meta}</span>
          </>
        ) : null}
      </span>
    </Link>
  );
}

function ColumnSpacer({ heightUnits }: { heightUnits: number }) {
  const clampedUnits = Math.max(0.08, Math.min(heightUnits, 1.1));

  return (
    <div
      className="bg-[#050505]"
      aria-hidden="true"
      style={{ height: `calc((min(100vw, 28rem) - 1px) * ${clampedUnits / 2})` }}
    />
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
