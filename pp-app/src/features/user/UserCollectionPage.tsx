import { ArrowLeft, Bookmark, Camera, Heart, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';
import {
  getFavoritePosts,
  getFollowingPeople,
  getLikedPosts,
} from '../../services/userCollectionService';
import type { FeedPost } from '../../types/api';
import { PhotoCard } from './PhotoCard';

export type UserCollectionMode = 'likes' | 'favorites' | 'following';

const collectionMeta: Record<UserCollectionMode, { title: string; subtitle: string }> = {
  likes: { title: '我的喜欢', subtitle: '你点过喜欢的作品' },
  favorites: { title: '我的收藏', subtitle: '想再看、想复拍的作品' },
  following: { title: '我的关注', subtitle: '你正在关注的创作者和摄影师' },
};

export function UserCollectionPage({ mode }: { mode: UserCollectionMode }) {
  const navigate = useNavigate();
  const posts = listFeedPosts();
  const meta = collectionMeta[mode];
  const works = mode === 'favorites' ? getFavoritePosts(posts) : getLikedPosts(posts);
  const following = getFollowingPeople(posts);

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

      {mode === 'following' ? (
        <section className="space-y-1 px-3 pt-3">
          {following.map((person) => (
            <Link key={person.id} to={person.to} className="flex items-center gap-3 rounded-[8px] bg-white/[0.06] p-3 ring-1 ring-white/8">
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
            <PhotoCard key={post.id} post={post} priority={index < 4} variant={index % 3 === 0 ? 'tall' : 'portrait'} />
          ))}
        </section>
      )}
    </div>
  );
}

export function getCollectionSummary(posts: FeedPost[]) {
  return [
    { icon: Heart, label: '我的喜欢', value: getLikedPosts(posts).length, to: '/consumer/likes' },
    { icon: Bookmark, label: '我的收藏', value: getFavoritePosts(posts).length, to: '/consumer/favorites' },
    { icon: UserRound, label: '我的关注', value: getFollowingPeople(posts).length, to: '/consumer/following' },
  ];
}
