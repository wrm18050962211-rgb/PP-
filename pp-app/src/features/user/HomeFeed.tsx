import { ChevronDown, LocateFixed, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchFeedPosts, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';
import { PhotoFeed } from './PhotoFeed';

type FeedFilters = {
  city: string;
  channel: string;
  query: string;
  nearbyOnly: boolean;
  date: string;
  time: string;
  scene: string;
};

const initialFilters: FeedFilters = {
  city: '上海',
  channel: '发现',
  query: '',
  nearbyOnly: false,
  date: '不限',
  time: '不限',
  scene: '不限',
};

const cities = ['上海', '北京', '杭州', '成都'];
const channels = ['关注', '发现', '附近'];
const quickScenes = ['今天可拍', 'Citywalk', '探店', '夜景', '同城优先'];
const dateOptions = ['不限', '今天', '明天', '周末'];
const timeOptions = ['不限', '上午', '下午', '傍晚', '晚上'];
const sceneOptions = ['不限', 'Citywalk', '探店', '街拍', '夜景', '旅行'];

export function HomeFeed() {
  const [posts, setPosts] = useState<FeedPost[]>(() => listFeedPosts());
  const [filters, setFilters] = useState<FeedFilters>(initialFilters);
  const [cityOpen, setCityOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchFeedPosts().then((nextPosts) => {
      if (mounted) setPosts(nextPosts);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const filteredPosts = useMemo(() => rankPosts(posts, filters), [posts, filters]);
  const activeFilterCount = getActiveFilterCount(filters);

  return (
    <div className="min-h-dvh bg-[#111116] text-white">
      <header className="sticky top-0 z-20 border-b border-white/6 bg-[#111116]/94 px-3 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex h-10 items-center justify-between gap-3">
          <button
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-bold text-white"
            onClick={() => setCityOpen(true)}
          >
            <MapPin size={16} className="shrink-0" />
            <span className="truncate">{filters.city}</span>
            <ChevronDown size={15} className="shrink-0 text-white/60" />
          </button>

          <nav className="flex items-center gap-5 text-base font-semibold text-white/48">
            {channels.map((channel) => (
              <button
                key={channel}
                className={`relative pb-1 ${filters.channel === channel ? 'text-white' : ''}`}
                onClick={() => {
                  setFilters((current) => ({
                    ...current,
                    channel,
                    nearbyOnly: channel === '附近',
                  }));
                }}
              >
                {channel}
                {filters.channel === channel ? <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-rose-500" /> : null}
              </button>
            ))}
          </nav>

          <button
            className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${activeFilterCount ? 'bg-rose-500' : 'bg-white/10'}`}
            onClick={() => setFilterOpen(true)}
            aria-label="筛选"
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-black text-rose-500">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-zinc-950">
          <Search size={17} className="shrink-0 text-zinc-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-zinc-400"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="搜索商圈、街道、咖啡店"
          />
          <button
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${filters.nearbyOnly ? 'bg-rose-500 text-white' : 'bg-zinc-100 text-zinc-600'}`}
            onClick={() => setFilters((current) => ({ ...current, nearbyOnly: !current.nearbyOnly, channel: current.nearbyOnly ? '发现' : '附近' }))}
            aria-label="附近"
          >
            <LocateFixed size={16} />
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {quickScenes.map((scene) => (
            <button
              key={scene}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                filters.scene === scene || (scene === '今天可拍' && filters.date === '今天') ? 'bg-rose-500 text-white' : 'bg-white/9 text-white/72'
              }`}
              onClick={() => applyQuickScene(scene, setFilters)}
            >
              {scene}
            </button>
          ))}
        </div>
      </header>

      <PhotoFeed posts={filteredPosts} />

      {cityOpen ? <CitySheet city={filters.city} onSelect={(city) => setFilters((current) => ({ ...current, city }))} onClose={() => setCityOpen(false)} /> : null}
      {filterOpen ? (
        <FilterSheet
          filters={filters}
          onChange={(partial) => setFilters((current) => ({ ...current, ...partial }))}
          onReset={() => setFilters(initialFilters)}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CitySheet({ city, onSelect, onClose }: { city: string; onSelect: (city: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[18px] bg-[#1a1a20] p-4 text-white" onClick={(event) => event.stopPropagation()}>
        <SheetHeader title="选择城市" onClose={onClose} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {cities.map((item) => (
            <button
              key={item}
              className={`h-12 rounded-[8px] text-sm font-bold ${item === city ? 'bg-rose-500 text-white' : 'bg-white/8 text-white/76'}`}
              onClick={() => {
                onSelect(item);
                onClose();
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterSheet({
  filters,
  onChange,
  onReset,
  onClose,
}: {
  filters: FeedFilters;
  onChange: (partial: Partial<FeedFilters>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[18px] bg-[#1a1a20] p-4 pb-5 text-white" onClick={(event) => event.stopPropagation()}>
        <SheetHeader title="筛选" onClose={onClose} />
        <div className="mt-4 space-y-4">
          <FilterGroup label="日期" options={dateOptions} value={filters.date} onChange={(date) => onChange({ date })} />
          <FilterGroup label="时间" options={timeOptions} value={filters.time} onChange={(time) => onChange({ time })} />
          <FilterGroup label="场景" options={sceneOptions} value={filters.scene} onChange={(scene) => onChange({ scene })} />
          <button
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold ${
              filters.nearbyOnly ? 'bg-rose-500 text-white' : 'bg-white/8 text-white/76'
            }`}
            onClick={() => onChange({ nearbyOnly: !filters.nearbyOnly, channel: filters.nearbyOnly ? '发现' : '附近' })}
          >
            <LocateFixed size={16} />
            优先看附近
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="h-12 rounded-full bg-white/8 text-sm font-bold text-white/76" onClick={onReset}>
            重置
          </button>
          <button className="h-12 rounded-full bg-rose-500 text-sm font-bold text-white" onClick={onClose}>
            完成
          </button>
        </div>
      </section>
    </div>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-black">{title}</h2>
      <button className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-white/70" onClick={onClose} aria-label="关闭">
        <X size={18} />
      </button>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-white/58">{label}</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {options.map((option) => (
          <button
            key={option}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${option === value ? 'bg-white text-zinc-950' : 'bg-white/8 text-white/72'}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function applyQuickScene(scene: string, setFilters: React.Dispatch<React.SetStateAction<FeedFilters>>) {
  setFilters((current) => {
    if (scene === '今天可拍') return { ...current, date: current.date === '今天' ? '不限' : '今天' };
    if (scene === '同城优先') return { ...current, city: current.city === '上海' ? '北京' : '上海' };
    return { ...current, scene: current.scene === scene ? '不限' : scene };
  });
}

function rankPosts(sourcePosts: FeedPost[], filters: FeedFilters) {
  const query = filters.query.trim().toLowerCase();
  return [...sourcePosts].sort((a, b) => getPostScore(b, filters, query) - getPostScore(a, filters, query));
}

function getPostScore(post: FeedPost, filters: FeedFilters, query: string) {
  let score = 0;
  const text = [post.location, post.timeLabel, post.activity, ...post.styleTags, ...post.companion.areas].join(' ').toLowerCase();

  if (post.companion.baseCity === filters.city || post.location.includes(filters.city)) score += 3;
  if (query && text.includes(query)) score += 5;
  if (filters.date !== '不限' && post.companion.slots.some((slot) => slot.dateLabel === filters.date || slot.label.includes(filters.date))) score += 2;
  if (filters.time !== '不限' && (post.timeLabel.includes(filters.time) || post.companion.slots.some((slot) => slot.timeLabel.includes(filters.time)))) score += 2;
  if (filters.scene !== '不限' && text.includes(filters.scene.toLowerCase())) score += 3;
  if (filters.nearbyOnly) score += post.location.includes('上海') ? 2 : 0;

  return score;
}

function getActiveFilterCount(filters: FeedFilters) {
  return [
    filters.city !== initialFilters.city,
    filters.query.trim().length > 0,
    filters.nearbyOnly,
    filters.date !== initialFilters.date,
    filters.time !== initialFilters.time,
    filters.scene !== initialFilters.scene,
  ].filter(Boolean).length;
}
