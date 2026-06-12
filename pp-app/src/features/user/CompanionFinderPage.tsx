import { CalendarDays, MapPin, MessageCircle, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';

type FilterKey = 'area' | 'time' | 'style' | 'budget';
type FinderFilters = Record<FilterKey, string>;
type PhotographerResult = {
  companion: FeedPost['companion'];
  posts: FeedPost[];
  post: FeedPost;
};

const filterOptions: Record<FilterKey, string[]> = {
  area: ['地点不限', '武康路', '安福路', '外滩', '静安寺', '徐家汇', '新天地'],
  time: ['时间不限', '现在可拍', '1小时内', '今天', '周末', '晚上'],
  style: ['风格不限', 'Citywalk', '探店', '街拍', '夜景', '会指导动作'],
  budget: ['预算不限', '预算300内', '预算400内', '预算700内'],
};

const filterLabels: Record<FilterKey, string> = {
  area: '地点',
  time: '时间',
  style: '风格',
  budget: '预算',
};

const initialFinderFilters: FinderFilters = {
  area: filterOptions.area[0],
  time: filterOptions.time[0],
  style: filterOptions.style[0],
  budget: filterOptions.budget[0],
};

export function CompanionFinderPage() {
  const [params] = useSearchParams();
  const sameStylePostId = params.get('sameStyle');
  const posts = listFeedPosts();
  const sameStylePost = posts.find((post) => post.id === sameStylePostId);
  const [query, setQuery] = useState(() => params.get('query') ?? '');
  const [filterOpen, setFilterOpen] = useState<FilterKey | 'all' | null>(null);
  const [filters, setFilters] = useState<FinderFilters>(() => createInitialFinderFilters(params, sameStylePost));
  const activeFilterCount = getActiveFilterCount(filters);

  const companions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const grouped = new Map<string, PhotographerResult>();
    posts.forEach((post) => {
      const current = grouped.get(post.companion.id);
      if (current) {
        current.posts.push(post);
        return;
      }
      grouped.set(post.companion.id, { companion: post.companion, posts: [post], post });
    });

    return Array.from(grouped.values()).filter(({ companion, posts: portfolioPosts }) => {
      const searchable = [
        ...portfolioPosts.flatMap((post) => [post.title, getPostTitle(post), post.location, post.locationName, post.activity, post.caption, ...post.styleTags]),
        companion.name,
        companion.gender,
        ...companion.tags,
        ...companion.areas,
        ...companion.slots.map((slot) => slot.label),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesKeyword = !keyword || searchable.includes(keyword);
      return matchesKeyword && matchesFinderFilters(filters, searchable, companion.activities[0]?.priceCents || 0);
    });
  }, [filters, posts, query]);

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/92 px-3 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 text-sm font-semibold text-black ring-1 ring-white/20">
            <Search size={16} className="shrink-0 text-zinc-500" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索地点、风格或特殊要求"
            />
          </label>
          <button
            className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              activeFilterCount ? 'bg-white text-black' : 'bg-white/10 text-white ring-1 ring-white/16'
            }`}
            aria-label="筛选"
            onClick={() => setFilterOpen('all')}
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] font-black text-white ring-1 ring-white/50">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {sameStylePost ? (
        <section className="px-2 pt-2">
          <div className="flex items-center gap-3 rounded-[2px] bg-white p-3 text-black">
            <img className="h-16 w-12 rounded-[2px] object-cover" src={sameStylePost.images[0]?.url} alt={sameStylePost.location} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-zinc-500">按这组作品找同款摄影师</p>
              <p className="mt-1 line-clamp-2 text-sm font-bold leading-5">{sameStylePost.locationName || sameStylePost.location}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-2 px-2 pt-2">
        {companions.map(({ companion, posts: portfolioPosts, post }, index) => {
          const activity = companion.activities[0];
          const slot = companion.slots.find((item) => item.status === 'available') || companion.slots[0];
          return (
            <article key={companion.id} className="overflow-hidden rounded-[2px] bg-[#151515] ring-1 ring-white/10">
              <div className="flex aspect-[0.78] snap-x snap-mandatory overflow-x-auto scroll-smooth bg-zinc-950 scrollbar-none">
                {portfolioPosts.map((work, workIndex) => (
                  <Link
                    key={work.id}
                    to={`/consumer/post/${work.id}`}
                    className="relative h-full w-full shrink-0 snap-center"
                    aria-label={`查看${companion.name}作品 ${getPostTitle(work)}`}
                  >
                    <img
                      className="h-full w-full object-cover saturate-[0.9] contrast-[1.05]"
                      src={work.images[0]?.url || companion.photo || companion.avatar}
                      alt={getPostTitle(work)}
                      loading={index < 2 && workIndex === 0 ? 'eager' : 'lazy'}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/24 to-transparent px-2 pb-2 pt-12">
                      <p className="line-clamp-1 text-xs font-black text-white/86">{getPostTitle(work)}</p>
                      <p className="mt-0.5 truncate text-[10px] font-semibold text-white/54">{work.locationName || work.location}</p>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="space-y-2 p-2.5">
                <Link to={`/consumer/photographer/${companion.id}`} className="flex min-w-0 items-center gap-2" aria-label={`查看${companion.name}主页`}>
                  <img className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/18" src={companion.avatar || companion.photo || post.images[0]?.url} alt={companion.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{companion.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-white/50">
                      <Star size={10} className="fill-white/46 text-white/46" />
                      推荐 {96 - index * 3} · {companion.ratingAvg.toFixed(1)}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-black text-white">{activity?.name || post.activity}</span>
                  <span className="shrink-0 text-xs font-black text-white/72">¥{Math.round((activity?.priceCents || 0) / 100)}起</span>
                </div>
                <p className="flex min-w-0 items-center gap-1 text-[11px] font-semibold text-white/58">
                  <MapPin size={12} className="shrink-0" />
                  <span className="truncate">{companion.areas.slice(0, 2).join(' / ')}</span>
                </p>
                <p className="flex items-center gap-1 text-[11px] font-semibold text-white/58">
                  <CalendarDays size={12} />
                  <span className="truncate">{slot?.label || '待开放'}</span>
                </p>

                <div className="flex flex-wrap gap-1">
                  {companion.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="max-w-full truncate rounded-[2px] bg-white/8 px-1.5 py-1 text-[10px] font-bold text-white/58">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-[1fr_34px] gap-1.5">
                  <Link className="flex h-9 items-center justify-center rounded-[2px] bg-white text-xs font-black text-black" to={`/consumer/photographer/${companion.id}`}>
                    查看作品并预约
                  </Link>
                  <Link className="grid h-9 place-items-center rounded-[2px] bg-white/10 text-white" to="/consumer/messages" aria-label="咨询摄影师">
                    <MessageCircle size={16} />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {filterOpen ? (
        <CompanionFilterSheet
          filters={filters}
          mode={filterOpen}
          onSelect={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onReset={() => setFilters(initialFinderFilters)}
          onClose={() => setFilterOpen(null)}
        />
      ) : null}
    </div>
  );
}

function CompanionFilterSheet({
  filters,
  mode,
  onSelect,
  onReset,
  onClose,
}: {
  filters: FinderFilters;
  mode: FilterKey | 'all';
  onSelect: (key: FilterKey, value: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const groups = mode === 'all' ? (Object.keys(filterLabels) as FilterKey[]) : [mode];

  return (
    <div className="fixed inset-y-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 justify-end bg-black/70" onClick={onClose}>
      <section className="h-full w-[84%] max-w-sm overflow-y-auto bg-white p-4 pb-6 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">选择拍摄条件</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {groups.map((key) => (
            <div key={key}>
              <p className="mb-2 text-xs font-black text-zinc-400">{filterLabels[key]}</p>
              <div className="grid grid-cols-2 gap-2">
                {filterOptions[key].map((option) => (
                  <button
                    key={option}
                    className={`h-11 rounded-full text-sm font-black ${filters[key] === option ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'}`}
                    onClick={() => onSelect(key, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="h-12 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700" onClick={onReset}>
            清空
          </button>
          <button className="h-12 rounded-full bg-black text-sm font-bold text-white" onClick={onClose}>
            完成
          </button>
        </div>
      </section>
    </div>
  );
}

function matchesFinderFilters(filters: FinderFilters, searchable: string, priceCents: number) {
  return (
    matchesTextOption(filters.area, filterOptions.area[0], searchable) &&
    matchesTimeOption(filters.time, searchable) &&
    matchesTextOption(filters.style, filterOptions.style[0], searchable) &&
    matchesBudgetOption(filters.budget, priceCents)
  );
}

function matchesTextOption(option: string, emptyValue: string, searchable: string) {
  return option === emptyValue || searchable.includes(option.toLowerCase());
}

function matchesTimeOption(option: string, searchable: string) {
  if (option === filterOptions.time[0]) return true;
  if (option === '现在可拍') return searchable.includes('今天') || searchable.includes('现在');
  if (option === '1小时内') return searchable.includes('1小时') || searchable.includes('快拍');
  return searchable.includes(option.toLowerCase());
}

function matchesBudgetOption(option: string, priceCents: number) {
  if (option === filterOptions.budget[0]) return true;
  const budgetYuan = Number(option.match(/\d+/)?.[0]);
  return Number.isFinite(budgetYuan) ? priceCents <= budgetYuan * 100 : true;
}

function createInitialFinderFilters(params: URLSearchParams, sameStylePost?: ReturnType<typeof listFeedPosts>[number]) {
  return {
    area: matchFilterOption('area', params.get('area') ?? sameStylePost?.locationName ?? sameStylePost?.companion.areas[0]),
    time: matchFilterOption('time', params.get('time')),
    style: matchFilterOption('style', params.get('style') ?? sameStylePost?.activity ?? sameStylePost?.styleTags[0]),
    budget: matchFilterOption('budget', params.get('budget')),
  };
}

function matchFilterOption(key: FilterKey, value?: string | null) {
  if (!value) return initialFinderFilters[key];
  const normalized = value.trim().toLowerCase();
  return (
    filterOptions[key].find((option) => option.toLowerCase() === normalized) ??
    filterOptions[key].find((option) => option !== initialFinderFilters[key] && (option.toLowerCase().includes(normalized) || normalized.includes(option.toLowerCase()))) ??
    initialFinderFilters[key]
  );
}

function getActiveFilterCount(filters: FinderFilters) {
  return (Object.keys(filters) as FilterKey[]).filter((key) => filters[key] !== initialFinderFilters[key]).length;
}
