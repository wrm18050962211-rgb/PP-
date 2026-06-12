import { ArrowLeft, Camera, Heart, MapPin, MessageCircle, Share2, Star, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { BookingSheet } from '../../components/BookingSheet';
import { buildApprovedWorkPost, fetchPostDetail, getPostDetail } from '../../services/feedService';
import type { FeedPost, PublishedWorkDraft } from '../../types/api';

type Comment = {
  id: string;
  role: 'creator' | 'photographer';
  name: string;
  avatar: string;
  text: string;
  rating?: number;
};

type DrawerType = 'creator' | 'photographer' | null;

export function PostDetail() {
  const { postId } = useParams();
  return <PostDetailContent key={postId ?? 'default-post'} postId={postId} />;
}

function PostDetailContent({ postId }: { postId?: string }) {
  const { workDraft } = useAppData();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');
  const [remotePost, setRemotePost] = useState(() => getInitialPost(postId, workDraft));
  const localPost = useMemo(() => buildApprovedWorkPost(workDraft), [workDraft]);
  const post = localPost && localPost.id === postId ? localPost : remotePost;
  const photographer = post.companion;
  const creator = buildCreator(post);
  const comments = buildComments(post, creator);
  const cover = post.images[0];

  useEffect(() => {
    let mounted = true;
    if (localPost && localPost.id === postId) return () => undefined;

    fetchPostDetail(postId).then((nextPost) => {
      if (mounted) setRemotePost(nextPost);
    });

    return () => {
      mounted = false;
    };
  }, [localPost, postId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: post.location, text: post.caption, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setToast('链接已复制');
    } catch {
      setToast('分享已取消');
    }
  };

  const openBooking = () => {
    setDrawer(null);
    setBookingOpen(true);
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      <header className="fixed inset-x-0 top-0 z-40 mx-auto grid h-14 max-w-md grid-cols-[44px_minmax(70px,1fr)_44px_44px_minmax(70px,1fr)] items-center gap-2 px-3 text-white">
        <Link to="/consumer" className="grid h-10 w-10 place-items-center rounded-full bg-black/32 backdrop-blur" aria-label="返回发现">
          <ArrowLeft size={20} />
        </Link>
        <TopBarAction icon={<UserRound size={15} />} label="创作者" onClick={() => setDrawer('creator')} />
        <button
          className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur ${saved ? 'bg-white text-[#3f302c]' : 'bg-black/32 text-white'}`}
          onClick={() => {
            setSaved((current) => !current);
            setToast(saved ? '已取消收藏' : '已收藏作品');
          }}
          aria-label="喜欢作品"
        >
          <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
        <button className="grid h-10 w-10 place-items-center rounded-full bg-black/32 text-white backdrop-blur" onClick={handleShare} aria-label="分享作品">
          <Share2 size={18} />
        </button>
        <TopBarAction icon={<Camera size={15} />} label="摄影师" onClick={() => setDrawer('photographer')} />
      </header>

      <main className="h-dvh snap-y snap-mandatory overflow-y-auto bg-black">
        <section className="relative h-dvh snap-start overflow-hidden bg-black">
          <img className="absolute inset-0 h-full w-full object-cover" src={cover?.url} alt={post.location} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/24 via-transparent to-black/68" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24">
            <div className="max-w-[92%] space-y-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-white/62">
                <MapPin size={13} />
                {post.locationName || post.location}
              </p>
              <p className="text-[13px] font-medium leading-6 text-white/68">{post.caption}</p>
              <div className="flex flex-wrap gap-1.5">
                {post.styleTags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-bold text-white/58 backdrop-blur">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-dvh snap-start bg-[#fbf7f2] px-4 pb-8 pt-16 text-[#3f302c]">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-xl font-black">
              <MessageCircle size={20} className="text-[#e85d75]" />
              评论
            </h1>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#9b8e87] ring-1 ring-[#eadfd8]">{comments.length}</span>
          </div>
          <div className="mt-5 space-y-3">
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
                <div className="flex items-center gap-3">
                  <img className="h-10 w-10 rounded-full object-cover" src={comment.avatar} alt={comment.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{comment.name}</p>
                    <p className="text-xs font-bold text-[#e85d75]">{comment.role === 'creator' ? '创作者' : '摄影师'}</p>
                  </div>
                  {comment.rating ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fbf7f2] px-2 py-1 text-xs font-black text-[#8a5a12]">
                      <Star size={12} className="fill-[#f2c25b] text-[#f2c25b]" />
                      {comment.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#5f514b]">{comment.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <ProfileDrawer
        open={drawer === 'creator'}
        side="left"
        title="创作者"
        name={creator.name}
        avatar={creator.avatar}
        hero={creator.avatar}
        meta={creator.meta}
        tags={post.styleTags}
        onClose={() => setDrawer(null)}
      >
        <Link className="flex h-12 items-center justify-center rounded-full bg-[#3f302c] text-sm font-black text-white" to={`/consumer/creator/${creator.id}`}>
          查看创作者主页
        </Link>
        <Link className="flex h-12 items-center justify-center rounded-full bg-[#f6eee8] text-sm font-black text-[#3f302c] ring-1 ring-[#eadfd8]" to={`/consumer/companions?sameStyle=${post.id}`}>
          拍同款
        </Link>
      </ProfileDrawer>

      <ProfileDrawer
        open={drawer === 'photographer'}
        side="right"
        title="摄影师"
        name={photographer.name}
        avatar={photographer.photo || photographer.avatar}
        hero={photographer.photo || cover?.url}
        meta={`￥${Math.round((photographer.activities[0]?.priceCents || 0) / 100)}起 · ${photographer.ratingAvg.toFixed(1)}分`}
        tags={photographer.tags}
        onClose={() => setDrawer(null)}
      >
        <button className="h-12 rounded-full bg-[#3f302c] text-sm font-black text-white" onClick={openBooking}>
          预约这位摄影师
        </button>
        <Link className="flex h-12 items-center justify-center rounded-full bg-[#f6eee8] text-sm font-black text-[#3f302c] ring-1 ring-[#eadfd8]" to={`/consumer/photographer/${photographer.id}`}>
          查看摄影师主页
        </Link>
      </ProfileDrawer>

      <BookingSheet companion={photographer} postId={post.id} open={bookingOpen} onClose={() => setBookingOpen(false)} />
      {toast ? <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-[#3f302c] px-4 py-2 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
    </div>
  );
}

function TopBarAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex h-10 min-w-0 items-center justify-center gap-1 rounded-full bg-black/32 px-2 text-xs font-black text-white backdrop-blur" onClick={onClick}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function ProfileDrawer({
  open,
  side,
  title,
  name,
  avatar,
  hero,
  meta,
  tags,
  onClose,
  children,
}: {
  open: boolean;
  side: 'left' | 'right';
  title: string;
  name: string;
  avatar: string;
  hero?: string;
  meta: string;
  tags: readonly string[];
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-y-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2">
      <button className="pointer-events-auto absolute inset-0 bg-black/42" onClick={onClose} aria-label="关闭侧栏" />
      <aside
        className={`pointer-events-auto absolute inset-y-0 w-[82%] max-w-[330px] overflow-y-auto bg-[#fbf7f2] text-[#3f302c] shadow-2xl ${
          side === 'left' ? 'left-0 rounded-r-[24px]' : 'right-0 rounded-l-[24px]'
        }`}
      >
        <div className="relative h-56 overflow-hidden bg-[#eadfd8]">
          {hero ? <img className="h-full w-full object-cover" src={hero} alt={name} /> : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/52" />
          <button className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/88 text-[#3f302c] backdrop-blur" onClick={onClose} aria-label="关闭侧栏">
            <X size={18} />
          </button>
          <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3 text-white">
            <img className="h-16 w-16 rounded-[20px] object-cover ring-2 ring-white/70" src={avatar} alt={name} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-white/72">{title}</p>
              <h2 className="truncate text-2xl font-black">{name}</h2>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-4">
          <p className="text-sm font-bold leading-6 text-[#7a6b64]">{meta}</p>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 6).map((tag) => (
              <span key={tag} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#7a6b64] ring-1 ring-[#eadfd8]">
                {tag}
              </span>
            ))}
          </div>
          <div className="grid gap-2">{children}</div>
        </div>
      </aside>
    </div>
  );
}

export function buildCreator(post: FeedPost) {
  return {
    id: `creator-${post.id}`,
    name: post.companion.isVirtual ? `${post.companion.name} Creator` : '作品创作者',
    avatar: post.images[1]?.url || post.companion.photo || post.companion.avatar,
    meta: `${post.city || '同城'} · ${post.styleTags.slice(0, 2).join(' / ') || '风格作品'}`,
  };
}

function buildComments(post: FeedPost, creator: ReturnType<typeof buildCreator>): Comment[] {
  return [
    {
      id: 'creator-comment',
      role: 'creator',
      name: creator.name,
      avatar: creator.avatar,
      text: '这组图的重点是自然走动和轻松表情，拍同款时可以保留街区光线和穿搭层次。',
    },
    {
      id: 'photographer-comment',
      role: 'photographer',
      name: post.companion.name,
      avatar: post.companion.avatar,
      rating: post.companion.ratingAvg,
      text: '可以约原路线，也可以按你的位置调整到附近类似街区。拍摄前会确认预算、时间、风格和修图需求。',
    },
  ];
}

function getInitialPost(postId: string | undefined, workDraft: PublishedWorkDraft): FeedPost {
  const localPost = buildApprovedWorkPost(workDraft);
  if (localPost && localPost.id === postId) return localPost;
  return getPostDetail(postId);
}
