import { ArrowRight, Camera, Gift, MapPin, Repeat2, Sparkles, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';

export function ShootSamePage() {
  const posts = listFeedPosts().slice(0, 8);

  return (
    <div className="min-h-dvh bg-[#fbf7f2] pb-24 text-[#3f302c]">
      <header className="sticky top-0 z-20 border-b border-[#eadfd8]/80 bg-[#fbf7f2]/94 px-4 py-4 backdrop-blur-xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e85d75]">Same Style Booking</p>
        <h1 className="mt-1 text-2xl font-black">拍同款</h1>
        <p className="mt-2 text-sm leading-6 text-[#7a6b64]">从作品风格出发，找原摄影师复刻，也可以换价格、距离或档期更合适的摄影师。</p>
      </header>

      <section className="px-4 pt-3">
        <div className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <div className="flex items-center gap-2 text-sm font-black">
            <Gift size={17} className="text-[#e85d75]" />
            内容激励归因
          </div>
          <p className="mt-2 text-sm leading-6 text-[#7a6b64]">
            MVP 阶段按下单前最后一次有效入口归因。找原摄影师成交时，激励给出镜创作者；选择其他摄影师成交时，创作者和原摄影师共享内容激励池。
          </p>
        </div>
      </section>

      <section className="space-y-3 px-3 pt-3">
        {posts.map((post) => {
          const activity = post.companion.activities[0];
          return (
            <article key={post.id} className="overflow-hidden rounded-[18px] bg-white shadow-[0_10px_28px_rgba(91,64,49,0.08)] ring-1 ring-[#eadfd8]/80">
              <Link to={`/consumer/post/${post.id}`} className="block">
                <div className="relative h-64 bg-[#eadfd8]">
                  <img className="h-full w-full object-cover" src={post.images[0]?.url} alt={post.location} />
                  <div className="absolute left-3 top-3 rounded-full bg-white/86 px-3 py-1.5 text-xs font-black text-[#3f302c] backdrop-blur">
                    ￥{Math.round((activity?.priceCents || 0) / 100)}起
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 rounded-[14px] bg-[#3f302c]/82 p-3 text-white backdrop-blur">
                    <p className="line-clamp-2 text-sm font-black leading-5">{post.caption}</p>
                  </div>
                </div>
              </Link>

              <div className="space-y-3 p-3">
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#7a6b64]">
                  <span className="flex min-w-0 items-center gap-1">
                    <Camera size={13} className="text-[#9fb89f]" />
                    <span className="truncate">原摄影师：{post.companion.name}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <UserRound size={13} className="text-[#e85d75]" />
                    <span className="truncate">出镜创作者</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <MapPin size={13} className="text-[#e85d75]" />
                    <span className="truncate">{post.locationName || post.location}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <Sparkles size={13} className="text-[#c99542]" />
                    <span className="truncate">{post.activity}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Link className="rounded-full bg-[#3f302c] px-3 py-2.5 text-center text-sm font-black text-white" to={`/consumer/post/${post.id}`}>
                    找原摄影师
                  </Link>
                  <Link className="rounded-full bg-[#f6eee8] px-3 py-2.5 text-center text-sm font-black text-[#3f302c]" to="/consumer/companions">
                    找其他摄影师
                  </Link>
                </div>

                <div className="flex items-center justify-between border-t border-[#f0e5de] pt-3 text-xs font-black text-[#e85d75]">
                  <span className="inline-flex items-center gap-1">
                    <Repeat2 size={14} />
                    最后有效入口：作品详情
                  </span>
                  <ArrowRight size={15} />
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
