import { ArrowLeft, CalendarDays, Camera, MapPin, MessageCircle, Star } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';

export function PhotographerProfilePage() {
  const { photographerId } = useParams();
  const navigate = useNavigate();
  const posts = listFeedPosts();
  const photographerPosts = posts.filter((post) => post.companion.id === photographerId);
  const profilePost = photographerPosts[0] || posts[0];
  const photographer = profilePost.companion;
  const activity = photographer.activities[0];
  const slot = photographer.slots.find((item) => item.status === 'available') || photographer.slots[0];

  return (
    <div className="min-h-dvh bg-[#fbf7f2] pb-24 text-[#3f302c]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#eadfd8]/80 bg-[#fbf7f2]/94 px-4 py-3 backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm font-black">摄影师主页</p>
        <Link to="/consumer/messages" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" aria-label="咨询">
          <MessageCircle size={18} />
        </Link>
      </header>

      <section className="px-4 pt-4">
        <div className="rounded-[22px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <div className="flex gap-4">
            <img className="h-24 w-24 rounded-[22px] object-cover" src={photographer.photo || photographer.avatar} alt={photographer.name} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black">{photographer.name}</h1>
              <p className="mt-2 flex items-center gap-1 text-sm font-bold text-[#7a6b64]">
                <Star size={15} className="fill-[#f2c25b] text-[#f2c25b]" />
                {photographer.ratingAvg.toFixed(1)} · {photographer.ratingCount}条评价
              </p>
              <p className="mt-1 flex min-w-0 items-center gap-1 text-sm font-bold text-[#7a6b64]">
                <MapPin size={15} className="shrink-0 text-[#e85d75]" />
                <span className="truncate">{photographer.areas.slice(0, 3).join(' / ')}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
            <span className="rounded-[12px] bg-[#f6eee8] px-2 py-2">￥{Math.round((activity?.priceCents || 0) / 100)}起</span>
            <span className="rounded-[12px] bg-[#f6eee8] px-2 py-2">{photographerPosts.length || 1} 作品</span>
            <span className="rounded-[12px] bg-[#f6eee8] px-2 py-2">已认证</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-black text-white" to={`/consumer/post/${profilePost.id}`}>
              <Camera size={17} />
              查看作品
            </Link>
            <Link className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#f6eee8] text-sm font-black text-[#3f302c]" to="/consumer/messages">
              <MessageCircle size={17} />
              咨询
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 pt-4">
        <div className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <h2 className="text-base font-black">可约服务</h2>
          <div className="mt-3 space-y-2">
            {photographer.activities.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-[14px] bg-[#fbf7f2] px-3 py-3">
                <div>
                  <p className="text-sm font-black">{item.name}</p>
                  <p className="mt-1 text-xs font-bold text-[#7a6b64]">{item.durationLabel}</p>
                </div>
                <span className="text-sm font-black">￥{Math.round(item.priceCents / 100)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs font-bold text-[#7a6b64]">
            <CalendarDays size={14} className="text-[#9fb89f]" />
            最近可约：{slot?.label || '待开放'}
          </p>
        </div>
      </section>

      <section className="px-4 pt-5">
        <h2 className="mb-3 text-base font-black">作品</h2>
        <div className="grid grid-cols-3 gap-2">
          {(photographerPosts.length ? photographerPosts : [profilePost]).map((post) => (
            <Link key={post.id} to={`/consumer/post/${post.id}`} className="aspect-[0.76] overflow-hidden rounded-[14px] bg-[#eadfd8]">
              <img className="h-full w-full object-cover" src={post.images[0]?.url} alt={post.location} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
