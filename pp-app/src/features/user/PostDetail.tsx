import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  Maximize2,
  Share2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { BookingSheet } from '../../components/BookingSheet';
import { Chip } from '../../components/Chip';
import { buildApprovedWorkPost, fetchPostDetail, getPostDetail } from '../../services/feedService';
import type { FeedPost, PublishedWorkDraft } from '../../types/api';

export function PostDetail() {
  const { postId } = useParams();
  return <PostDetailContent key={postId ?? 'default-post'} postId={postId} />;
}

function PostDetailContent({ postId }: { postId?: string }) {
  const { workDraft } = useAppData();
  const galleryRef = useRef<HTMLDivElement>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');
  const [remotePost, setRemotePost] = useState(() => getInitialPost(postId, workDraft));
  const localPost = useMemo(() => buildApprovedWorkPost(workDraft), [workDraft]);
  const post = localPost && localPost.id === postId ? localPost : remotePost;

  const goToImage = useCallback(
    (index: number) => {
      const nextIndex = (index + post.images.length) % post.images.length;
      setActiveImage(nextIndex);
      const gallery = galleryRef.current;
      const target = gallery?.children.item(nextIndex) as HTMLElement | null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    },
    [post.images.length],
  );

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
    const nextImage = post.images[activeImage + 1] ?? post.images[0];
    if (!nextImage) return;

    const preload = new Image();
    preload.src = nextImage.url;
  }, [activeImage, post.images]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (bookingOpen) return;
      if (event.key === 'Escape' && viewerOpen) setViewerOpen(false);
      if (event.key === 'ArrowLeft') goToImage(activeImage - 1);
      if (event.key === 'ArrowRight') goToImage(activeImage + 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImage, bookingOpen, goToImage, viewerOpen]);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(''), 1600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const syncActiveImage = () => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const center = gallery.scrollLeft + gallery.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    Array.from(gallery.children).forEach((child, index) => {
      const item = child as HTMLElement;
      const itemCenter = item.offsetLeft + item.clientWidth / 2;
      const distance = Math.abs(center - itemCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveImage(nearestIndex);
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.location} · ${post.activity}`,
          text: post.caption,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
      setToast('链接已复制');
    } catch {
      setToast('分享已取消');
    }
  };

  return (
    <div className="min-h-dvh pp-page pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#eadfd8]/80 bg-[#fbf7f2]/92 px-4 py-3 backdrop-blur-xl">
        <Link to="/consumer" className="grid h-10 w-10 place-items-center rounded-full bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]" aria-label="返回发现页">
          <ArrowLeft size={20} />
        </Link>
        <p className="text-sm font-semibold text-[#5f514b]">帖子详情</p>
        <div className="flex h-10 items-center gap-2">
          <button
            className={`grid h-10 w-10 place-items-center rounded-full ${saved ? 'pp-primary' : 'bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]'}`}
            onClick={() => {
              setSaved((current) => !current);
              setToast(saved ? '已取消收藏' : '已收藏');
            }}
            aria-label={saved ? '取消收藏' : '收藏帖子'}
          >
            <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white/78 text-[#3f302c] ring-1 ring-[#eadfd8]" onClick={handleShare} aria-label="分享帖子">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <section className="relative bg-[#fbf7f2]">
        <div ref={galleryRef} className="flex snap-x snap-mandatory overflow-x-auto px-3 pt-3 scrollbar-none" onScroll={syncActiveImage}>
          {post.images.map((image, index) => (
            <figure key={image.id} className="relative mr-3 h-[64dvh] w-[92%] shrink-0 snap-center overflow-hidden rounded-[22px] bg-[#eadfd8] last:mr-0">
              <button className="h-full w-full" onClick={() => setViewerOpen(true)} aria-label={`放大查看第 ${index + 1} 张图片`}>
                <img className="h-full w-full object-cover" src={image.url} alt={`${post.location} 第 ${index + 1} 张`} loading={index === 0 ? 'eager' : 'lazy'} />
              </button>
              <div className="absolute right-3 top-3 rounded-full bg-white/82 px-3 py-1.5 text-xs font-bold text-[#3f302c] backdrop-blur">
                {index + 1}/{post.images.length}
              </div>
            </figure>
          ))}
        </div>

        {post.images.length > 1 ? (
          <>
            <button
              className="absolute left-5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/74 text-[#3f302c] backdrop-blur"
              onClick={() => goToImage(activeImage - 1)}
              aria-label="上一张图片"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="absolute right-5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/74 text-[#3f302c] backdrop-blur"
              onClick={() => goToImage(activeImage + 1)}
              aria-label="下一张图片"
            >
              <ChevronRight size={22} />
            </button>
            <button
              className="absolute bottom-5 right-6 grid h-10 w-10 place-items-center rounded-full bg-white/78 text-[#3f302c] backdrop-blur"
              onClick={() => setViewerOpen(true)}
              aria-label="放大查看图片"
            >
              <Maximize2 size={17} />
            </button>
          </>
        ) : null}
      </section>

      <section className="px-4 pb-7 pt-5">
        <div className="pp-surface rounded-[22px] p-4">
          <div className="flex flex-wrap gap-2">
            {post.styleTags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>

          <h1 className="mt-4 flex items-center gap-2 text-2xl font-black leading-tight text-[#3f302c]">
            <MapPin size={22} className="shrink-0 text-[#e85d75]" />
            <span className="min-w-0 truncate">{post.location}</span>
          </h1>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#7a6b64]">
            <CalendarDays size={16} className="shrink-0 text-[#9fb89f]" />
            <span className="truncate">{post.timeLabel}</span>
          </p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#e85d75]">
              <Sparkles size={16} />
              <span>{post.activity}</span>
            </div>
            {post.companion.isVirtual ? (
              <p className="rounded-[14px] bg-[#fff7df] px-3 py-2 text-xs font-bold leading-5 text-[#8a5a12] ring-1 ring-[#f2dfaa]">
                虚拟陪拍者样例，仅用于页面填充、功能调试和运营流程演示，后续可在后台替换为真实资料。
              </p>
            ) : null}
            <p className="text-[15px] leading-7 text-[#5f514b]">{post.caption}</p>
          </div>
        </div>
      </section>

      <button className="fixed inset-x-0 bottom-16 z-30 mx-auto w-full max-w-md px-3 pb-3 text-left" onClick={() => setBookingOpen(true)} aria-label={`预约 ${post.companion.name}`}>
        <div className="flex items-center gap-3 rounded-[22px] border border-[#eadfd8] bg-white/95 p-3 text-[#27211f] shadow-2xl shadow-[#5b4031]/12 backdrop-blur">
          <img className="h-13 w-13 rounded-[18px] object-cover" src={post.companion.photo || post.companion.avatar} alt={`${post.companion.name} 真人照片`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-bold">{post.companion.name}</p>
              {post.companion.isVirtual ? (
                <span className="inline-flex shrink-0 rounded-full bg-[#fff7df] px-2 py-0.5 text-[11px] font-bold text-[#8a5a12] ring-1 ring-[#f2dfaa]">
                  虚拟
                </span>
              ) : null}
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full pp-safe px-2 py-0.5 text-[11px] font-bold">
                <ShieldCheck size={13} />
                已认证
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-[#8f8078]">{post.companion.tags.join(' · ')}</p>
          </div>
          <span className="shrink-0 rounded-full pp-primary px-4 py-2 text-sm font-bold">¥{Math.round(post.companion.activities[0].priceCents / 100)}起</span>
        </div>
      </button>

      <BookingSheet companion={post.companion} postId={post.id} open={bookingOpen} onClose={() => setBookingOpen(false)} />

      {viewerOpen ? (
        <div className="fixed inset-0 z-50 bg-black text-white" onClick={() => setViewerOpen(false)}>
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-black/55 px-4 py-3 backdrop-blur">
            <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10" onClick={() => setViewerOpen(false)} aria-label="关闭图片预览">
              <X size={20} />
            </button>
            <p className="text-sm font-bold">
              {activeImage + 1}/{post.images.length}
            </p>
            <span className="h-10 w-10" />
          </div>
          <button
            className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur"
            onClick={(event) => {
              event.stopPropagation();
              goToImage(activeImage - 1);
            }}
            aria-label="上一张预览图片"
          >
            <ChevronLeft size={24} />
          </button>
          <img className="h-full w-full object-contain px-3 py-16" src={post.images[activeImage]?.url} alt={`${post.location} 大图预览`} onClick={(event) => event.stopPropagation()} />
          <button
            className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur"
            onClick={(event) => {
              event.stopPropagation();
              goToImage(activeImage + 1);
            }}
            aria-label="下一张预览图片"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      ) : null}

      {toast ? <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-[#3f302c] px-4 py-2 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
    </div>
  );
}

function getInitialPost(postId: string | undefined, workDraft: PublishedWorkDraft): FeedPost {
  const localPost = buildApprovedWorkPost(workDraft);
  if (localPost && localPost.id === postId) return localPost;
  return getPostDetail(postId);
}
