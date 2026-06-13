import { ArrowLeft, Bookmark, Heart, MapPin, MessageCircle, Share2, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { BookingSheet } from '../../components/BookingSheet';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import { buildApprovedWorkPost, fetchPostDetail, getPostDetail, getPostTitle, listFeedPosts } from '../../services/feedService';
import { isPostFavorited, isPostLiked, toggleFavoritePost, toggleLikedPost } from '../../services/userCollectionService';
import type { FeedPost, PostImage, PublishedWorkDraft } from '../../types/api';

type Comment = {
  id: string;
  role: 'creator' | 'photographer' | 'consumer';
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
  const imageTrackRef = useRef<HTMLDivElement>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerType>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const [toast, setToast] = useState('');
  const [remotePost, setRemotePost] = useState(() => getInitialPost(postId, workDraft));
  const localPost = useMemo(() => buildApprovedWorkPost(workDraft), [workDraft]);
  const post = localPost && localPost.id === postId ? localPost : remotePost;
  const collectionPosts = useMemo(() => {
    const posts = listFeedPosts();
    return posts.some((item) => item.id === post.id) ? posts : [post, ...posts];
  }, [post]);
  const postTitle = getPostTitle(post);
  const photographer = post.companion;
  const creator = buildCreator(post);
  const cover = post.images[0];
  const images = post.images;
  const activeMedia = images[activeImage] ?? cover;
  const isLandscape = getImageAspectRatio(activeMedia) >= 1;
  const mediaHeightClass = isLandscape ? (captionExpanded ? 'h-[44dvh]' : 'h-[58dvh]') : captionExpanded ? 'h-[56dvh]' : 'h-[66dvh]';
  const baseComments = useMemo(() => buildComments(post, creator), [post, creator.avatar, creator.name]);
  const comments = useMemo(() => [...baseComments, ...localComments], [baseComments, localComments]);
  const likeCount = useMemo(() => formatMetric(1180 + stableMetricSeed(post.id, 620)), [post.id]);
  const shareCount = useMemo(() => formatMetric(260 + stableMetricSeed(`${post.id}-share`, 180)), [post.id]);

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

  useEffect(() => {
    setActiveImage(0);
    setLiked(isPostLiked(post.id, collectionPosts));
    setBookmarked(isPostFavorited(post.id, collectionPosts));
    setCaptionExpanded(false);
    setCommentsOpen(false);
    setCommentText('');
    setLocalComments([]);
    imageTrackRef.current?.scrollTo({ left: 0 });
  }, [collectionPosts, post.id]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: postTitle, text: post.caption, url: window.location.href });
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

  const scrollToImage = (index: number) => {
    const track = imageTrackRef.current;
    if (!track || images.length === 0) return;
    const nextIndex = Math.min(Math.max(index, 0), images.length - 1);
    track.scrollTo({ left: nextIndex * track.clientWidth, behavior: 'smooth' });
    setActiveImage(nextIndex);
  };

  const handleImageScroll = () => {
    const track = imageTrackRef.current;
    if (!track || track.clientWidth === 0 || images.length === 0) return;
    const nextIndex = Math.round(track.scrollLeft / track.clientWidth);
    setActiveImage(Math.min(Math.max(nextIndex, 0), images.length - 1));
  };

  const submitComment = () => {
    const nextText = commentText.trim();
    if (!nextText) return;

    setLocalComments((current) => [
      ...current,
      {
        id: `local-comment-${Date.now()}`,
        role: 'consumer',
        name: '我',
        avatar: creator.avatar,
        text: nextText,
      },
    ]);
    setCommentText('');
  };

  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      <header className="fixed inset-x-0 top-0 z-40 mx-auto max-w-md bg-black/96 px-3 py-2 text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className="grid h-14 grid-cols-[30px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
          <Link to="/consumer" className="grid h-8 w-8 place-items-center text-white/88" aria-label="返回发现">
            <ArrowLeft size={22} />
          </Link>
          <ProfileIdentityButton role="创作者" name={creator.name} avatar={creator.avatar} onClick={() => setDrawer('creator')} />
          <ProfileIdentityButton
            align="right"
            role="摄影师"
            name={photographer.name}
            avatar={photographer.photo || photographer.avatar}
            onClick={() => setDrawer('photographer')}
          />
        </div>
      </header>

      <main className={`h-dvh bg-black pt-[72px] ${captionExpanded ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        <section className="bg-black">
          <div ref={imageTrackRef} className={`flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth bg-black scrollbar-none ${mediaHeightClass}`} onScroll={handleImageScroll}>
            {images.map((image, index) => (
              <figure key={image.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center bg-black">
                <LivePhotoMedia media={image} alt={`${post.location} 第${index + 1}张`} fit="contain" loading={index === 0 ? 'eager' : 'lazy'} />
              </figure>
            ))}
          </div>

          {images.length > 1 ? (
            <div className="flex h-5 items-center justify-center gap-1.5 bg-black">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  className={`h-1.5 rounded-full transition-all ${index === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/32'}`}
                  onClick={() => scrollToImage(index)}
                  aria-label={`查看第${index + 1}张作品图`}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="bg-black px-4 pb-4 pt-2 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <button
                className="inline-flex items-center gap-1.5 text-white"
                onClick={() => {
                  const nextLiked = toggleLikedPost(post.id, collectionPosts);
                  setLiked(nextLiked);
                  setToast(nextLiked ? '已点赞' : '已取消点赞');
                }}
                aria-label="点赞作品"
              >
                <Heart size={27} fill={liked ? 'currentColor' : 'none'} />
                <span className="text-sm font-bold">{likeCount}</span>
              </button>
              <button
                className="text-white"
                onClick={() => {
                  const nextBookmarked = toggleFavoritePost(post.id, collectionPosts);
                  setBookmarked(nextBookmarked);
                  setToast(nextBookmarked ? '已收藏' : '已取消收藏');
                }}
                aria-label="收藏作品"
              >
                <Bookmark size={27} fill={bookmarked ? 'currentColor' : 'none'} />
              </button>
              <button className="inline-flex items-center gap-1.5 text-white" onClick={handleShare} aria-label="转发作品">
                <Share2 size={26} />
                <span className="text-sm font-bold">{shareCount}</span>
              </button>
              <button className="inline-flex items-center gap-1.5 text-white" onClick={() => setCommentsOpen(true)} aria-label="查看评论">
                <MessageCircle size={27} />
                <span className="text-sm font-bold">{comments.length}</span>
              </button>
            </div>

            <button className="flex min-w-0 max-w-[34%] items-center justify-end gap-1 text-xs font-semibold text-white/58" onClick={() => setDrawer('photographer')}>
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{post.locationName || post.location}</span>
            </button>
          </div>

          <div className="mt-3">
            <h1 className="line-clamp-1 text-[14px] font-black leading-5 text-white">{postTitle}</h1>
            <p className={`mt-1 ${captionExpanded ? '' : 'line-clamp-1'} text-[13px] leading-5 text-white/84`}>
              <button className="mr-1 font-black text-white" onClick={() => setDrawer('creator')}>
                {creator.name}
              </button>
              {post.caption}
            </p>
            <button className="mt-1 text-xs font-semibold text-white/38" onClick={() => setCaptionExpanded((current) => !current)}>
              {captionExpanded ? '收起' : '展开'}
            </button>
            {captionExpanded ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.styleTags.slice(0, 4).map((tag) => (
                  <span key={tag} className="border border-white/12 px-2 py-1 text-[11px] font-bold text-white/48">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
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
        meta={`¥${Math.round((photographer.activities[0]?.priceCents || 0) / 100)}起 · ${photographer.ratingAvg.toFixed(1)}分`}
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

      <CommentSheet
        open={commentsOpen}
        comments={comments}
        value={commentText}
        onChange={setCommentText}
        onClose={() => setCommentsOpen(false)}
        onSubmit={submitComment}
      />

      <BookingSheet companion={photographer} postId={post.id} open={bookingOpen} onClose={() => setBookingOpen(false)} />
      {toast ? <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black shadow-xl">{toast}</div> : null}
    </div>
  );
}

function ProfileIdentityButton({
  role,
  name,
  avatar,
  align = 'left',
  onClick,
}: {
  role: string;
  name: string;
  avatar: string;
  align?: 'left' | 'right';
  onClick: () => void;
}) {
  return (
    <button className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'justify-end text-right' : ''}`} onClick={onClick}>
      <img className={`h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/28 ${align === 'right' ? 'order-2' : ''}`} src={avatar} alt={name} />
      <span className="min-w-0">
        <span className="block text-[10px] font-bold leading-3 text-white/46">{role}</span>
        <span className="block truncate text-[13px] font-black leading-4 text-white">{name}</span>
      </span>
    </button>
  );
}

function CommentSheet({
  open,
  comments,
  value,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  comments: Comment[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2">
      <button className="absolute inset-0 bg-black/58" onClick={onClose} aria-label="关闭评论" />
      <section className="absolute bottom-0 left-0 right-0 max-h-[78dvh] overflow-hidden rounded-t-[26px] bg-[#111] text-white shadow-2xl ring-1 ring-white/10">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/26" />
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h2 className="text-base font-black">评论</h2>
            <p className="text-xs font-semibold text-white/40">{comments.length} 条讨论</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-white" onClick={onClose} aria-label="关闭评论">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[48dvh] space-y-4 overflow-y-auto px-4 pb-4">
          {comments.map((comment) => (
            <article key={comment.id} className="flex gap-3">
              <img className="h-9 w-9 shrink-0 rounded-full object-cover" src={comment.avatar} alt={comment.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black">{comment.name}</p>
                  <span className="text-[11px] font-bold text-white/36">{getRoleLabel(comment.role)}</span>
                  {comment.rating ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#f2c25b]">
                      <Star size={11} className="fill-[#f2c25b]" />
                      {comment.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-6 text-white/72">{comment.text}</p>
              </div>
            </article>
          ))}
        </div>

        <form
          className="flex items-end gap-2 border-t border-white/10 bg-[#151515] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <textarea
            className="max-h-28 min-h-11 flex-1 resize-none rounded-[18px] border border-white/10 bg-white/8 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/32"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="发表评论..."
            rows={1}
          />
          <button className="h-11 rounded-full bg-white px-4 text-sm font-black text-black disabled:bg-white/16 disabled:text-white/26" disabled={!value.trim()} type="submit">
            发布
          </button>
        </form>
      </section>
    </div>
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

function getImageAspectRatio(image?: PostImage) {
  if (!image?.width || !image.height) return 3 / 4;
  return image.width / image.height;
}

function stableMetricSeed(value: string, range: number) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % range;
}

function formatMetric(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function getRoleLabel(role: Comment['role']) {
  if (role === 'creator') return '创作者';
  if (role === 'photographer') return '摄影师';
  return '用户';
}
