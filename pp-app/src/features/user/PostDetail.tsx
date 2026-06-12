import { ArrowLeft, Camera, Heart, MapPin, MessageCircle, Navigation, Share2, Sparkles, Star, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  const [bookingOpen, setBookingOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');
  const [remotePost, setRemotePost] = useState(() => getInitialPost(postId, workDraft));
  const localPost = useMemo(() => buildApprovedWorkPost(workDraft), [workDraft]);
  const post = localPost && localPost.id === postId ? localPost : remotePost;
  const photographer = post.companion;
  const creator = buildCreator(post);
  const priceText = photographer.activities[0] ? `￥${Math.round(photographer.activities[0].priceCents / 100)}起` : '可预约';
  const comments = buildComments(post, creator);

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

  return (
    <div className="min-h-dvh bg-[#fbf7f2] pb-32 text-[#3f302c]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#eadfd8]/80 bg-[#fbf7f2]/94 px-4 py-3 backdrop-blur-xl">
        <Link to="/consumer" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" aria-label="返回发现">
          <ArrowLeft size={20} />
        </Link>
        <p className="text-sm font-black">作品详情</p>
        <div className="flex items-center gap-2">
          <button
            className={`grid h-10 w-10 place-items-center rounded-full ${saved ? 'bg-[#3f302c] text-white' : 'bg-white text-[#3f302c] ring-1 ring-[#eadfd8]'}`}
            onClick={() => {
              setSaved((current) => !current);
              setToast(saved ? '已取消收藏' : '已收藏风格');
            }}
            aria-label="收藏作品"
          >
            <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" onClick={handleShare} aria-label="分享作品">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <section className="bg-[#fbf7f2] px-3 pt-3">
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-none">
          {post.images.map((image, index) => (
            <button
              key={image.id}
              className="relative h-[62dvh] w-[92%] shrink-0 snap-center overflow-hidden rounded-[22px] bg-[#eadfd8]"
              aria-label={`查看第${index + 1}张作品图`}
            >
              <img className="h-full w-full object-cover" src={image.url} alt={`${post.location} 第${index + 1}张`} loading={index === 0 ? 'eager' : 'lazy'} />
              <span className="absolute right-3 top-3 rounded-full bg-white/86 px-3 py-1.5 text-xs font-black text-[#3f302c] backdrop-blur">
                {index + 1}/{post.images.length}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 px-4 pt-4">
        <div className="rounded-[18px] bg-white p-4 shadow-[0_10px_28px_rgba(91,64,49,0.07)] ring-1 ring-[#eadfd8]/80">
          <div className="flex flex-wrap gap-2">
            {post.styleTags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#f6eee8] px-3 py-1.5 text-xs font-black text-[#7a6b64]">
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mt-4 text-2xl font-black leading-tight">{post.locationName || post.location}</h1>
          <p className="mt-2 flex items-center gap-1 text-sm font-bold text-[#7a6b64]">
            <MapPin size={15} className="text-[#e85d75]" />
            {post.location}
          </p>
          <p className="mt-4 text-[15px] leading-7 text-[#5f514b]">{post.caption}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <RoleCard
            title="创作者"
            name={creator.name}
            avatar={creator.avatar}
            meta={creator.meta}
            icon={<UserRound size={16} />}
            actionText="看TA风格"
          />
          <RoleCard
            title="摄影师"
            name={photographer.name}
            avatar={photographer.avatar}
            meta={`${priceText} · ${photographer.ratingAvg.toFixed(1)}分`}
            icon={<Camera size={16} />}
            actionText="看服务"
          />
        </div>

        <div className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <div className="flex items-center gap-2 text-sm font-black">
            <Sparkles size={17} className="text-[#e85d75]" />
            你可以这样拍
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="rounded-[16px] bg-[#3f302c] px-3 py-3 text-left text-white" onClick={() => setBookingOpen(true)}>
              <span className="block text-sm font-black">找作品摄影师拍</span>
              <span className="mt-1 block text-xs leading-5 text-white/76">直接预约这组作品对应的摄影师，风格还原度最高。</span>
            </button>
            <Link className="rounded-[16px] bg-[#f6eee8] px-3 py-3 text-left text-[#3f302c]" to={`/consumer/companions?sameStyle=${post.id}`}>
              <span className="block text-sm font-black">拍同款</span>
              <span className="mt-1 block text-xs leading-5 text-[#7a6b64]">按定位或自选位置，推荐能拍类似风格的摄影师。</span>
            </Link>
          </div>
        </div>

        <section className="rounded-[18px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black">评论</h2>
            <span className="text-xs font-bold text-[#9b8e87]">创作者和摄影师都可参与</span>
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
        </section>
      </section>

      <div className="fixed inset-x-0 bottom-16 z-30 mx-auto grid w-full max-w-md grid-cols-2 gap-2 bg-white/92 px-3 py-3 shadow-[0_-12px_30px_rgba(91,64,49,0.08)] backdrop-blur">
        <button className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-black text-white" onClick={() => setBookingOpen(true)}>
          <Camera size={17} />
          找摄影师
        </button>
        <Link className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#f6eee8] text-sm font-black text-[#3f302c]" to={`/consumer/companions?sameStyle=${post.id}`}>
          <Navigation size={17} />
          拍同款
        </Link>
      </div>

      <BookingSheet companion={photographer} postId={post.id} open={bookingOpen} onClose={() => setBookingOpen(false)} />
      {toast ? <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-[#3f302c] px-4 py-2 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
    </div>
  );
}

function RoleCard({
  title,
  name,
  avatar,
  meta,
  icon,
  actionText,
}: {
  title: string;
  name: string;
  avatar: string;
  meta: string;
  icon: ReactNode;
  actionText: string;
}) {
  return (
    <article className="rounded-[18px] bg-white p-3 ring-1 ring-[#eadfd8]">
      <div className="flex items-center gap-2 text-xs font-black text-[#e85d75]">
        {icon}
        {title}
      </div>
      <img className="mt-3 h-16 w-16 rounded-[18px] object-cover" src={avatar} alt={name} />
      <h2 className="mt-2 truncate text-base font-black">{name}</h2>
      <p className="mt-1 line-clamp-2 min-h-9 text-xs font-semibold leading-5 text-[#7a6b64]">{meta}</p>
      <button className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-full bg-[#f6eee8] text-xs font-black text-[#3f302c]">
        <MessageCircle size={14} />
        {actionText}
      </button>
    </article>
  );
}

function buildCreator(post: FeedPost) {
  return {
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
      text: '这组图的核心是自然走动和轻松表情，如果拍同款，建议保留同样的街区光线和穿搭层次。',
    },
    {
      id: 'photographer-comment',
      role: 'photographer',
      name: post.companion.name,
      avatar: post.companion.avatar,
      rating: post.companion.ratingAvg,
      text: '可以约原路线，也可以根据你的位置调整到附近类似街区。拍摄前会先确认预算、时间、风格和修图需求。',
    },
  ];
}

function getInitialPost(postId: string | undefined, workDraft: PublishedWorkDraft): FeedPost {
  const localPost = buildApprovedWorkPost(workDraft);
  if (localPost && localPost.id === postId) return localPost;
  return getPostDetail(postId);
}
