import { ArrowLeft, CalendarDays, Camera, Grid3X3, MapPin, MessageCircle, Repeat2, Star, UserRound } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';

export function PhotographerProfilePage() {
  const { photographerId } = useParams();
  const navigate = useNavigate();
  const posts = listFeedPosts();
  const photographerPosts = posts.filter((post) => post.companion.id === photographerId);
  const profilePost = photographerPosts[0] || posts[0];
  const photographer = profilePost.companion;
  const works = photographerPosts.length ? photographerPosts : [profilePost];
  const handle = `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`;

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-[#050505]/94 px-4 backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center text-white/88" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={24} />
        </button>
        <p className="min-w-0 truncate text-lg font-black tracking-tight">{handle}</p>
        <Link to="/consumer/messages" className="grid h-10 w-10 place-items-center text-white/88" aria-label="咨询">
          <MessageCircle size={20} />
        </Link>
      </header>

      <section className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-5">
          <img className="h-[86px] w-[86px] shrink-0 rounded-full object-cover ring-1 ring-white/14" src={photographer.avatar || photographer.photo} alt={photographer.name} />
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
            <ProfileStat value={works.length} label="作品" />
            <ProfileStat value={photographer.ratingCount} label="评价" />
            <ProfileStat value={photographer.ratingAvg.toFixed(1)} label="评分" />
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-base font-black">{photographer.name}</h1>
          <p className="mt-1 text-sm font-semibold leading-5 text-white/72">{photographer.bio}</p>
          <p className="mt-2 flex min-w-0 items-center gap-1 text-sm font-black text-white/88">
            <MapPin size={15} className="shrink-0" />
            <span className="truncate">{photographer.areas.slice(0, 3).join(' / ')}</span>
          </p>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_40px] gap-2">
          <Link className="flex h-10 items-center justify-center rounded-[6px] bg-[#4d5dff] text-sm font-black text-white" to={`/consumer/post/${profilePost.id}`}>
            看作品
          </Link>
          <Link className="flex h-10 items-center justify-center rounded-[6px] bg-white/12 text-sm font-black text-white" to="/consumer/messages">
            发消息
          </Link>
          <Link className="grid h-10 place-items-center rounded-[6px] bg-white/12 text-white" to={`/consumer/checkout/${profilePost.id}`} aria-label="预约">
            <UserRound size={18} />
          </Link>
        </div>
      </section>

      <section className="mx-4 mb-4 rounded-[10px] bg-white/[0.06] p-3 ring-1 ring-white/8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black">服务内容</h2>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-white/58">
            <Star size={12} className="fill-white/46 text-white/46" />
            {photographer.ratingAvg.toFixed(1)}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {photographer.activities.slice(0, 3).map((item) => (
            <Link key={item.id} to={`/consumer/checkout/${profilePost.id}`} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-[6px] bg-black/24 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-white">{item.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-white/46">{item.durationLabel}</p>
              </div>
              <span className="text-xs font-black text-white">¥{Math.round(item.priceCents / 100)}</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-white/48">
          <CalendarDays size={13} />
          {buildSlotSummary(photographer.slots)}
        </p>
      </section>

      <ProfileTabs />
      <WorkGrid works={works} />
    </div>
  );
}

function ProfileStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <p className="text-xl font-black leading-6">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-white/62">{label}</p>
    </div>
  );
}

function ProfileTabs() {
  return (
    <div className="grid grid-cols-4 border-y border-white/10 text-white/60">
      <button className="flex h-12 items-center justify-center border-b-2 border-white text-white" aria-label="作品网格">
        <Grid3X3 size={21} />
      </button>
      <button className="flex h-12 items-center justify-center" aria-label="拍摄">
        <Camera size={21} />
      </button>
      <button className="flex h-12 items-center justify-center" aria-label="转发">
        <Repeat2 size={21} />
      </button>
      <button className="flex h-12 items-center justify-center" aria-label="个人">
        <UserRound size={21} />
      </button>
    </div>
  );
}

function WorkGrid({ works }: { works: FeedPost[] }) {
  return (
    <section className="grid grid-cols-3 gap-[1px] bg-black">
      {works.map((post) => (
        <Link key={post.id} to={`/consumer/post/${post.id}`} className="relative aspect-[0.76] overflow-hidden bg-[#111]" aria-label={`查看作品 ${getPostTitle(post)}`}>
          <img className="h-full w-full object-cover" src={post.images[0]?.url} alt={getPostTitle(post)} loading="lazy" />
          {post.images.length > 1 ? <span className="absolute right-1.5 top-1.5 h-4 w-4 rounded-[4px] border border-white/80 bg-black/12" /> : null}
        </Link>
      ))}
    </section>
  );
}

function buildSlotSummary(slots: FeedPost['companion']['slots']) {
  const available = slots.filter((slot) => slot.status === 'available').slice(0, 3);
  if (!available.length) return '近期时间待开放';
  return `可约时间：${available.map((slot) => slot.label).join(' / ')}`;
}
