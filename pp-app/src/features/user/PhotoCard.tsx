import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export function PhotoCard({ post, priority = false }: { post: FeedPost; priority?: boolean }) {
  const aspectClass = post.id.charCodeAt(post.id.length - 1) % 2 === 0 ? 'aspect-[0.72]' : 'aspect-[0.86]';

  return (
    <article className={`relative overflow-hidden rounded-[6px] bg-zinc-950 ring-1 ring-white/8 ${aspectClass}`}>
      <Link to={`/consumer/post/${post.id}`} className="block h-full w-full" aria-label={`查看${post.location}作品详情`}>
        <img
          className="h-full w-full object-cover saturate-[0.82] contrast-[1.06] transition duration-500 active:scale-[1.025]"
          src={post.images[0]?.url}
          alt={post.location}
          loading={priority ? 'eager' : 'lazy'}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/62 via-black/18 to-transparent px-2.5 pb-2.5 pt-14">
          <span className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-white/74">{post.locationName || post.location}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-white/74">
            <Heart size={11} fill="currentColor" />
            {formatLikeCount(getLikeCount(post.id))}
          </span>
        </div>
      </Link>
    </article>
  );
}

function getLikeCount(seed: string) {
  const score = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 128 + (score % 8700);
}

function formatLikeCount(count: number) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
