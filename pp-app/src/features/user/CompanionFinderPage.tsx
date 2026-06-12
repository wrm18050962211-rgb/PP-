import { CalendarDays, LocateFixed, MapPin, MessageCircle, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';

type FilterKey = 'area' | 'time' | 'style' | 'budget';
type FinderFilters = Record<FilterKey, string>;

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
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState<FilterKey | 'all' | null>(null);
  const [filters, setFilters] = useState<FinderFilters>(initialFinderFilters);
  const sameStylePostId = params.get('sameStyle');
  const posts = listFeedPosts();
  const sameStylePost = posts.find((post) => post.id === sameStylePostId);
  const activeFilterCount = getActiveFilterCount(filters);
  const companions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return Array.from(new Map(posts.map((post) => [post.companion.id, { companion: post.companion, post }])).values()).filter(({ companion, post }) => {
      const searchable = [
        post.location,
        post.locationName,
        post.activity,
        ...post.styleTags,
        companion.name,
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
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/92 px-4 pb-4 pt-3 backdrop-blur-xl">
        <div className="flex justify-end">
          <button className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-black" aria-label="筛选" onClick={() => setFilterOpen('all')}>
            <SlidersHorizontal size={18} />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] font-black text-white ring-1 ring-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-3 rounded-[10px] bg-white p-3 text-black">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
              <button
                key={key}
                className="flex h-12 min-w-0 items-center justify-between gap-2 border border-zinc-200 bg-white px-3 text-left"
                onClick={() => setFilterOpen(key)}
              >
                <span className="shrink-0 text-[11px] font-black text-zinc-400">{filterLabels[key]}</span>
                <span className="min-w-0 truncate text-sm font-black text-zinc-900">{filters[key]}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">
            <Search size={16} className="shrink-0" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="有特殊要求再搜索"
            />
          </div>
          <button className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-black text-sm font-black text-white">
            <LocateFixed size={17} />
            使用当前位置推荐附近摄影师
          </button>
        </div>
      </header>

      {sameStylePost ? (
        <section className="px-3 pt-3">
          <div className="flex items-center gap-3 rounded-[10px] bg-white p-3 text-black">
            <img className="h-16 w-12 rounded-[6px] object-cover" src={sameStylePost.images[0]?.url} alt={sameStylePost.location} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-zinc-500">按这组作品找同款摄影师</p>
              <p className="mt-1 line-clamp-2 text-sm font-bold leading-5">{sameStylePost.locationName || sameStylePost.location}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3 px-3 pt-3">
        {companions.map(({ companion, post }, index) => {
          const activity = companion.activities[0];
          const slot = companion.slots.find((item) => item.status === 'available') || companion.slots[0];
          return (
            <article key={companion.id} className="rounded-[18px] bg-white p-3 shadow-[0_10px_28px_rgba(91,64,49,0.08)] ring-1 ring-[#eadfd8]/80">
              <div className="flex gap-3">
                <Link to={`/consumer/photographer/${companion.id}`} className="shrink-0">
                  <img className="h-24 w-20 rounded-[14px] object-cover" src={companion.photo || companion.avatar} alt={companion.name} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link to={`/consumer/photographer/${companion.id}`} className="truncate text-base font-black">
                      {companion.name}
                    </Link>
                    <span className="shrink-0 rounded-full bg-[#f6eee8] px-2 py-1 text-xs font-black text-[#3f302c]">
                      ￥{Math.round((activity?.priceCents || 0) / 100)}起
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[#7a6b64]">
                    <Star size={13} className="fill-[#f2c25b] text-[#f2c25b]" />
                    推荐分 {96 - index * 3} · {companion.ratingAvg.toFixed(1)} · {companion.ratingCount}条评价
                  </p>
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-[#7a6b64]">
                    <MapPin size={13} className="shrink-0 text-[#e85d75]" />
                    <span className="truncate">{companion.areas.slice(0, 3).join(' / ')}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#7a6b64]">
                    <CalendarDays size={13} className="text-[#9fb89f]" />
                    最近可约：{slot?.label || '待开放'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {companion.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full bg-[#f6eee8] px-2 py-1 text-[11px] font-bold text-[#7a6b64]">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <Link className="rounded-full bg-[#3f302c] px-4 py-2.5 text-center text-sm font-black text-white" to={`/consumer/post/${post.id}`}>
                  查看作品并预约
                </Link>
                <Link className="grid h-11 w-11 place-items-center rounded-full bg-[#f6eee8] text-[#3f302c]" to="/consumer/messages" aria-label="咨询摄影师">
                  <MessageCircle size={18} />
                </Link>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[18px] bg-white p-4 pb-5 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
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

function getActiveFilterCount(filters: FinderFilters) {
  return (Object.keys(filters) as FilterKey[]).filter((key) => filters[key] !== initialFinderFilters[key]).length;
}
