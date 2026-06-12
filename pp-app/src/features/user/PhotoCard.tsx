import { Camera, Heart, MapPin, MessageCircle, Sparkles, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export function PhotoCard({ post, priority = false }: { post: FeedPost; priority?: boolean }) {
  const aspectClass = post.id.charCodeAt(post.id.length - 1) % 2 === 0 ? 'aspect-[0.78]' : 'aspect-[0.88]';
  const primaryActivity = post.companion.activities[0];
  const priceText = primaryActivity ? `￥${Math.round(primaryActivity.priceCents / 100)}起` : '可预约';
  const creatorName = post.companion.isVirtual ? `${post.companion.name} 出镜` : '作品发布者';
  const city = post.city || post.location.split(' ')[0] || '同城';

  return (
    <article className="overflow-hidden rounded-[18px] bg-white shadow-[0_10px_28px_rgba(91,64,49,0.08)] ring-1 ring-[#eadfd8]/80">
      <Link to={`/consumer/post/${post.id}`} className="group block" aria-label={`查看 ${post.location} 的作品详情`}>
        <div className={`relative overflow-hidden bg-[#eadfd8] ${aspectClass}`}>
          <img
            className="h-full w-full object-cover transition duration-500 group-active:scale-[1.025]"
            src={post.images[0]?.url}
            alt={post.location}
            loading={priority ? 'eager' : 'lazy'}
          />
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/86 px-2 py-1 text-[10px] font-bold text-[#3f302c] backdrop-blur">
            <MapPin size={11} className="text-[#e85d75]" />
            {city}
          </div>
          <div className="absolute bottom-2 left-2 rounded-full bg-[#3f302c]/86 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
            {priceText}
          </div>
        </div>
      </Link>

      <div className="space-y-2 px-2.5 py-2.5">
        <Link to={`/consumer/post/${post.id}`} className="block">
          <p className="line-clamp-2 text-[13px] font-black leading-5 text-[#3f302c]">{post.caption}</p>
        </Link>

        <div className="flex flex-wrap gap-1.5">
          {post.styleTags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-[#f6eee8] px-2 py-1 text-[10px] font-bold text-[#7a6b64]">
              {tag}
            </span>
          ))}
        </div>

        <div className="space-y-1 text-[11px] font-semibold text-[#7a6b64]">
          <p className="flex min-w-0 items-center gap-1">
            <Camera size={12} className="shrink-0 text-[#9fb89f]" />
            <span className="truncate">摄影师：{post.companion.name}</span>
          </p>
          <p className="flex min-w-0 items-center gap-1">
            <UserRound size={12} className="shrink-0 text-[#e85d75]" />
            <span className="truncate">出镜创作者：{creatorName}</span>
          </p>
          <p className="flex min-w-0 items-center gap-1">
            <Sparkles size={12} className="shrink-0 text-[#c99542]" />
            <span className="truncate">拍摄地：{post.locationName || post.location}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Link className="rounded-full bg-[#3f302c] px-2 py-2 text-center text-[11px] font-black text-white" to={`/consumer/post/${post.id}`}>
            找原摄影师
          </Link>
          <Link className="rounded-full bg-[#f6eee8] px-2 py-2 text-center text-[11px] font-black text-[#3f302c]" to="/consumer/same-style">
            找其他摄影师
          </Link>
        </div>

        <div className="flex items-center justify-between border-t border-[#f0e5de] pt-2 text-[11px] font-bold text-[#9b8e87]">
          <span className="inline-flex items-center gap-1">
            <Heart size={12} />
            收藏风格
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} />
            评论入口
          </span>
        </div>
      </div>
    </article>
  );
}
