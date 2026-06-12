import { CalendarDays, LocateFixed, MapPin, MessageCircle, Search, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';

const intentChips = ['现在可拍', '1小时内', 'Citywalk', '探店', '夜景', '预算300内', '女生摄影师', '会指导动作'];

export function CompanionFinderPage() {
  const posts = listFeedPosts();
  const companions = Array.from(new Map(posts.map((post) => [post.companion.id, { companion: post.companion, post }])).values());

  return (
    <div className="min-h-dvh bg-[#fbf7f2] pb-24 text-[#3f302c]">
      <header className="sticky top-0 z-20 border-b border-[#eadfd8]/80 bg-[#fbf7f2]/94 px-4 pb-4 pt-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e85d75]">Instant Booking</p>
            <h1 className="mt-1 text-2xl font-black">找陪拍</h1>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" aria-label="筛选">
            <SlidersHorizontal size={18} />
          </button>
        </div>

        <div className="mt-4 rounded-[18px] bg-white p-3 ring-1 ring-[#eadfd8]">
          <div className="flex items-center gap-2 rounded-full bg-[#f8f1ec] px-3 py-2 text-sm font-semibold text-[#7a6b64]">
            <Search size={16} className="shrink-0" />
            <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#a99b94]" placeholder="输入地点、风格、预算或拍摄需求" />
          </div>
          <button className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-black text-white">
            <LocateFixed size={17} />
            使用当前位置推荐附近摄影师
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {intentChips.map((chip) => (
            <button key={chip} className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#6f625d] ring-1 ring-[#eadfd8]">
              {chip}
            </button>
          ))}
        </div>
      </header>

      <section className="px-4 pt-4">
        <div className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <div className="flex items-center gap-2 text-sm font-black">
            <Sparkles size={17} className="text-[#e85d75]" />
            推荐逻辑
          </div>
          <p className="mt-2 text-sm leading-6 text-[#7a6b64]">
            这里服务的是“我现在就想拍”的用户。后续会把定位、距离、档期、预算、风格、性别偏好、评分和历史成交转化一起放进推荐排序。
          </p>
        </div>
      </section>

      <section className="space-y-3 px-3 pt-3">
        {companions.map(({ companion, post }, index) => {
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
                    推荐分 {96 - index * 3} · {companion.ratingAvg.toFixed(1)} · {companion.ratingCount}条评价
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
                <Link className="rounded-full bg-[#3f302c] px-4 py-2.5 text-center text-sm font-black text-white" to={`/consumer/post/${post.id}`}>
                  查看作品并预约
                </Link>
                <Link className="grid h-11 w-11 place-items-center rounded-full bg-[#f6eee8] text-[#3f302c]" to="/consumer/messages" aria-label="咨询摄影师">
                  <MessageCircle size={18} />
                </Link>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
