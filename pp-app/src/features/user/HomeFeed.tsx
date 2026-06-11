import { ChevronDown, LocateFixed, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppData } from '../../app/useAppData';
import { fetchFeedPosts, listFeedPosts, mergeApprovedWorkIntoFeed } from '../../services/feedService';
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

type ConsumerLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
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

const cities = ['上海', '北京', '杭州', '成都'];
const channels = ['关注', '发现', '附近'];
const quickScenes = ['今天可拍', 'Citywalk', '探店', '夜景', '同城优先'];
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
    <div className="min-h-dvh pp-page">
      <header className="sticky top-0 z-20 border-b border-[#eadfd8]/80 bg-[#fbf7f2]/92 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex h-10 items-center justify-between gap-3">
          <button
            className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/78 px-3 py-2 text-sm font-bold text-[#3f302c] ring-1 ring-[#eadfd8]"
            onClick={() => setCityOpen(true)}
          >
            <MapPin size={16} className="shrink-0 text-[#e85d75]" />
            <span className="truncate">{filters.city}</span>
            <ChevronDown size={15} className="shrink-0 text-[#9b8e87]" />
          </button>

          <nav className="flex items-center gap-5 text-base font-semibold text-[#a99b94]">
            {channels.map((channel) => (
              <button
                key={channel}
                className={`relative pb-1 ${filters.channel === channel ? 'text-[#3f302c]' : ''}`}
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
                {filters.channel === channel ? <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[#e85d75]" /> : null}
              </button>
            ))}
          </nav>

          <button
            className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              activeFilterCount ? 'pp-primary' : 'bg-white/78 text-[#5f514b] ring-1 ring-[#eadfd8]'
            }`}
            onClick={() => setFilterOpen(true)}
            aria-label="筛选"
          >
            <SlidersHorizontal size={18} />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-black text-[#e85d75]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-full bg-white/88 px-3 py-2 text-[#3f302c] ring-1 ring-[#eadfd8]">
          <Search size={17} className="shrink-0 text-[#b0a29b]" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-[#b0a29b]"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="搜索商圈、街道、咖啡店"
          />
          <button
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
              filters.nearbyOnly ? 'pp-primary' : 'bg-[#f4ebe6] text-[#7a6b64]'
            }`}
            onClick={() => {
              if (filters.nearbyOnly) {
                setMatchedPostIds(null);
                setLocationMessage('');
                setFilters((current) => ({ ...current, nearbyOnly: false, channel: channels[1] }));
                return;
              }
              requestConsumerLocation();
            }}
            aria-label="附近"
          >
            <LocateFixed size={16} className={locationStatus === 'locating' ? 'animate-spin' : undefined} />
          </button>
        </div>

        {locationMessage ? <p className="mt-2 px-1 text-xs font-semibold text-[#8f8078]">{locationMessage}</p> : null}

        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {quickScenes.map((scene) => (
            <button
              key={scene}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                filters.scene === scene || (scene === '今天可拍' && filters.date === '今天') ? 'pp-primary' : 'pp-pill'
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

function CitySheet({ city, onSelect, onClose }: { city: string; onSelect: (city: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3f302c]/35 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[22px] bg-[#fffaf6] p-4 text-[#27211f] shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3f302c]/35 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[22px] bg-[#fffaf6] p-4 pb-5 text-[#27211f] shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
              filters.nearbyOnly ? 'pp-primary' : 'pp-pill'
            }`}
            onClick={onNearbyToggle}
          >
            <LocateFixed size={16} />
            优先看附近
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="h-12 rounded-full bg-[#f2e8e1] text-sm font-bold text-[#6f625d]" onClick={onReset}>
            重置
          </button>
          <button className="h-12 rounded-full pp-primary text-sm font-bold" onClick={onClose}>
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
      <button className="grid h-9 w-9 place-items-center rounded-full bg-[#f2e8e1] text-[#7a6b64]" onClick={onClose} aria-label="关闭">
        <X size={18} />
      </button>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold text-[#8f8078]">{label}</p>
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
      <p className="mb-2 text-xs font-bold text-[#8f8078]">{label}</p>
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

function applyQuickScene(scene: string, setFilters: React.Dispatch<React.SetStateAction<FeedFilters>>) {
  setFilters((current) => {
    if (scene === '今天可拍') return { ...current, date: current.date === '今天' ? '不限' : '今天' };
    if (scene === '同城优先') return { ...current, city: current.city === '上海' ? '北京' : '上海' };
    return { ...current, scene: current.scene === scene ? '不限' : scene };
  });
}

function getActiveFilterCount(filters: FeedFilters) {
  return [
    filters.city !== initialFilters.city,
    filters.query.trim().length > 0,
    filters.nearbyOnly,
    filters.date !== initialFilters.date,
    filters.time !== initialFilters.time,
    filters.scene !== initialFilters.scene,
    filters.durationMinutes !== initialFilters.durationMinutes,
    filters.maxBudgetCents !== initialFilters.maxBudgetCents,
    filters.genderPreference !== initialFilters.genderPreference,
  ].filter(Boolean).length;
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
