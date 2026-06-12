import { BadgeCheck, Banknote, MapPin, Search, SlidersHorizontal, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';

type ApprovedCreator = {
  id: string;
  name: string;
  avatar: string;
  priceCents: number;
  score: number;
  followers: number;
  post: FeedPost;
  posts: FeedPost[];
};

export function CreatorFinderPage() {
  const [query, setQuery] = useState('');
  const posts = listFeedPosts();

  const creators = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const items = posts.map((post, index) => buildApprovedCreator(post, index));

    if (!keyword) return items;
    return items.filter((item) => {
      const searchable = [
        item.name,
        getPostTitle(item.post),
        item.post.location,
        item.post.locationName,
        item.post.activity,
        item.post.caption,
        ...item.post.styleTags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(keyword);
    });
  }, [posts, query]);

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/92 px-3 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 text-sm font-semibold text-black ring-1 ring-white/20">
            <Search size={16} className="shrink-0 text-zinc-500" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索创作者、作品或地点"
              aria-label="搜索创作者、作品或地点"
            />
          </label>
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/16"
            aria-label="筛选审核创作者"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-1.5 px-1.5 pt-1.5">
        {creators.map((creator, index) => (
          <CreatorCard key={creator.id} creator={creator} index={index} />
        ))}
      </section>
    </div>
  );
}

function CreatorCard({ creator, index }: { creator: ApprovedCreator; index: number }) {
  const cover = creator.post.images[0]?.url || creator.avatar;
  const aspectClass = getCreatorAspect(index, creator.post);

  return (
    <article className="overflow-hidden rounded-[2px] bg-[#131313] ring-1 ring-white/8">
      <Link to={`/consumer/creator/${creator.id}`} className="block" aria-label={`查看${creator.name}主页`}>
        <div className={`relative ${aspectClass} bg-zinc-950`}>
          <img className="h-full w-full object-cover saturate-[0.92] contrast-[1.05]" src={cover} alt={getPostTitle(creator.post)} loading={index < 4 ? 'eager' : 'lazy'} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/86 via-black/30 to-transparent px-2 pb-2 pt-12">
            <div className="flex items-center gap-1 text-[10px] font-black text-emerald-200">
              <BadgeCheck size={12} />
              已审核创作者
            </div>
            <p className="mt-1 line-clamp-1 text-sm font-black text-white">{getPostTitle(creator.post)}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-white/58">
              <MapPin size={10} />
              {creator.post.locationName || creator.post.location}
            </p>
          </div>
        </div>

        <div className="space-y-2 p-2">
          <div className="flex items-center gap-2">
            <img className="h-8 w-8 rounded-full object-cover ring-1 ring-white/18" src={creator.avatar} alt={creator.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-white">{creator.name}</p>
              <p className="flex items-center gap-1 text-[10px] font-bold text-white/50">
                <Star size={10} className="fill-white/45 text-white/45" />
                {creator.score} · {creator.followers}关注
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/8 pt-2 text-xs font-black">
            <span className="flex items-center gap-1 text-white/62">
              <Banknote size={13} />
              创作者报价
            </span>
            <span className="text-white">¥{Math.round(creator.priceCents / 100)}起</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function buildApprovedCreator(post: FeedPost, index: number): ApprovedCreator {
  return {
    id: `creator-${post.id}`,
    name: post.companion.isVirtual ? `${post.companion.name} Creator` : '作品创作者',
    avatar: post.images[1]?.url || post.companion.photo || post.companion.avatar,
    priceCents: 26000 + (index % 6) * 7000,
    score: 91 + (index % 8),
    followers: 128 + index * 17,
    post,
    posts: [post],
  };
}

function getCreatorAspect(index: number, post: FeedPost) {
  const cover = post.images[0];
  const ratio = cover?.width && cover.height ? cover.width / cover.height : 0;
  if (ratio > 1.1) return 'aspect-[1.05]';
  return ['aspect-[0.72]', 'aspect-[0.88]', 'aspect-[0.78]', 'aspect-[0.96]'][index % 4];
}
