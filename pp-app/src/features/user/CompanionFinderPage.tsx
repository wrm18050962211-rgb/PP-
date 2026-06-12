import { CalendarDays, MapPin, MessageCircle, ShieldCheck, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';

export function CompanionFinderPage() {
  const posts = listFeedPosts();
  const companions = Array.from(new Map(posts.map((post) => [post.companion.id, { companion: post.companion, post }])).values());

  return (
    <div className="min-h-dvh bg-[#fbf7f2] pb-24 text-[#3f302c]">
      <header className="sticky top-0 z-20 border-b border-[#eadfd8]/80 bg-[#fbf7f2]/94 px-4 py-4 backdrop-blur-xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e85d75]">Photographer Booking</p>
        <h1 className="mt-1 text-2xl font-black">找陪拍</h1>
        <p className="mt-2 text-sm leading-6 text-[#7a6b64]">按城市、价格、档期和评论选择摄影师/陪拍，适合已经明确想约拍的用户。</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold">
          <span className="rounded-full bg-white px-3 py-2 ring-1 ring-[#eadfd8]">价格透明</span>
          <span className="rounded-full bg-white px-3 py-2 ring-1 ring-[#eadfd8]">档期可约</span>
          <span className="rounded-full bg-white px-3 py-2 ring-1 ring-[#eadfd8]">评论转化</span>
        </div>
      </header>

      <section className="space-y-3 px-3 pt-3">
        {companions.map(({ companion, post }) => {
          const activity = companion.activities[0];
          const slot = companion.slots.find((item) => item.status === 'available') || companion.slots[0];
          return (
            <article key={companion.id} className="rounded-[18px] bg-white p-3 shadow-[0_10px_28px_rgba(91,64,49,0.08)] ring-1 ring-[#eadfd8]/80">
              <div className="flex gap-3">
                <img className="h-24 w-20 shrink-0 rounded-[14px] object-cover" src={companion.photo || companion.avatar} alt={companion.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-base font-black">{companion.name}</h2>
                    <span className="shrink-0 rounded-full bg-[#f6eee8] px-2 py-1 text-xs font-black text-[#3f302c]">
                      ￥{Math.round((activity?.priceCents || 0) / 100)}起
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[#7a6b64]">
                    <Star size={13} className="fill-[#f2c25b] text-[#f2c25b]" />
                    {companion.ratingAvg.toFixed(1)} · {companion.ratingCount}条评价
                  </p>
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-[#7a6b64]">
                    <MapPin size={13} className="shrink-0 text-[#e85d75]" />
                    <span className="truncate">{companion.areas.slice(0, 3).join(' / ')}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#7a6b64]">
                    <CalendarDays size={13} className="text-[#9fb89f]" />
                    最近可约：{slot?.label || '待开放'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {companion.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-[#f6eee8] px-2 py-1 text-[11px] font-bold text-[#7a6b64]">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <Link className="rounded-full bg-[#3f302c] px-4 py-2 text-center text-sm font-black text-white" to={`/consumer/post/${post.id}`}>
                  立即约拍
                </Link>
                <Link className="grid h-10 w-10 place-items-center rounded-full bg-[#f6eee8] text-[#3f302c]" to="/consumer/messages" aria-label="咨询">
                  <MessageCircle size={18} />
                </Link>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-[#f0e5de] pt-3 text-xs font-bold text-[#7a6b64]">
                <ShieldCheck size={14} className="text-[#23724a]" />
                <span>作品详情和摄影师主页会突出真实评论，帮助判断出片效果、沟通体验和是否准时。</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
