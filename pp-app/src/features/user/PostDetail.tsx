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
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookingSheet } from '../../components/BookingSheet';
import { Chip } from '../../components/Chip';
import { fetchPostDetail, getPostDetail } from '../../services/feedService';

export function PostDetail() {
  const { postId } = useParams();
  return <PostDetailContent key={postId ?? 'default-post'} postId={postId} />;
}

function PostDetailContent({ postId }: { postId?: string }) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');
  const [post, setPost] = useState(() => getPostDetail(postId));

  const goToImage = useCallback((index: number) => {
    const nextIndex = (index + post.images.length) % post.images.length;
    setActiveImage(nextIndex);
    const gallery = galleryRef.current;
    const target = gallery?.children.item(nextIndex) as HTMLElement | null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [post.images.length]);

  useEffect(() => {
    let mounted = true;
    fetchPostDetail(postId).then((nextPost) => {
      if (mounted) setPost(nextPost);
    });

    return () => {
      mounted = false;
    };
  }, [postId]);

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
    <div className="min-h-dvh bg-[#111116] pb-24 text-white">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/8 bg-[#111116]/90 px-4 py-3 backdrop-blur-xl">
        <Link to="/consumer" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" aria-label="返回发现页">
          <ArrowLeft size={20} />
        </Link>
        <p className="text-sm font-semibold text-white/88">帖子详情</p>
        <div className="flex h-10 items-center gap-2">
          <button
            className={`grid h-10 w-10 place-items-center rounded-full ${saved ? 'bg-rose-500 text-white' : 'bg-white/10 text-white'}`}
            onClick={() => {
              setSaved((current) => !current);
              setToast(saved ? '已取消收藏' : '已收藏');
            }}
            aria-label={saved ? '取消收藏' : '收藏帖子'}
          >
            <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" onClick={handleShare} aria-label="分享帖子">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <section className="relative">
        <div ref={galleryRef} className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none" onScroll={syncActiveImage}>
          {post.images.map((image, index) => (
            <figure key={image.id} className="relative h-[72dvh] w-full shrink-0 snap-center overflow-hidden">
              <button className="h-full w-full" onClick={() => setViewerOpen(true)} aria-label={`放大查看第 ${index + 1} 张图片`}>
                <img
                  className="h-full w-full object-cover"
                  src={image.url}
                  alt={`${post.location} 第 ${index + 1} 张`}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/36 to-transparent px-4 pb-8 pt-28">
                <div className="mb-4 flex items-center gap-2">
                  {post.styleTags.map((tag) => (
                    <span key={tag} className="rounded-full bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                      {tag}
                    </span>
                  ))}
                </div>
                <h1 className="flex items-center gap-2 text-2xl font-black leading-tight">
                  <MapPin size={22} className="shrink-0 text-rose-300" />
                  <span className="min-w-0 truncate">{post.location}</span>
                </h1>
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-white/78">
                  <CalendarDays size={16} className="shrink-0" />
                  <span className="truncate">{post.timeLabel}</span>
                </p>
              </div>
            </figure>
          ))}
        </div>

        {post.images.length > 1 ? (
          <>
            <div className="absolute right-3 top-3 rounded-full bg-black/38 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              {activeImage + 1}/{post.images.length}
            </div>
            <button
              className="absolute left-1/2 top-3 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-black/34 text-white backdrop-blur"
              onClick={() => setViewerOpen(true)}
              aria-label="放大查看图片"
            >
              <Maximize2 size={17} />
            </button>
            <button
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/34 text-white backdrop-blur"
              onClick={() => goToImage(activeImage - 1)}
              aria-label="上一张图片"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/34 text-white backdrop-blur"
              onClick={() => goToImage(activeImage + 1)}
              aria-label="下一张图片"
            >
              <ChevronRight size={22} />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {post.images.map((image, index) => (
                <button
                  key={image.id}
                  className={`h-1.5 rounded-full transition-all ${index === activeImage ? 'w-5 bg-white' : 'w-1.5 bg-white/42'}`}
                  onClick={() => goToImage(index)}
                  aria-label={`查看第 ${index + 1} 张图片`}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      {post.images.length > 1 ? (
        <section className="flex gap-2 overflow-x-auto bg-[#111116] px-4 py-3 scrollbar-none" aria-label="图片缩略图">
          {post.images.map((image, index) => (
            <button
              key={image.id}
              className={`h-16 w-12 shrink-0 overflow-hidden rounded-[8px] border-2 ${
                index === activeImage ? 'border-rose-400' : 'border-white/10'
              }`}
              onClick={() => goToImage(index)}
              aria-label={`切换到第 ${index + 1} 张图片`}
            >
              <img className="h-full w-full object-cover" src={image.url} alt="" loading="lazy" />
            </button>
          ))}
        </section>
      ) : null}

      <section className="space-y-5 bg-white px-4 pb-7 pt-5 text-zinc-950">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-500">
            <Sparkles size={16} />
            <span>{post.activity}</span>
          </div>
          <p className="text-[15px] leading-7 text-zinc-700">{post.caption}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {post.styleTags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      </section>

      <button
        className="fixed inset-x-0 bottom-16 z-30 mx-auto w-full max-w-md px-3 pb-3 text-left"
        onClick={() => setBookingOpen(true)}
        aria-label={`预约 ${post.companion.name}`}
      >
        <div className="flex items-center gap-3 rounded-[8px] border border-zinc-200 bg-white p-3 text-zinc-950 shadow-2xl shadow-black/18">
          <img className="h-12 w-12 rounded-full object-cover" src={post.companion.avatar} alt={post.companion.name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate font-bold">{post.companion.name}</p>
              <ShieldCheck size={16} className="shrink-0 text-emerald-500" />
            </div>
            <p className="mt-1 truncate text-xs font-medium text-zinc-500">{post.companion.tags.join(' · ')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-rose-500 px-4 py-2 text-sm font-bold text-white">
            ¥{Math.round(post.companion.activities[0].priceCents / 100)}起
          </span>
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
          <img
            className="h-full w-full object-contain px-3 py-16"
            src={post.images[activeImage]?.url}
            alt={`${post.location} 大图预览`}
            onClick={(event) => event.stopPropagation()}
          />
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

      {toast ? (
        <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
