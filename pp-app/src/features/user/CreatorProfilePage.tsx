import { ArrowLeft, Camera, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';
import { buildCreator } from './PostDetail';

export function CreatorProfilePage() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const [photographersOpen, setPhotographersOpen] = useState(false);
  const posts = listFeedPosts();
  const ownedPosts = posts.filter((post) => buildCreator(post).id === creatorId);
  const profilePost = ownedPosts[0] || posts[0];
  const creator = buildCreator(profilePost);
  const works = ownedPosts.length ? ownedPosts : posts.slice(0, 9);
  const photographers = Array.from(new Map(works.map((post) => [post.companion.id, post.companion])).values());
  const handle = creator.id.replace(/^creator-/, '@');
  const likeTotal = works.reduce((sum, post) => sum + 1180 + stableMetricSeed(post.id, 620), 0);
  const followerCount = 120 + works.length * 8;

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-[#050505]/94 px-4 backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center text-white/88" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={24} />
        </button>
        <p className="min-w-0 truncate text-lg font-black tracking-tight">{handle}</p>
        <Link to="/consumer/messages" className="grid h-10 w-10 place-items-center text-white/88" aria-label="发消息">
          <MessageCircle size={20} />
        </Link>
      </header>

      <section className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-5">
          <img className="h-[86px] w-[86px] shrink-0 rounded-full object-cover ring-1 ring-white/14" src={creator.avatar} alt={creator.name} />
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
            <ProfileStat value={formatMetric(likeTotal)} label="点赞数" />
            <ProfileStat value={followerCount} label="关注数" />
            <ProfileStat value={photographers.length} label="合作过的摄影师" onClick={() => setPhotographersOpen(true)} />
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-base font-black">{creator.name}</h1>
          <p className="mt-1 text-sm font-semibold leading-5 text-white/72">{buildCreatorBio(profilePost)}</p>
          <p className="mt-2 text-sm font-black text-white/88">{handle}</p>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_40px] gap-2">
          <button className="h-10 rounded-[6px] bg-[#4d5dff] text-sm font-black text-white">
            关注
          </button>
          <Link className="flex h-10 items-center justify-center rounded-[6px] bg-white/12 text-sm font-black text-white" to="/consumer/messages">
            发消息
          </Link>
          <Link className="grid h-10 place-items-center rounded-[6px] bg-white/12 text-white" to={`/consumer/companions?sameStyle=${profilePost.id}`} aria-label="拍同款">
            <Camera size={18} />
          </Link>
        </div>
      </section>

      <WorkGrid works={works} />
      {photographersOpen ? <CollaboratedPhotographersSheet photographers={photographers} onClose={() => setPhotographersOpen(false)} /> : null}
    </div>
  );
}

function ProfileStat({ value, label, onClick }: { value: number | string; label: string; onClick?: () => void }) {
  const content = (
    <>
      <p className="text-xl font-black leading-6">{value}</p>
      <p className="mt-0.5 text-xs font-semibold leading-4 text-white/62">{label}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="min-w-0 text-center" onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <div>
      {content}
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

function buildCreatorBio(post: FeedPost) {
  const tags = post.styleTags.slice(0, 2).join(' / ');
  const location = post.locationName || post.location;
  return `${location} · ${tags || '创作样板'}。喜欢用作品记录路线、场景和可复拍的风格。`;
}

function CollaboratedPhotographersSheet({ photographers, onClose }: { photographers: FeedPost['companion'][]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/58" onClick={onClose}>
      <section className="max-h-[72dvh] w-full overflow-y-auto rounded-t-[18px] bg-[#111] px-4 pb-6 pt-4 text-white" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black">合作过的摄影师</h2>
            <p className="mt-1 text-xs font-semibold text-white/46">{photographers.length} 位</p>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg font-black" onClick={onClose} aria-label="关闭">
            x
          </button>
        </div>

        <div className="space-y-2">
          {photographers.map((photographer) => (
            <Link key={photographer.id} to={`/consumer/photographer/${photographer.id}`} className="flex items-center gap-3 rounded-[10px] bg-white/[0.06] p-3" onClick={onClose}>
              <img className="h-12 w-12 shrink-0 rounded-full object-cover" src={photographer.avatar || photographer.photo} alt={photographer.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{photographer.name}</p>
                <p className="mt-1 truncate text-xs font-semibold text-white/52">{photographer.areas.slice(0, 2).join(' / ')}</p>
              </div>
              <span className="text-xs font-black text-white/62">{photographer.ratingAvg.toFixed(1)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function stableMetricSeed(value: string, range: number) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % range;
}

function formatMetric(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
