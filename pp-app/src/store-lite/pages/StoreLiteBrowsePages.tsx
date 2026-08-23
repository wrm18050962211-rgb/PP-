import { Aperture, ArrowLeft, Ban, CalendarPlus, ChevronRight, Flag, MapPin, Search, ShieldCheck, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { StoreLiteError, StoreLiteLoading, StoreLiteNotice, StoreLitePageHeader } from '../StoreLiteUi';

export function StoreLiteDiscoverPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <>
      <StoreLiteHero title="先看作品，再选摄影师" subtitle="从真实风格和拍摄场景出发" />
      <div className="px-4 pb-4">
        <StoreLiteNotice>提交预约申请不涉及付款、定金或扣款。时间以平台确认后的预约状态为准。</StoreLiteNotice>
      </div>
      {loading ? <StoreLiteLoading label="正在加载作品" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load(true)} /> : null}
      {!loading && !error && posts.length === 0 ? <EmptyBrowse title="暂无可展示作品" /> : null}
      <section className="grid grid-cols-2 gap-1 px-1">
        {posts.map((post, index) => (
          <Link key={post.id} to={`/works/${encodeURIComponent(post.id)}`} className="group relative overflow-hidden rounded-xl bg-zinc-200" aria-label={`查看作品 ${getPostTitle(post)}`}>
            <StoreLiteImage post={post} eager={index < 4} className="aspect-[0.78] transition duration-500 group-active:scale-[0.98]" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-3 pt-10 text-white">
              <p className="line-clamp-1 text-sm font-black">{getPostTitle(post)}</p>
              <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-bold text-white/72">
                <MapPin size={11} />
                {post.locationName || post.location || post.companion.baseCity}
              </p>
            </div>
          </Link>
        ))}
      </section>
      {hasMore ? (
        <div className="px-4 py-6 text-center">
          <button type="button" disabled={loadingMore} onClick={() => void load(false)} className="h-11 rounded-full bg-zinc-950 px-7 text-sm font-black text-white disabled:bg-zinc-300">
            {loadingMore ? '加载中' : '加载更多'}
          </button>
        </div>
      ) : null}
    </>
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
    <>
      <StoreLiteHero title="找摄影师" subtitle="比较作品风格、擅长场景与可服务城市" />
      <div className="px-4 pb-4">
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 ring-1 ring-zinc-200">
          <Search size={18} className="text-zinc-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" placeholder="搜索摄影师、风格或城市" />
        </label>
      </div>
      {loading ? <StoreLiteLoading label="正在加载摄影师" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load()} /> : null}
      {!loading && !error ? (
        <section className="space-y-3 px-4">
          {photographers.map(({ companion, posts: works }) => (
            <Link key={companion.id} to={`/photographers/${encodeURIComponent(companion.id)}`} className="block overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
              <div className="grid grid-cols-[6.5rem_1fr] gap-4 p-3">
                <StoreLiteImage post={works[0]} className="aspect-[0.82] rounded-xl" />
                <div className="min-w-0 py-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-lg font-black">{companion.name}</h2>
                    <ChevronRight size={18} className="mt-1 shrink-0 text-zinc-300" />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-zinc-500"><MapPin size={13} />{companion.baseCity || '服务城市待确认'}</p>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-zinc-500">{companion.bio || '在作品中了解摄影师的风格。'}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {companion.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{tag}</span>)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {photographers.length === 0 ? <EmptyBrowse title="没有找到匹配的摄影师" /> : null}
        </section>
      ) : null}
    </>
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
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-zinc-950/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <button type="button" onClick={() => navigate(-1)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10" aria-label="返回"><ArrowLeft size={21} /></button>
        <span className="text-sm font-black">Still 作品</span>
        <span className="h-10 w-10" />
      </header>
      <div className="space-y-1">
        {post.images.map((image, index) => (
          <img key={image.id || `${post.id}-${index}`} src={image.posterUrl || image.url} alt={`${getPostTitle(post)} ${index + 1}`} className="max-h-[78dvh] w-full bg-black object-contain" />
        ))}
      </div>
      <section className="p-5">
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
    <>
      <StoreLitePageHeader title={photographer.name} eyebrow="Photographer" />
      <section className="px-4 py-5">
        <div className="flex items-center gap-4">
          <Avatar companion={photographer} large />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-black">{photographer.name}</h2>
            <p className="mt-1 flex items-center gap-1 text-sm font-bold text-zinc-500"><MapPin size={14} />{photographer.baseCity}</p>
            {photographer.ratingCount > 0 ? (
              <p className="mt-2 flex items-center gap-1 text-xs font-black text-zinc-600"><Star size={13} className="fill-amber-400 text-amber-400" />{photographer.ratingAvg.toFixed(1)} · {photographer.ratingCount} 条评价</p>
            ) : (
              <p className="mt-2 text-xs font-black text-zinc-400">暂无评价</p>
            )}
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold leading-6 text-zinc-600">{photographer.bio}</p>
        <div className="mt-4 flex flex-wrap gap-2">{photographer.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-zinc-600 ring-1 ring-zinc-200">{tag}</span>)}</div>
      </section>

      <section className="mx-4 rounded-2xl bg-zinc-950 p-4 text-white">
        <div className="flex items-center gap-2"><ShieldCheck size={18} /><h3 className="text-sm font-black">预约申请说明</h3></div>
        <p className="mt-2 text-xs font-semibold leading-5 text-white/62">提交时间、地点和需求后，平台运营会核对摄影师是否可承接。收到“已确认”状态才代表预约成立；提交申请不涉及付款、定金或扣款。</p>
        <Link to={`/photographers/${encodeURIComponent(photographer.id)}/request`} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-zinc-950">
          <CalendarPlus size={18} />
          提交预约申请
        </Link>
      </section>

      <div className="px-4 pt-4">
        <SafetyActions
          companionId={photographer.id}
          reportTargetType="companion"
          reportTargetId={photographer.id}
        />
      </div>

      <section className="px-4 py-6">
        <div className="flex items-center justify-between"><h3 className="text-base font-black">作品</h3><span className="text-xs font-bold text-zinc-400">{posts.length} 组</span></div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {posts.map((post) => <Link key={post.id} to={`/works/${encodeURIComponent(post.id)}`}><StoreLiteImage post={post} className="aspect-[0.76] rounded-lg" /></Link>)}
        </div>
        {posts.length === 0 ? <EmptyBrowse title="暂无可展示作品" /> : null}
      </section>
    </>
  );
}

function StoreLiteHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-400"><Aperture size={15} />Still</div>
      <h1 className="mt-3 text-[2rem] font-black leading-tight tracking-[-0.04em]">{title}</h1>
      <p className="mt-2 text-sm font-semibold text-zinc-500">{subtitle}</p>
    </header>
  );
}

function StoreLiteImage({ post, className = '', eager = false }: { post: FeedPost; className?: string; eager?: boolean }) {
  const image = post.images[0];
  return image?.url ? (
    <img src={image.posterUrl || image.url} alt={getPostTitle(post)} loading={eager ? 'eager' : 'lazy'} className={`h-full w-full bg-zinc-200 object-cover ${className}`} />
  ) : (
    <div className={`grid h-full w-full place-items-center bg-zinc-200 text-zinc-400 ${className}`}><Aperture size={24} /></div>
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

function EmptyBrowse({ title }: { title: string }) {
  return <div className="px-4 py-12 text-center text-sm font-bold text-zinc-400">{title}</div>;
}

function mergePosts(current: FeedPost[], incoming: FeedPost[]) {
  const byId = new Map(current.map((post) => [post.id, post]));
  for (const post of incoming) byId.set(post.id, post);
  return [...byId.values()];
}

function getPostTitle(post: FeedPost) {
  return post.title?.trim() || [post.locationName || post.location, post.activity].filter(Boolean).join(' · ') || '摄影作品';
}
