import { ArrowLeft, Camera, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';
import {
  fetchUserCollectionPage,
  getFavoritePosts,
  getFollowingPeople,
  getLikedPosts,
  type FollowingPerson,
  type UserCollectionKind,
} from '../../services/userCollectionService';
import { isMockFallbackAllowed } from '../../services/apiClient';
import type { FeedPost } from '../../types/api';
import { PhotoCard } from './PhotoCard';

export type UserCollectionMode = 'likes' | 'favorites' | 'following';
export type UserCollectionBasePath = '/consumer' | '/companion';

const collectionMeta: Record<UserCollectionMode, { title: string; subtitle: string }> = {
  likes: { title: '我的喜欢', subtitle: '你点过喜欢的作品' },
  favorites: { title: '我的收藏', subtitle: '想再看、想复拍的作品' },
  following: { title: '我的关注', subtitle: '你正在关注的创作者和摄影师' },
};

export function UserCollectionPage({ mode, basePath = '/consumer' }: { mode: UserCollectionMode; basePath?: UserCollectionBasePath }) {
  const navigate = useNavigate();
  const posts = useMemo(() => (isMockFallbackAllowed() ? listFeedPosts() : []), []);
  const meta = collectionMeta[mode];
  const kind: UserCollectionKind = mode === 'likes' ? 'like' : mode === 'favorites' ? 'favorite' : 'follow';
  const [works, setWorks] = useState<FeedPost[]>(() =>
    mode === 'favorites' ? getFavoritePosts(posts) : mode === 'likes' ? getLikedPosts(posts) : [],
  );
  const [following, setFollowing] = useState<FollowingPerson[]>(() =>
    mode === 'following' ? getFollowingPeople(posts) : [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorMessage('');
    fetchUserCollectionPage(kind, { limit: 20, posts })
      .then((page) => {
        if (!mounted) return;
        if (kind === 'follow') setFollowing(page.items as FollowingPerson[]);
        else setWorks(page.items as FeedPost[]);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (mounted) setErrorMessage('同步失败，请检查网络后重试');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [kind, posts, reloadKey]);

  const loadMore = async () => {
    if (loading || !hasMore || !nextCursor) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const page = await fetchUserCollectionPage(kind, { limit: 20, cursor: nextCursor, posts });
      if (kind === 'follow') {
        setFollowing((current) => mergeById(current, page.items as FollowingPerson[]));
      } else {
        setWorks((current) => mergeById(current, page.items as FeedPost[]));
      }
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      setErrorMessage('加载更多失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-[#050505]/94 px-4 backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center text-white/88" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={24} />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-lg font-black tracking-tight">{meta.title}</h1>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-white/42">{meta.subtitle}</p>
        </div>
        <div className="h-10 w-10" />
      </header>

      {errorMessage ? (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 bg-rose-950/50 px-3 py-2 text-xs font-bold text-rose-100">
          <span>{errorMessage}</span>
          <button className="shrink-0 text-white underline" onClick={() => setReloadKey((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : null}

      {mode === 'following' ? (
        <section className="space-y-1 px-3 pt-3">
          {following.map((person) => (
            <Link key={person.id} to={withCollectionBasePath(person.to, basePath)} className="flex items-center gap-3 rounded-[8px] bg-white/[0.06] p-3 ring-1 ring-white/8">
              <img className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/12" src={person.avatar} alt={person.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {person.kind === '摄影师' ? <Camera size={13} className="text-white/48" /> : <UserRound size={13} className="text-white/48" />}
                  <span className="text-[11px] font-black text-white/42">{person.kind}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-black text-white">{person.name}</p>
                <p className="mt-1 truncate text-xs font-semibold text-white/46">{person.meta}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <section className="grid grid-cols-2 gap-[1px] bg-black px-[1px] pt-[1px]">
          {works.map((post, index) => (
            <PhotoCard key={post.id} post={post} priority={index < 4} variant={index % 3 === 0 ? 'tall' : 'portrait'} postHref={`${basePath}/post/${post.id}`} />
          ))}
        </section>
      )}
      {hasMore ? (
        <div className="px-4 py-5">
          <button className="h-11 w-full bg-white/8 text-sm font-black text-white disabled:opacity-50" disabled={loading} onClick={() => void loadMore()}>
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function withCollectionBasePath(to: string, basePath: UserCollectionBasePath) {
  return basePath === '/consumer' ? to : to.replace(/^\/consumer/, basePath);
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}
