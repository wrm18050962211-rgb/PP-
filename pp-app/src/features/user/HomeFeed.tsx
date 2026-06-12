import { ChevronLeft, LocateFixed, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../../app/useAppData';
import { fetchFeedPosts, listFeedPosts, mergeApprovedWorkIntoFeed } from '../../services/feedService';
import type { ConsumerLocation } from '../../services/locationService';
import { fetchMatchedCompanions, matchCompanions, type GenderPreference } from '../../services/matchingService';
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
  durationMinutes: number | null;
  maxBudgetCents: number | null;
  genderPreference: GenderPreference;
};

type LocationStatus = 'idle' | 'locating' | 'located' | 'unsupported' | 'denied' | 'failed';

const initialFilters: FeedFilters = {
  city: '上海',
  channel: '发现',
  query: '',
  nearbyOnly: false,
  date: '不限',
  time: '不限',
  scene: '不限',
  durationMinutes: null,
  maxBudgetCents: null,
  genderPreference: 'any',
};

const cities = ['不限', '上海', '北京', '杭州', '成都'];
const channels = ['关注', '发现', '附近'];
const dateOptions = ['不限', '今天', '明天', '周末'];
const timeOptions = ['不限', '上午', '下午', '傍晚', '晚上'];
const sceneOptions = ['不限', 'Citywalk', '探店', '街拍', '夜景', '旅行'];
const durationOptions = [
  { label: '不限', value: null },
  { label: '1小时', value: 60 },
  { label: '1.5小时', value: 90 },
  { label: '2小时', value: 120 },
  { label: '4小时', value: 240 },
];
const budgetOptions = [
  { label: '不限', value: null },
  { label: '¥300内', value: 30000 },
  { label: '¥400内', value: 40000 },
  { label: '¥700内', value: 70000 },
];
const genderOptions: Array<{ label: string; value: GenderPreference }> = [
  { label: '不限', value: 'any' },
  { label: '只看女陪拍', value: 'female_only' },
];
const searchHistoryKey = 'pp:consumer-search-history';
const searchSuggestions = ['黑白大片', 'Citywalk', '探店', '夜景', '武康路', '安福路', '预算300内', '女生摄影师'];

