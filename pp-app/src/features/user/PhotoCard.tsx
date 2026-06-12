import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export type PhotoCardVariant = 'tall' | 'portrait' | 'soft' | 'wide';

const aspectByVariant: Record<PhotoCardVariant, string> = {
  tall: 'aspect-[0.66]',
  portrait: 'aspect-[0.78]',
  soft: 'aspect-[0.92]',
  wide: 'aspect-[1.72]',
};

export function PhotoCard({
  post,
  priority = false,
  variant = 'portrait',
  className = '',
}: {
  post: FeedPost;
  priority?: boolean;
  variant?: PhotoCardVariant;
  className?: string;
}) {
  return (
    <article className={`relative overflow-hidden rounded-[2px] bg-zinc-950 ring-1 ring-white/8 ${aspectByVariant[variant]} ${className}`}>
      <Link to={`/consumer/post/${post.id}`} className="block h-full w-full" aria-label={`查看${post.location}作品详情`}>
        <img
          className="h-full w-full object-cover saturate-[0.82] contrast-[1.06] transition duration-500 active:scale-[1.025]"
          src={post.images[0]?.url}
          alt={post.location}
          loading={priority ? 'eager' : 'lazy'}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/62 via-black/18 to-transparent px-2.5 pb-2.5 pt-14">
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-white/74">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{post.locationName || post.location}</span>
          </span>
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
