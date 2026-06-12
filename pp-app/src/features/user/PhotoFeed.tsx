import type { FeedPost } from '../../types/api';
import { PhotoCard } from './PhotoCard';

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
      <div className="grid grid-cols-2 gap-2">
        {posts.map((post, index) => (
          <PhotoCard key={post.id} post={post} priority={index < 4} />
        ))}
      </div>
    </section>
  );
}
