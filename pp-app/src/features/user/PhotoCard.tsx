import { CalendarDays, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export function PhotoCard({ post, priority = false }: { post: FeedPost; priority?: boolean }) {
  return (
    <article>
      <Link
        to={`/consumer/post/${post.id}`}
        className="group block overflow-hidden rounded-[8px] bg-[#1b1b22] shadow-sm shadow-black/20"
        aria-label={`查看 ${post.location} 的图片`}
      >
        <div className="relative aspect-[1/1.08] overflow-hidden">
          <img
            className="h-full w-full object-cover transition duration-500 group-active:scale-[1.03]"
            src={post.images[0]?.url}
            alt={post.location}
            loading={priority ? 'eager' : 'lazy'}
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/28 to-transparent px-2.5 pb-2.5 pt-12 text-white">
            <p className="flex min-w-0 items-center gap-1 text-[13px] font-bold leading-tight">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{post.location}</span>
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-medium leading-tight text-white/78">
              <CalendarDays size={12} className="shrink-0" />
              <span className="truncate">{post.timeLabel}</span>
            </p>
          </div>
        </div>
      </Link>
    </article>
  );
}
