import { CalendarDays, MapPin, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export function PhotoCard({ post, priority = false }: { post: FeedPost; priority?: boolean }) {
  const aspectClass = post.id.charCodeAt(post.id.length - 1) % 2 === 0 ? 'aspect-[0.78]' : 'aspect-[0.88]';

  return (
    <article>
      <Link to={`/consumer/post/${post.id}`} className="group block" aria-label={`查看 ${post.location} 的图片`}>
        <div className={`relative overflow-hidden rounded-[18px] bg-[#eadfd8] ${aspectClass}`}>
          <img
            className="h-full w-full object-cover transition duration-500 group-active:scale-[1.025]"
            src={post.images[0]?.url}
            alt={post.location}
            loading={priority ? 'eager' : 'lazy'}
          />
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/82 px-2 py-1 text-[10px] font-bold text-[#23724a] backdrop-blur">
            <ShieldCheck size={11} />
            真人认证
          </div>
          {post.companion.isVirtual ? (
            <div className="absolute right-2 top-2 rounded-full bg-[#3f302c]/82 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
              虚拟样例
            </div>
          ) : null}
        </div>
        <div className="px-1.5 pt-2">
          <p className="flex min-w-0 items-center gap-1 text-[13px] font-bold leading-tight text-[#3f302c]">
            <MapPin size={13} className="shrink-0 text-[#e85d75]" />
            <span className="truncate">{post.location}</span>
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-medium leading-tight text-[#8f8078]">
            <CalendarDays size={12} className="shrink-0 text-[#9fb89f]" />
            <span className="truncate">{post.timeLabel}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