export function HomeFeed() {
  const { workDraft } = useAppData();
  const [posts, setPosts] = useState<FeedPost[]>(() => listFeedPosts());
  const [filters, setFilters] = useState<FeedFilters>(initialFilters);
  const [cityOpen, setCityOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [consumerLocation, setConsumerLocation] = useState<ConsumerLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [matchedPostIds, setMatchedPostIds] = useState<string[] | null>(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.query);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory());

  useEffect(() => {
    let mounted = true;
    fetchFeedPosts().then((nextPosts) => {
      if (mounted) setPosts(nextPosts);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const requestConsumerLocation = useCallback(() => {
    setMatchedPostIds(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      setLocationMessage('当前环境不支持定位，已使用本地附近演示排序');
      setFilters((current) => ({ ...current, nearbyOnly: true, channel: channels[2] }));
      return;
    }

    setLocationStatus('locating');
    setLocationMessage('正在获取当前位置...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setConsumerLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationStatus('located');
        setLocationMessage('已按当前位置优先展示附近陪拍者');
        setFilters((current) => ({ ...current, nearbyOnly: true, channel: channels[2] }));
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed');
        setLocationMessage(error.code === error.PERMISSION_DENIED ? '未获得定位授权，已使用本地附近演示排序' : '定位暂时失败，已使用本地附近演示排序');
        setFilters((current) => ({ ...current, nearbyOnly: true, channel: channels[2] }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const feedPosts = useMemo(() => mergeApprovedWorkIntoFeed(posts, workDraft), [posts, workDraft]);
  const localFilteredPosts = useMemo(
    () =>
      matchCompanions(feedPosts, {
        city: filters.city,
        lat: consumerLocation?.lat,
        lng: consumerLocation?.lng,
        location: filters.query,
        keyword: filters.query,
        date: filters.date,
        time: filters.time,
        activityType: filters.scene,
        durationMinutes: filters.durationMinutes ?? undefined,
        maxBudgetCents: filters.maxBudgetCents ?? undefined,
        genderPreference: filters.genderPreference,
        nearbyOnly: filters.nearbyOnly,
      }),
    [consumerLocation, feedPosts, filters],
  );
  const filteredPosts = useMemo(() => sortPostsByMatchedIds(localFilteredPosts, matchedPostIds), [localFilteredPosts, matchedPostIds]);
  const activeFilterCount = getActiveFilterCount(filters);

  const openSearch = useCallback(() => {
    setSearchDraft(filters.query);
    setSearchOpen(true);
  }, [filters.query]);

  const submitSearch = useCallback(
    (keyword: string) => {
      const nextKeyword = keyword.trim();
      setFilters((current) => ({ ...current, query: nextKeyword }));

      if (nextKeyword) {
        setSearchHistory((current) => {
          const nextHistory = [nextKeyword, ...current.filter((item) => item !== nextKeyword)].slice(0, 8);
          saveSearchHistory(nextHistory);
          return nextHistory;
        });
      }

      setSearchDraft(nextKeyword);
      setSearchOpen(false);
    },
    [],
  );

  const clearSearch = useCallback(() => {
    setSearchDraft('');
    setFilters((current) => ({ ...current, query: '' }));
  }, []);

  useEffect(() => {
    if (!filters.nearbyOnly || !consumerLocation) {
      setMatchedPostIds(null);
      return;
    }

    let mounted = true;
    fetchMatchedCompanions({
      city: filters.city,
      lat: consumerLocation.lat,
      lng: consumerLocation.lng,
      location: filters.query,
      keyword: filters.query,
      date: filters.date,
      time: filters.time,
      activityType: filters.scene,
      durationMinutes: filters.durationMinutes ?? undefined,
      maxBudgetCents: filters.maxBudgetCents ?? undefined,
      genderPreference: filters.genderPreference,
      nearbyOnly: true,
    }).then((items) => {
      if (!mounted) return;
      const companionIds = items.map((item) => item.companion.id);
      setMatchedPostIds(companionIds.length ? companionIds : null);
    });

    return () => {
      mounted = false;
    };
  }, [consumerLocation, filters]);


  return (
    <div className="min-h-dvh bg-[#050505] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex h-10 items-center justify-between gap-3">
          <button
            className="flex h-9 max-w-[72px] shrink-0 items-center gap-1.5 rounded-full bg-white px-2 text-black ring-1 ring-white/20"
            onClick={() => setCityOpen(true)}
            aria-label={`选择城市：${filters.city}`}
            title={filters.city}
          >
            <MapPin size={15} className="shrink-0" />
            <span className="min-w-0 truncate text-[11px] font-black leading-none">{filters.city}</span>
          </button>

          <nav className="flex items-center gap-5 text-base font-black text-white/42">
            {channels.map((channel) => (
              <button
                key={channel}
                className={`relative pb-1 ${filters.channel === channel ? 'text-white' : ''}`}
                onClick={() => {
                  if (channel === channels[2]) {
                    requestConsumerLocation();
                    return;
                  }
                  setMatchedPostIds(null);
                  setFilters((current) => ({
                    ...current,
                    channel,
                    nearbyOnly: false,
                  }));
                }}
              >
                {channel}
                {filters.channel === channel ? <span className="absolute inset-x-1 -bottom-0.5 h-0.5 rounded-full bg-white" /> : null}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <button
              className={`relative grid h-9 w-9 place-items-center rounded-full ${
                filters.query ? 'bg-white text-black' : 'bg-white/10 text-white ring-1 ring-white/16'
              }`}
              onClick={openSearch}
              aria-label="搜索"
            >
              <Search size={18} />
              {filters.query ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-black" /> : null}
            </button>
            <button
              className={`relative grid h-9 w-9 place-items-center rounded-full ${
                activeFilterCount ? 'bg-white text-black' : 'bg-white/10 text-white ring-1 ring-white/16'
              }`}
              onClick={() => setFilterOpen(true)}
              aria-label="筛选"
            >
              <SlidersHorizontal size={18} />
              {activeFilterCount ? (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-black px-1 text-[10px] font-black text-white ring-1 ring-white/50">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {filters.query ? (
          <div className="mt-3 flex items-center justify-between gap-2 border border-white/14 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/82">
            <button className="min-w-0 flex-1 truncate text-left" onClick={openSearch}>
              搜索：{filters.query}
            </button>
            <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-white/70" onClick={clearSearch} aria-label="清除搜索">
              <X size={14} />
            </button>
          </div>
        ) : null}

        {locationMessage ? <p className="mt-2 px-1 text-xs font-semibold text-white/52">{locationMessage}</p> : null}

      </header>

      <PhotoFeed posts={filteredPosts} />

      {searchOpen ? (
        <SearchOverlay
          value={searchDraft}
          history={searchHistory}
          suggestions={searchSuggestions}
          onChange={setSearchDraft}
          onSubmit={submitSearch}
          onClose={() => setSearchOpen(false)}
          onPick={submitSearch}
          onClearHistory={() => {
            setSearchHistory([]);
            saveSearchHistory([]);
          }}
        />
      ) : null}

      {cityOpen ? <CitySheet city={filters.city} onSelect={(city) => setFilters((current) => ({ ...current, city }))} onClose={() => setCityOpen(false)} /> : null}
      {filterOpen ? (
        <FilterSheet
          filters={filters}
          onChange={(partial) => setFilters((current) => ({ ...current, ...partial }))}
          onNearbyToggle={() => {
            if (filters.nearbyOnly) {
              setMatchedPostIds(null);
              setLocationMessage('');
              setFilters((current) => ({ ...current, nearbyOnly: false, channel: channels[1] }));
              return;
            }
            requestConsumerLocation();
          }}
          onReset={() => {
            setMatchedPostIds(null);
            setLocationMessage('');
            setFilters(initialFilters);
          }}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SearchOverlay({
  value,
  history,
  suggestions,
  onChange,
  onSubmit,
  onClose,
  onPick,
  onClearHistory,
}: {
  value: string;
  history: string[];
  suggestions: string[];
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClose: () => void;
  onPick: (value: string) => void;
  onClearHistory: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#17171c] text-white">
      <div className="mx-auto min-h-dvh w-full max-w-md px-4 pb-8 pt-5">
        <div className="flex items-center gap-3">
          <button
            className="grid h-10 w-8 shrink-0 place-items-center text-white/86"
            onClick={onClose}
            aria-label="返回"
          >
            <ChevronLeft size={28} strokeWidth={1.8} />
          </button>

          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 px-4 text-white ring-1 ring-white/10">
            <input
              ref={inputRef}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-white/36"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSubmit(value);
              }}
              placeholder="搜索商圈、风格、摄影师"
            />
            {value ? (
              <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/12 text-white/58" onClick={() => onChange('')} aria-label="清空">
                <X size={14} />
              </button>
            ) : null}
            <button className="border-l border-white/10 pl-3 text-sm font-black text-white" onClick={() => onSubmit(value)}>
              搜索
            </button>
          </div>
        </div>

        {history.length ? (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-white/86">历史记录</h2>
              <button className="text-xs font-bold text-white/36" onClick={onClearHistory}>
                清空
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map((item) => (
                <button key={item} className="rounded-full border border-white/8 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/78" onClick={() => onPick(item)}>
                  {item}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-black text-white/86">猜你想搜</h2>
            <span className="text-xs font-bold text-white/26">按风格找作品</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            {suggestions.map((item) => (
              <button key={item} className="truncate text-left text-lg font-semibold text-white/72" onClick={() => onPick(item)}>
                {item}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CitySheet({ city, onSelect, onClose }: { city: string; onSelect: (city: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[18px] bg-white p-4 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <SheetHeader title="选择城市" onClose={onClose} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {cities.map((item) => (
            <button
              key={item}
              className={`h-12 rounded-[14px] text-sm font-bold ${item === city ? 'pp-pill-active' : 'pp-pill'}`}
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
  onNearbyToggle,
  onReset,
  onClose,
}: {
  filters: FeedFilters;
  onChange: (partial: Partial<FeedFilters>) => void;
  onNearbyToggle: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose}>
      <section className="h-full w-[84%] max-w-sm overflow-y-auto bg-white p-4 pb-6 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <SheetHeader title="筛选" onClose={onClose} />
        <div className="mt-4 space-y-4">
          <FilterGroup label="日期" options={dateOptions} value={filters.date} onChange={(date) => onChange({ date })} />
          <FilterGroup label="时间" options={timeOptions} value={filters.time} onChange={(time) => onChange({ time })} />
          <FilterGroup label="活动类型" options={sceneOptions} value={filters.scene} onChange={(scene) => onChange({ scene })} />
          <OptionGroup
            label="时长"
            options={durationOptions}
            value={filters.durationMinutes}
            onChange={(durationMinutes) => onChange({ durationMinutes })}
          />
          <OptionGroup
            label="预算"
            options={budgetOptions}
            value={filters.maxBudgetCents}
            onChange={(maxBudgetCents) => onChange({ maxBudgetCents })}
          />
          <OptionGroup
            label="性别偏好"
            options={genderOptions}
            value={filters.genderPreference}
            onChange={(genderPreference) => onChange({ genderPreference })}
          />
          <button
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold ${
              filters.nearbyOnly ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-black'
            }`}
            onClick={onNearbyToggle}
          >
            <LocateFixed size={16} />
            优先看附近
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="h-12 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700" onClick={onReset}>
            重置
          </button>
          <button className="h-12 rounded-full bg-black text-sm font-bold text-white" onClick={onClose}>
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
      <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={onClose} aria-label="关闭">
        <X size={18} />
      </button>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-zinc-500">{label}</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {options.map((option) => (
          <button
            key={option}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${option === value ? 'pp-pill-active' : 'pp-pill'}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionGroup<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-zinc-500">{label}</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {options.map((option) => (
          <button
            key={option.label}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${option.value === value ? 'pp-pill-active' : 'pp-pill'}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function getActiveFilterCount(filters: FeedFilters) {
  return [
    filters.city !== initialFilters.city,
    filters.nearbyOnly,
    filters.date !== initialFilters.date,
    filters.time !== initialFilters.time,
    filters.scene !== initialFilters.scene,
    filters.durationMinutes !== initialFilters.durationMinutes,
    filters.maxBudgetCents !== initialFilters.maxBudgetCents,
    filters.genderPreference !== initialFilters.genderPreference,
  ].filter(Boolean).length;
}

function loadSearchHistory() {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(searchHistoryKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8);
  } catch {
    return [];
  }
}

function saveSearchHistory(items: string[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(searchHistoryKey, JSON.stringify(items));
  } catch {
    // Ignore storage errors so private browsing does not block search.
  }
}

function sortPostsByMatchedIds(posts: FeedPost[], companionIds: string[] | null) {
  if (!companionIds?.length) return posts;

  const rank = new Map(companionIds.map((id, index) => [id, index]));
  return [...posts].sort((left, right) => {
    const leftRank = rank.get(left.companion.id) ?? Number.POSITIVE_INFINITY;
    const rightRank = rank.get(right.companion.id) ?? Number.POSITIVE_INFINITY;
    return leftRank - rightRank;
  });
}
