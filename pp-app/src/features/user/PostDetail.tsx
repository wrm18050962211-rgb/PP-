import { ArrowLeft, Camera, Heart, MapPin, MessageCircle, Navigation, Share2, Star, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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

export function PostDetail() {
  const { postId } = useParams();
  return <PostDetailContent key={postId ?? 'default-post'} postId={postId} />;
}

function PostDetailContent({ postId }: { postId?: string }) {
  const { workDraft } = useAppData();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
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
    const carousel = carouselRef.current;
    if (!carousel) return;
    window.requestAnimationFrame(() => {
      carousel.scrollLeft = carousel.clientWidth;
    });
  }, [post.id]);

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

  return (
    <div className="min-h-dvh bg-[#16110f] text-white">
      <header className="fixed inset-x-0 top-0 z-40 mx-auto flex h-14 max-w-md items-center justify-between px-3 text-white">
        <Link to="/consumer" className="grid h-10 w-10 place-items-center rounded-full bg-black/32 backdrop-blur" aria-label="返回发现">
          <ArrowLeft size={20} />
        </Link>
        <div className="rounded-full bg-black/26 px-3 py-1 text-xs font-black backdrop-blur">作品</div>
        <div className="flex items-center gap-2">
          <button
            className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur ${saved ? 'bg-white text-[#3f302c]' : 'bg-black/32 text-white'}`}
            onClick={() => {
              setSaved((current) => !current);
              setToast(saved ? '已取消收藏' : '已收藏作品');
            }}
            aria-label="收藏作品"
          >
            <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-black/32 text-white backdrop-blur" onClick={handleShare} aria-label="分享作品">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <div ref={carouselRef} className="flex h-dvh snap-x snap-mandatory overflow-x-auto scrollbar-none">
        <SideProfilePanel
          kind="creator"
          title="创作者"
          name={creator.name}
          avatar={creator.avatar}
          hero={creator.avatar}
          meta={creator.meta}
          tags={post.styleTags}
          to={`/consumer/creator/${creator.id}`}
          actionText="查看创作者主页"
          secondaryAction={
            <Link className="flex h-12 items-center justify-center rounded-full bg-white text-sm font-black text-[#3f302c]" to={`/consumer/companions?sameStyle=${post.id}`}>
              拍同款
            </Link>
          }
        />

        <main className="h-dvh w-full shrink-0 snap-center overflow-y-auto bg-[#16110f] pb-32">
          <section className="relative min-h-[84dvh] bg-black">
            <img className="absolute inset-0 h-full w-full object-cover" src={cover?.url} alt={post.location} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/82" />
            <div className="absolute bottom-0 left-0 right-0 space-y-3 px-4 pb-6">
              <div className="flex flex-wrap gap-2">
                {post.styleTags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-white/18 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="text-2xl font-black leading-tight text-white">{post.locationName || post.location}</h1>
              <p className="flex items-center gap-1 text-sm font-bold text-white/82">
                <MapPin size={15} />
                {post.location}
              </p>
              <p className="text-[15px] font-semibold leading-7 text-white/82">{post.caption}</p>
              <div className="flex items-center justify-between text-xs font-black text-white/62">
                <span>右滑看创作者</span>
                <span>上滑看评论</span>
                <span>左滑看摄影师</span>
              </div>
            </div>
          </section>

          <section className="bg-[#fbf7f2] px-4 pb-8 pt-4 text-[#3f302c]">
            <div className="mb-4 grid grid-cols-2 gap-3">
              <CompactRoleLink to={`/consumer/photographer/${photographer.id}`} icon={<Camera size={16} />} label="摄影师" name={photographer.name} avatar={photographer.avatar} />
              <CompactRoleLink to={`/consumer/creator/${creator.id}`} icon={<UserRound size={16} />} label="创作者" name={creator.name} avatar={creator.avatar} />
            </div>

            <div className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black">评论</h2>
                <span className="text-xs font-bold text-[#9b8e87]">创作者 / 摄影师</span>
              </div>
              <div className="mt-3 space-y-3">
                {comments.map((comment) => (
                  <article key={comment.id} className="rounded-[16px] bg-[#fbf7f2] p-3">
                    <div className="flex items-center gap-2">
                      <img className="h-9 w-9 rounded-full object-cover" src={comment.avatar} alt={comment.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{comment.name}</p>
                        <p className="text-xs font-bold text-[#e85d75]">{comment.role === 'creator' ? '创作者' : '摄影师'}</p>
                      </div>
                      {comment.rating ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-black text-[#8a5a12]">
                          <Star size={12} className="fill-[#f2c25b] text-[#f2c25b]" />
                          {comment.rating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#5f514b]">{comment.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </main>

        <SideProfilePanel
          kind="photographer"
          title="摄影师"
          name={photographer.name}
          avatar={photographer.photo || photographer.avatar}
          hero={photographer.photo || cover?.url}
          meta={`￥${Math.round((photographer.activities[0]?.priceCents || 0) / 100)}起 · ${photographer.ratingAvg.toFixed(1)}分`}
          tags={photographer.tags}
          to={`/consumer/photographer/${photographer.id}`}
          actionText="查看摄影师主页"
          secondaryAction={
            <button className="h-12 rounded-full bg-white text-sm font-black text-[#3f302c]" onClick={() => setBookingOpen(true)}>
              预约这位摄影师
            </button>
          }
        />
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 mx-auto grid w-full max-w-md grid-cols-2 gap-2 bg-black/26 px-3 py-3 backdrop-blur-xl">
        <button className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-[#3f302c]" onClick={() => setBookingOpen(true)}>
          <Camera size={17} />
          找摄影师
        </button>
        <Link className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/18 text-sm font-black text-white ring-1 ring-white/20" to={`/consumer/companions?sameStyle=${post.id}`}>
          <Navigation size={17} />
          拍同款
        </Link>
      </div>

      <BookingSheet companion={photographer} postId={post.id} open={bookingOpen} onClose={() => setBookingOpen(false)} />
      {toast ? <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-[#3f302c] px-4 py-2 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
    </div>
  );
}

function CompactRoleLink({ to, icon, label, name, avatar }: { to: string; icon: ReactNode; label: string; name: string; avatar: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-[16px] bg-white p-3 ring-1 ring-[#eadfd8]">
      <img className="h-10 w-10 rounded-[12px] object-cover" src={avatar} alt={name} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-black text-[#e85d75]">
          {icon}
          {label}
        </p>
        <p className="truncate text-sm font-black">{name}</p>
      </div>
    </Link>
  );
}

function SideProfilePanel({
  title,
  name,
  avatar,
  hero,
  meta,
  tags,
  to,
  actionText,
  secondaryAction,
}: {
  kind: 'creator' | 'photographer';
  title: string;
  name: string;
  avatar: string;
  hero?: string;
  meta: string;
  tags: readonly string[];
  to: string;
  actionText: string;
  secondaryAction: ReactNode;
}) {
  return (
    <aside className="relative h-dvh w-full shrink-0 snap-center overflow-hidden bg-black text-white">
      {hero ? <img className="absolute inset-0 h-full w-full object-cover opacity-74" src={hero} alt={name} /> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/28 to-black/88" />
      <div className="relative flex h-full flex-col justify-end px-5 pb-32 pt-20">
        <div className="flex items-center gap-4">
          <img className="h-20 w-20 rounded-[24px] object-cover ring-2 ring-white/60" src={avatar} alt={name} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/60">{title}</p>
            <h2 className="mt-1 truncate text-3xl font-black">{name}</h2>
            <p className="mt-2 text-sm font-bold text-white/76">{meta}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded-full bg-white/16 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-2">
          <Link className="flex h-12 items-center justify-center rounded-full bg-white text-sm font-black text-[#3f302c]" to={to}>
            {actionText}
          </Link>
          {secondaryAction}
        </div>
      </div>
    </aside>
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
