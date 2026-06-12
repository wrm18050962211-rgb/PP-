import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export function PhotoCard({ post, priority = false }: { post: FeedPost; priority?: boolean }) {
  const aspectClass = post.id.charCodeAt(post.id.length - 1) % 2 === 0 ? 'aspect-[0.72]' : 'aspect-[0.86]';

  return (
    <article className={`overflow-hidden rounded-[6px] bg-zinc-950 ring-1 ring-white/8 ${aspectClass}`}>
      <Link to={`/consumer/post/${post.id}`} className="block h-full w-full" aria-label={`查看${post.location}作品详情`}>
        <img
          className="h-full w-full object-cover saturate-[0.82] contrast-[1.06] transition duration-500 active:scale-[1.025]"
          src={post.images[0]?.url}
          alt={post.location}
          loading={priority ? 'eager' : 'lazy'}
        />
      </Link>
    </article>
  );
}
