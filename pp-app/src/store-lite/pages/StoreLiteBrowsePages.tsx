import { Aperture, ArrowLeft, Ban, CalendarPlus, ChevronRight, Flag, Heart, MapPin, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Companion, FeedPost } from '../../types/api';
import { useStoreLiteAuth } from '../StoreLiteAuth';
import { blockStoreLiteCompanion } from '../storeLiteComplianceService';
import {
  fetchStoreLiteFeed,
  fetchStoreLitePhotographer,
  fetchStoreLitePhotographerPosts,
  fetchStoreLitePost,
} from '../storeLiteService';
import { StoreLiteError, StoreLiteLoading } from '../StoreLiteUi';

export function StoreLiteDiscoverPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [city, setCity] = useState('全部');
  const [cityOpen, setCityOpen] = useState(false);
  const [topChromeHidden, setTopChromeHidden] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    let frame = 0;

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const nextScrollY = Math.max(window.scrollY, 0);
        const delta = nextScrollY - lastScrollYRef.current;

        if (nextScrollY < 24) {
          setTopChromeHidden(false);
        } else if (Math.abs(delta) > 8) {
          setTopChromeHidden(delta > 0);
        }

        lastScrollYRef.current = nextScrollY;
        frame = 0;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  async function load(reset = true) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await fetchStoreLiteFeed({ limit: 20, cursor: reset ? null : nextCursor });
      setPosts((current) => (reset ? page.items : mergePosts(current, page.items)));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '作品加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchStoreLiteFeed({ limit: 20 })
      .then((page) => {
        if (!active) return;
        setPosts(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '作品加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cityOptions = useMemo(
    () => ['全部', ...new Set(posts.map((post) => post.city || post.companion.baseCity).filter(Boolean))],
    [posts],
  );
  const visiblePosts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return posts.filter((post) => {
      const postCity = post.city || post.companion.baseCity;
      if (city !== '全部' && postCity !== city) return false;
      if (!normalized) return true;
      return [getPostTitle(post), post.locationName, post.location, post.caption, post.companion.name, ...post.styleTags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [city, posts, query]);
  const columns: [FeedPost[], FeedPost[]] = [
    visiblePosts.filter((_, index) => index % 2 === 0),
    visiblePosts.filter((_, index) => index % 2 === 1),
  ];
  const hideTopChrome = topChromeHidden && !searchOpen && !cityOpen;

  return (
    <div className="min-h-dvh bg-[#050505] pt-[calc(env(safe-area-inset-top)+3.75rem)] text-white">
      <header className={`pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto max-w-md border-b border-white/12 bg-[#050505]/94 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-all duration-300 ${hideTopChrome ? 'pointer-events-none -translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="flex h-10 items-center justify-between gap-2">
          <button type="button" onClick={() => setCityOpen(true)} className="pointer-events-auto flex h-9 max-w-[116px] items-center gap-1.5 rounded-full bg-black/30 px-2 text-sm font-black shadow-[0_10px_26px_rgba(0,0,0,0.32)] ring-1 ring-white/10 backdrop-blur-lg" aria-label={`筛选城市：${city}`}>
            <MapPin size={16} className="shrink-0" />
            <span className="truncate">{city === '全部' ? '城市精选' : city}</span>
          </button>
          <div className="pointer-events-auto relative flex h-9 items-center text-base font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            发现
            <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-white" />
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <button type="button" onClick={() => setSearchOpen((value) => !value)} className={`grid h-9 w-9 place-items-center rounded-full shadow-[0_10px_26px_rgba(0,0,0,0.32)] ring-1 ring-white/10 backdrop-blur-lg ${query ? 'bg-white text-black' : 'bg-black/30 text-white'}`} aria-label="搜索作品">
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </button>
            <button type="button" onClick={() => setCityOpen(true)} className={`grid h-9 w-9 place-items-center rounded-full shadow-[0_10px_26px_rgba(0,0,0,0.32)] ring-1 ring-white/10 backdrop-blur-lg ${city !== '全部' ? 'bg-white text-black' : 'bg-black/30 text-white'}`} aria-label="筛选作品">
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </div>
        {searchOpen ? (
          <label className="pointer-events-auto mt-3 flex h-11 items-center gap-2 rounded-full border border-white/12 bg-black/64 px-4 shadow-xl backdrop-blur-xl">
            <Search size={16} className="text-white/60" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/38" placeholder="搜索风格、场景或摄影师" />
            {query ? <button type="button" onClick={() => setQuery('')} className="grid h-7 w-7 place-items-center rounded-full bg-white/10" aria-label="清除搜索"><X size={14} /></button> : null}
          </label>
        ) : null}
      </header>

      {loading ? <StoreLiteLoading label="正在加载作品" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load(true)} /> : null}
      {!loading && !error && visiblePosts.length === 0 ? <EmptyBrowse title={posts.length ? '没有匹配的作品' : '暂无可展示作品'} dark /> : null}
      {!loading && !error && visiblePosts.length > 0 ? (
        <section className="grid grid-cols-2 items-start gap-2 bg-[#050505] px-2 pb-4 pt-2">
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex min-w-0 flex-col gap-2">
              {column.map((post, index) => (
                <StoreLiteFeedCard key={post.id} post={post} eager={index < 2} />
              ))}
            </div>
          ))}
        </section>
      ) : null}
      {hasMore ? (
        <div className="px-4 py-6 text-center">
          <button type="button" disabled={loadingMore} onClick={() => void load(false)} className="h-11 rounded-full bg-white/12 px-7 text-sm font-black text-white ring-1 ring-white/12 disabled:opacity-40">
            {loadingMore ? '加载中' : '加载更多'}
          </button>
        </div>
      ) : null}
      {cityOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-label="选择城市">
          <button type="button" className="absolute inset-0" onClick={() => setCityOpen(false)} aria-label="关闭城市筛选" />
          <section className="relative w-full max-w-md rounded-[18px] bg-[#f7f7f5] p-5 text-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">City edit</p><h2 className="mt-1 text-xl font-black">选择作品城市</h2></div><button type="button" onClick={() => setCityOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-zinc-200" aria-label="关闭"><X size={17} /></button></div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {cityOptions.map((option) => <button key={option} type="button" onClick={() => { setCity(option); setCityOpen(false); }} className={`h-11 rounded-full text-sm font-black ring-1 ${city === option ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-white text-zinc-700 ring-zinc-200'}`}>{option}</button>)}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function StoreLitePhotographersPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const page = await fetchStoreLiteFeed({ limit: 50 });
      setPosts(page.items);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '摄影师加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchStoreLiteFeed({ limit: 50 })
      .then((page) => {
        if (!active) return;
        setPosts(page.items);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '摄影师加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const photographers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const unique = new Map<string, { companion: Companion; posts: FeedPost[] }>();
    for (const post of posts) {
      const current = unique.get(post.companion.id);
      if (current) current.posts.push(post);
      else unique.set(post.companion.id, { companion: post.companion, posts: [post] });
    }
    return [...unique.values()].filter(({ companion }) => {
      if (!normalized) return true;
      return [companion.name, companion.bio, companion.baseCity, ...companion.tags, ...companion.areas].join(' ').toLowerCase().includes(normalized);
    });
  }, [posts, query]);

  return (
    <div className="min-h-dvh bg-[#050505] pb-4 text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#050505]/94 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur-xl">
        <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Still photographers</p><h1 className="mt-1 text-[1.8rem] font-black tracking-[-0.04em]">找摄影师</h1></div><span className="pb-1 text-xs font-bold text-white/38">{photographers.length} 位</span></div>
        <label className="mt-4 flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 ring-1 ring-white/10">
          <Search size={17} className="text-white/46" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/38" placeholder="搜索姓名、风格或城市" />
          {query ? <button type="button" onClick={() => setQuery('')} className="grid h-7 w-7 place-items-center rounded-full bg-white/10" aria-label="清除搜索"><X size={14} /></button> : null}
        </label>
      </header>
      {loading ? <StoreLiteLoading label="正在加载摄影师" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load()} /> : null}
      {!loading && !error ? (
        <section className="space-y-px bg-white/8">
          {photographers.map(({ companion, posts: works }) => (
            <Link key={companion.id} to={`/photographers/${encodeURIComponent(companion.id)}`} className="block bg-[#050505] px-4 py-4 active:bg-white/[0.04]">
              <div className="grid grid-cols-[6.75rem_1fr] gap-4">
                <StoreLiteImage post={works[0]} className="aspect-[0.78] rounded-[8px]" />
                <div className="min-w-0 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-lg font-black">{companion.name}</h2>
                    <ChevronRight size={18} className="mt-1 shrink-0 text-white/28" />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-white/52"><MapPin size={13} />{companion.baseCity || '服务城市待确认'}</p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-white/48">{companion.bio || '在作品中了解摄影师的风格。'}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {companion.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white/62">{tag}</span>)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {photographers.length === 0 ? <EmptyBrowse title="没有找到匹配的摄影师" dark /> : null}
        </section>
      ) : null}
    </div>
  );
}

export function StoreLiteWorkPage() {
  const { postId = '' } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setPost(await fetchStoreLitePost(postId));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '作品加载失败');
    }
  }

  useEffect(() => {
    let active = true;
    void fetchStoreLitePost(postId)
      .then((nextPost) => {
        if (!active) return;
        setPost(nextPost);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '作品加载失败');
      });
    return () => {
      active = false;
    };
  }, [postId]);

  if (error) return <StoreLiteError message={error} onRetry={() => void load()} />;
  if (!post) return <StoreLiteLoading label="正在加载作品" />;

  return (
    <div className="min-h-dvh bg-zinc-950 pb-28 text-white">
      <header className="sticky top-0 z-20 flex min-h-16 items-center gap-2 bg-zinc-950/94 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 shrink-0 place-items-center" aria-label="返回"><ArrowLeft size={22} /></button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {post.creator?.avatar ? <img src={post.creator.avatar} alt={post.creator.name} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10"><Aperture size={15} /></span>}
          <span className="min-w-0"><span className="block text-[10px] font-bold text-white/42">创作者</span><span className="block truncate text-sm font-black">{post.creator?.name || 'Still Creator'}</span></span>
        </div>
        <Link to={`/photographers/${encodeURIComponent(post.companion.id)}`} className="flex shrink-0 items-center gap-2 text-right">
          <span><span className="block text-[10px] font-bold text-white/42">摄影师</span><span className="block max-w-20 truncate text-sm font-black">{post.companion.name}</span></span>
          {post.companion.avatar ? <img src={post.companion.avatar} alt={post.companion.name} className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><Aperture size={15} /></span>}
        </Link>
      </header>
      <div className="space-y-1">
        {post.images.map((image, index) => (
          <img key={image.id || `${post.id}-${index}`} src={image.posterUrl || image.url} alt={`${getPostTitle(post)} ${index + 1}`} className="max-h-[78dvh] w-full bg-black object-contain" />
        ))}
      </div>
      <section className="px-4 py-5">
        <p className="text-xl font-black">{getPostTitle(post)}</p>
        <p className="mt-2 flex items-center gap-1 text-sm font-bold text-white/60"><MapPin size={14} />{post.locationName || post.location}</p>
        <p className="mt-4 text-sm font-semibold leading-6 text-white/70">{post.caption}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {post.styleTags.map((tag) => <span key={tag} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70">{tag}</span>)}
        </div>
        <Link to={`/photographers/${encodeURIComponent(post.companion.id)}`} className="mt-6 flex items-center gap-3 rounded-2xl bg-white/10 p-4">
          <Avatar companion={post.companion} />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{post.companion.name}</span><span className="mt-1 block text-xs font-semibold text-white/50">查看摄影师与更多作品</span></span>
          <ChevronRight size={19} className="text-white/40" />
        </Link>
        <SafetyActions
          companionId={post.companion.id}
          reportTargetType="post"
          reportTargetId={post.id}
          dark
        />
      </section>
    </div>
  );
}

export function StoreLitePhotographerPage() {
  const { photographerId = '' } = useParams();
  const [photographer, setPhotographer] = useState<Companion | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [profile, page] = await Promise.all([
        fetchStoreLitePhotographer(photographerId),
        fetchStoreLitePhotographerPosts(photographerId),
      ]);
      setPhotographer(profile);
      setPosts(page.items);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '摄影师资料加载失败');
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchStoreLitePhotographer(photographerId),
      fetchStoreLitePhotographerPosts(photographerId),
    ])
      .then(([profile, page]) => {
        if (!active) return;
        setPhotographer(profile);
        setPosts(page.items);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '摄影师资料加载失败');
      });
    return () => {
      active = false;
    };
  }, [photographerId]);

  if (error) return <StoreLiteError message={error} onRetry={() => void load()} />;
  if (!photographer) return <StoreLiteLoading label="正在加载摄影师" />;

  return (
    <div className="min-h-dvh bg-[#050505] pb-10 text-white">
      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between bg-[#050505]/94 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <button type="button" onClick={() => window.history.back()} className="grid h-10 w-10 place-items-center" aria-label="返回"><ArrowLeft size={23} /></button>
        <p className="max-w-[17rem] truncate text-sm font-black tracking-tight">@{photographer.id.replace(/[^a-zA-Z0-9]/g, '').slice(-18)}</p>
        <span className="h-10 w-10" aria-hidden />
      </header>

      <section className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-5">
          <Avatar companion={photographer} large />
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
            <ProfileStat value={posts.length} label="作品" />
            <ProfileStat value={photographer.ratingCount} label="评价" />
            <ProfileStat value={photographer.areas.length || 1} label="区域" />
          </div>
        </div>
        <h1 className="mt-4 text-base font-black">{photographer.name}</h1>
        <p className="mt-1 text-sm font-semibold leading-5 text-white/68">{photographer.bio || '用作品了解这位摄影师的风格。'}</p>
        <p className="mt-2 flex items-center gap-1 text-sm font-black text-white/84"><MapPin size={15} />{photographer.areas.slice(0, 3).join(' / ') || photographer.baseCity}</p>
        {photographer.ratingCount > 0 ? <p className="mt-2 flex items-center gap-1 text-xs font-bold text-white/50"><Star size={12} className="fill-white/45 text-white/45" />{photographer.ratingAvg.toFixed(1)} · {photographer.ratingCount} 条评价</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">{photographer.tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-black text-white/62">{tag}</span>)}</div>

        <Link to={`/photographers/${encodeURIComponent(photographer.id)}/request`} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-white text-sm font-black text-zinc-950">
          <CalendarPlus size={17} />
          提交预约申请
        </Link>
        <div className="mt-2 rounded-[8px] bg-white/[0.07] px-3 py-3 text-xs font-semibold leading-5 text-white/58 ring-1 ring-white/8">
          平台会根据你填写的时间、地点和需求核对档期；请以“已确认”状态为准。
        </div>
      </section>

      <div className="px-4">
        <SafetyActions companionId={photographer.id} reportTargetType="companion" reportTargetId={photographer.id} dark />
      </div>

      <section className="pt-6">
        <div className="flex items-center justify-between px-4"><h2 className="text-sm font-black">作品</h2><span className="text-xs font-bold text-white/36">{posts.length} 组</span></div>
        <div className="mt-3 grid grid-cols-3 gap-px bg-[#050505]">
          {posts.map((post) => <Link key={post.id} to={`/works/${encodeURIComponent(post.id)}`}><StoreLiteImage post={post} className="aspect-[0.76]" /></Link>)}
        </div>
        {posts.length === 0 ? <EmptyBrowse title="暂无可展示作品" dark /> : null}
      </section>
    </div>
  );
}

function ProfileStat({ value, label }: { value: number | string; label: string }) {
  return <div><p className="text-base font-black tabular-nums">{value}</p><p className="mt-1 text-[11px] font-semibold text-white/42">{label}</p></div>;
}

function StoreLiteImage({ post, className = '', eager = false }: { post: FeedPost; className?: string; eager?: boolean }) {
  const image = post.images[0];
  return image?.url ? (
    <img src={image.posterUrl || image.url} alt={getPostTitle(post)} loading={eager ? 'eager' : 'lazy'} className={`h-full w-full bg-zinc-200 object-cover ${className}`} />
  ) : (
    <div className={`grid h-full w-full place-items-center bg-zinc-200 text-zinc-400 ${className}`}><Aperture size={24} /></div>
  );
}

function StoreLiteFeedCard({ post, eager }: { post: FeedPost; eager: boolean }) {
  const image = post.images[0];
  const aspectRatio = image?.width && image.height && image.width > 0 && image.height > 0
    ? `${image.width} / ${image.height}`
    : '3 / 4';

  return (
    <article className="overflow-hidden bg-[#050505]">
      <Link to={`/works/${encodeURIComponent(post.id)}`} className="group block" aria-label={`查看作品 ${getPostTitle(post)}`}>
        <div className="relative overflow-hidden rounded-[16px] bg-zinc-950" style={{ aspectRatio }}>
          {image?.url ? (
            <img
              src={image.posterUrl || image.url}
              alt={getPostTitle(post)}
              loading={eager ? 'eager' : 'lazy'}
              className="h-full w-full object-cover brightness-[0.94] contrast-[1.14] saturate-[0.98] transition duration-500 group-active:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-zinc-900 text-white/30"><Aperture size={24} /></div>
          )}
        </div>
        <div className="flex h-7 items-center justify-between gap-2 px-1 text-[10px] font-semibold text-white/68">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin size={10} className="shrink-0 text-white/52" />
            <span className="truncate">{post.locationName || post.location || post.companion.baseCity}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-white/62">
            <Heart size={10} fill="currentColor" />
            {post.likeCount ?? 0}
          </span>
        </div>
      </Link>
    </article>
  );
}

function Avatar({ companion, large = false }: { companion: Companion; large?: boolean }) {
  const size = large ? 'h-24 w-24' : 'h-12 w-12';
  return companion.avatar ? <img src={companion.avatar} alt={companion.name} className={`${size} shrink-0 rounded-full bg-zinc-200 object-cover ring-1 ring-zinc-200`} /> : <div className={`${size} grid shrink-0 place-items-center rounded-full bg-zinc-200 text-zinc-500`}><Aperture size={large ? 28 : 18} /></div>;
}

function SafetyActions({
  companionId,
  reportTargetType,
  reportTargetId,
  dark = false,
}: {
  companionId: string;
  reportTargetType: 'post' | 'companion';
  reportTargetId: string;
  dark?: boolean;
}) {
  const { session } = useStoreLiteAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState('');

  async function block() {
    if (!session) {
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    if (blocking || !window.confirm('屏蔽后，这位摄影师及其作品将不再出现在你的浏览结果中。确认屏蔽吗？')) return;
    setBlocking(true);
    try {
      await blockStoreLiteCompanion(companionId);
      navigate('/photographers', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '屏蔽失败，请稍后重试');
      setBlocking(false);
    }
  }

  const actionClass = dark
    ? 'bg-white/10 text-white ring-white/15'
    : 'bg-white text-zinc-700 ring-zinc-200';
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2">
        <Link
          to={`/safety/report/${reportTargetType}/${encodeURIComponent(reportTargetId)}`}
          className={`flex h-11 items-center justify-center gap-2 rounded-full text-xs font-black ring-1 ${actionClass}`}
        >
          <Flag size={15} />
          举报
        </Link>
        <button
          type="button"
          onClick={() => void block()}
          disabled={blocking}
          className={`flex h-11 items-center justify-center gap-2 rounded-full text-xs font-black ring-1 disabled:opacity-50 ${actionClass}`}
        >
          <Ban size={15} />
          {blocking ? '处理中' : '屏蔽摄影师'}
        </button>
      </div>
      {error ? <div className="mt-3"><StoreLiteError message={error} /></div> : null}
    </div>
  );
}

function EmptyBrowse({ title, dark = false }: { title: string; dark?: boolean }) {
  return <div className={`px-4 py-16 text-center text-sm font-bold ${dark ? 'text-white/46' : 'text-zinc-400'}`}>{title}</div>;
}

function mergePosts(current: FeedPost[], incoming: FeedPost[]) {
  const byId = new Map(current.map((post) => [post.id, post]));
  for (const post of incoming) byId.set(post.id, post);
  return [...byId.values()];
}

function getPostTitle(post: FeedPost) {
  return post.title?.trim() || [post.locationName || post.location, post.activity].filter(Boolean).join(' · ') || '摄影作品';
}
