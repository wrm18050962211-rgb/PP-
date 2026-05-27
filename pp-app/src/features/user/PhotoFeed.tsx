import type { FeedPost } from '../../types/api';
import { PhotoCard } from './PhotoCard';

export function PhotoFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) {
    return (
      <section className="px-4 pb-24 pt-8">
        <div className="rounded-[18px] border border-dashed border-[#eadfd8] bg-white/72 px-5 py-8 text-center">
          <p className="text-base font-black text-[#3f302c]">没有找到匹配的陪拍</p>
          <p className="mt-2 text-sm leading-6 text-[#8a7b74]">换个地点、时间或预算试试，平台会优先展示可预约且已通过审核的陪拍者。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-3 pb-24 pt-3">
      <div className="grid grid-cols-2 gap-3">
        {posts.map((post, index) => (
          <PhotoCard key={post.id} post={post} priority={index < 4} />
        ))}
      </div>
    </section>
  );
}
