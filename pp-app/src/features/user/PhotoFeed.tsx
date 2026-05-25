import type { FeedPost } from '../../types/api';
import { PhotoCard } from './PhotoCard';

export function PhotoFeed({ posts }: { posts: FeedPost[] }) {
  return (
    <section className="px-2.5 pb-24 pt-2">
      <div className="grid grid-cols-2 gap-2.5">
        {posts.map((post, index) => (
          <PhotoCard key={post.id} post={post} priority={index < 4} />
        ))}
      </div>
    </section>
  );
}
