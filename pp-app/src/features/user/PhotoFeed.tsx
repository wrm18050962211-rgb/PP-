import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { FeedPost } from '../../types/api';
import { PhotoCard } from './PhotoCard';

type IndexedPost = {
  post: FeedPost;
  index: number;
};

export const PhotoFeed = memo(function PhotoFeed({
  posts,
  likeCountByPostId,
  active = false,
  getPostHref,
  bottomPaddingClass = 'pb-24',
}: {
  posts: FeedPost[];
  likeCountByPostId?: ReadonlyMap<string, number>;
  active?: boolean;
  getPostHref?: (post: FeedPost) => string;
  bottomPaddingClass?: string;
}) {
  const columns = useMemo<[IndexedPost[], IndexedPost[]]>(
    () => [
      posts.flatMap((post, index) => (index % 2 === 0 ? [{ post, index }] : [])),
      posts.flatMap((post, index) => (index % 2 === 1 ? [{ post, index }] : [])),
    ],
    [posts],
  );
  const feedRef = useRef<HTMLElement>(null);
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
        <div className="rounded-[16px] border border-dashed border-white/20 bg-white/6 px-5 py-8 text-center">
          <p className="text-base font-black text-white">没有找到匹配的摄影师</p>
          <p className="mt-2 text-sm leading-6 text-white/58">换个地点或风格试试，平台会继续展示已通过审核的摄影师作品。</p>
        </div>
      </section>
    );
  }

  return (
    <section ref={feedRef} className={`bg-[#050505] px-2 pt-2 ${bottomPaddingClass}`}>
      <div className="grid grid-cols-2 items-start gap-2">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex min-w-0 flex-col gap-2">
            {column.map(({ post, index }) => (
              <PhotoCard
                key={post.id}
                post={post}
                priority={active && index < 4}
                postHref={getPostHref?.(post)}
                playLive={activeLivePostId === post.id}
                likeCount={likeCountByPostId?.get(post.id)}
                masonry
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
});
