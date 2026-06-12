import type { FeedPost } from '../../types/api';
import { PhotoCard, type PhotoCardVariant } from './PhotoCard';

type FeedLayoutRule = {
  spanAll: boolean;
  variant: PhotoCardVariant;
};

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

  return (
    <section className="bg-[#050505] px-2 pb-24 pt-2">
      <div className="columns-2 gap-2">
        {posts.map((post, index) => {
          const layout = getDiscoveryLayoutRule(post, index);
          return (
            <PhotoCard
              key={post.id}
              post={post}
              priority={index < 4}
              variant={layout.variant}
              className={`mb-2 break-inside-avoid ${layout.spanAll ? '[column-span:all]' : ''}`}
            />
          );
        })}
      </div>
    </section>
  );
}

function getDiscoveryLayoutRule(post: FeedPost, index: number): FeedLayoutRule {
  const cover = post.images[0];
  const ratio = cover?.width && cover?.height ? cover.width / cover.height : 0;
  const isRealHorizontal = ratio >= 1.16;
  const isEditorialBreak = index > 0 && index % 6 === 2;

  // Discovery feed rule: horizontal images span both columns; otherwise every few cards
  // one work is promoted into a wide magazine card, while vertical cards alternate heights.
  if (isRealHorizontal || isEditorialBreak) {
    return { spanAll: true, variant: 'wide' };
  }

  const verticalCycle: PhotoCardVariant[] = ['tall', 'portrait', 'soft', 'portrait', 'tall'];
  return { spanAll: false, variant: verticalCycle[index % verticalCycle.length] };
}
