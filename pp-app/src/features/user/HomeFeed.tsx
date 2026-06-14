import { ChevronDown, ChevronLeft, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import { fetchFeedPostPage, getPostTitle, listFeedPostPage, listFeedPosts, mergeApprovedWorkIntoFeed, type FeedPostPage } from '../../services/feedService';
import type { ConsumerLocation } from '../../services/locationService';
import { fetchMatchedCompanions, matchCompanions, type GenderPreference } from '../../services/matchingService';
import type { FeedPost } from '../../types/api';
import { PhotoFeed } from './PhotoFeed';

type FeedFilters = {
  city: string;
  district: string;
  area: string;
  locationPointName: string;
  locationLat: number | null;
  locationLng: number | null;
  maxDistanceKm: number | null;
  channel: FeedChannel;
  query: string;
  nearbyOnly: boolean;
  scene: string;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  minBudgetCents: number;
  maxBudgetCents: number | null;
  creatorGenderPreference: GenderPreference;
  photographerGenderPreference: GenderPreference;
};

type LocationStatus = 'idle' | 'locating' | 'located' | 'unsupported' | 'denied' | 'failed';
type FeedChannel = '关注' | '发现' | '附近';
type FeedDragState = {
  active: boolean;
  startX: number;
  deltaX: number;
  pointerId: number | null;
};
type ConsumerShellContext = {
  homeChromeCompact?: boolean;
};

const initialFilters: FeedFilters = {
  city: '上海',
  district: '不限',
  area: '不限',
  locationPointName: '当前位置',
  locationLat: null,
  locationLng: null,
  maxDistanceKm: null,
  channel: '发现',
  query: '',
  nearbyOnly: false,
  scene: '不限',
  minDurationMinutes: 30,
  maxDurationMinutes: 480,
  minBudgetCents: 0,
  maxBudgetCents: null,
  creatorGenderPreference: 'any',
  photographerGenderPreference: 'any',
};

const locationOptions: Record<string, Record<string, string[]>> = {
  不限: { 不限: ['不限'] },
  上海: {
    不限: ['不限'],
    徐汇区: ['不限', '武康路', '衡山路', '徐家汇', '西岸艺术中心'],
    静安区: ['不限', '安福路', '巨鹿路', '静安寺', '南京西路'],
    黄浦区: ['不限', '外滩', '新天地', '淮海中路', '人民广场'],
    虹口区: ['不限', '北外滩', '鲁迅公园', '四川北路'],
  },
  北京: {
    不限: ['不限'],
    朝阳区: ['不限', '三里屯', '朝阳公园', '798园区', '国贸'],
    东城区: ['不限', '鼓楼', '南锣鼓巷', '东四'],
    海淀区: ['不限', '五道口', '中关村', '颐和园'],
  },
  杭州: {
    不限: ['不限'],
    西湖区: ['不限', '西湖', '灵隐', '龙井村'],
    上城区: ['不限', '湖滨', '南宋御街', '钱江新城'],
  },
  成都: {
    不限: ['不限'],
    锦江区: ['不限', '太古里', '春熙路', '九眼桥'],
    武侯区: ['不限', '玉林', '桐梓林', '武侯祠'],
  },
};
const channels: FeedChannel[] = ['关注', '发现', '附近'];
const idleFeedDragState: FeedDragState = { active: false, startX: 0, deltaX: 0, pointerId: null };
const sceneOptions = ['不限', 'Citywalk', '探店', '街拍', '夜景', '旅行'];
const genderOptions: Array<{ label: string; value: GenderPreference }> = [
  { label: '不限', value: 'any' },
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
];
const minDurationLimit = 30;
const maxDurationLimit = 480;
const durationStepMinutes = 30;
const maxBudgetLimitCents = 200000;
const budgetStepCents = 5000;
const maxDistanceLimitKm = 50;
const feedPageSize = 18;
const feedCacheKey = 'pp:consumer-feed-page-cache:v1';
const feedCacheTtlMs = 1000 * 60 * 5;
const searchHistoryKey = 'pp:consumer-search-history';
const searchSuggestions = ['黑白大片', 'Citywalk', '探店', '夜景', '武康路', '安福路', '预算300内', '女生摄影师'];

const demoMapPoints = [
  { city: '上海', district: '徐汇区', name: '武康路定位点', address: '武康路 / 安福路', lat: 31.2087, lng: 121.4456, x: 34, y: 36 },
  { city: '上海', district: '徐汇区', name: '西岸定位点', address: '龙美术馆 / 油罐艺术中心', lat: 31.1745, lng: 121.4617, x: 55, y: 72 },
  { city: '上海', district: '静安区', name: '巨鹿路定位点', address: '巨鹿路 / 富民路', lat: 31.2246, lng: 121.4569, x: 45, y: 42 },
  { city: '上海', district: '黄浦区', name: '外滩定位点', address: '外白渡桥 / 圆明园路', lat: 31.2421, lng: 121.4907, x: 70, y: 34 },
  { city: '上海', district: '虹口区', name: '北外滩定位点', address: '北外滩 / 苏州河', lat: 31.2521, lng: 121.4989, x: 77, y: 28 },
  { city: '北京', district: '朝阳区', name: '三里屯定位点', address: '太古里 / 机电院', lat: 39.9366, lng: 116.4546, x: 64, y: 38 },
  { city: '杭州', district: '西湖区', name: '西湖定位点', address: '湖滨 / 北山街', lat: 30.2592, lng: 120.1486, x: 42, y: 50 },
  { city: '成都', district: '锦江区', name: '太古里定位点', address: '春熙路 / 太古里', lat: 30.6536, lng: 104.0807, x: 52, y: 45 },
];

type DemoMapPoint = (typeof demoMapPoints)[number];

export function HomeFeed() {
  const { homeChromeCompact = false } = useOutletContext<ConsumerShellContext>();
  const { workDraft } = useAppData();
  const initialFeedPage = useMemo(() => loadInitialFeedPage(), []);
  const [posts, setPosts] = useState<FeedPost[]>(initialFeedPage.items);
  const [feedCursor, setFeedCursor] = useState<string | null>(initialFeedPage.nextCursor);
  const [hasMoreFeed, setHasMoreFeed] = useState(initialFeedPage.hasMore);
  const [feedLoading, setFeedLoading] = useState(false);
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
  const [feedDrag, setFeedDrag] = useState<FeedDragState>(idleFeedDragState);
  const [blockFeedClick, setBlockFeedClick] = useState(false);
  const feedSwipeRef = useRef<HTMLDivElement>(null);
  const feedLoadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    setFeedLoading(true);
    fetchFeedPostPage({ limit: feedPageSize })
      .then((page) => {
        if (!mounted) return;
        setPosts(page.items);
        setFeedCursor(page.nextCursor);
        setHasMoreFeed(page.hasMore);
        saveFeedCache(page);
      })
      .finally(() => {
        if (mounted) setFeedLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const loadMoreFeed = useCallback(() => {
    if (feedLoading || !hasMoreFeed || !feedCursor) return;

    setFeedLoading(true);
    fetchFeedPostPage({ limit: feedPageSize, cursor: feedCursor })
      .then((page) => {
        setPosts((current) => {
          const nextItems = mergeUniqueFeedPosts(current, page.items);
          saveFeedCache({ ...page, items: nextItems });
          return nextItems;
        });
        setFeedCursor(page.nextCursor);
        setHasMoreFeed(page.hasMore);
      })
      .finally(() => setFeedLoading(false));
  }, [feedCursor, feedLoading, hasMoreFeed]);

  const requestConsumerLocation = useCallback(() => {
    setMatchedPostIds(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      setLocationMessage('当前环境不支持定位，已使用本地附近演示排序');
      setFilters((current) => ({ ...current, city: '不限', district: '不限', area: '不限', locationPointName: '当前位置', nearbyOnly: true, channel: channels[2] }));
      return;
    }

    setLocationStatus('locating');
    setLocationMessage('正在获取当前位置...');
    setFilters((current) => ({ ...current, city: '不限', district: '不限', area: '不限', locationPointName: '当前位置', nearbyOnly: true, channel: channels[2] }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setConsumerLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationStatus('located');
        setLocationMessage('已按当前位置优先展示附近陪拍者');
        setFilters((current) => ({
          ...current,
          city: '不限',
          district: '不限',
          area: '不限',
          locationPointName: '当前位置',
          locationLat: position.coords.latitude,
          locationLng: position.coords.longitude,
          nearbyOnly: true,
          channel: channels[2],
        }));
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed');
        setLocationMessage(error.code === error.PERMISSION_DENIED ? '未获得定位授权，已使用本地附近演示排序' : '定位暂时失败，已使用本地附近演示排序');
        setFilters((current) => ({ ...current, city: '不限', district: '不限', area: '不限', locationPointName: '当前位置', nearbyOnly: true, channel: channels[2] }));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);

  const feedPosts = useMemo(() => mergeApprovedWorkIntoFeed(posts, workDraft), [posts, workDraft]);
  const locationLabel = getLocationLabel(filters);
  const locationKeyword = getLocationKeyword(filters);
  const activeLocation = getActiveLocation(filters, consumerLocation);
  const locationKeywords = useMemo(() => getLocationKeywords(filters), [filters.area, filters.city, filters.district, filters.locationPointName]);
  const localFilteredPosts = useMemo(
    () =>
      matchCompanions(feedPosts, {
        city: filters.city,
        lat: activeLocation?.lat,
        lng: activeLocation?.lng,
        location: locationKeyword,
        locationKeywords,
        keyword: filters.query,
        activityType: filters.scene,
        minDurationMinutes: filters.minDurationMinutes,
        maxDurationMinutes: filters.maxDurationMinutes,
        minBudgetCents: filters.minBudgetCents || undefined,
        maxBudgetCents: filters.maxBudgetCents ?? undefined,
        maxDistanceMeters: filters.maxDistanceKm ? filters.maxDistanceKm * 1000 : undefined,
        genderPreference: filters.photographerGenderPreference,
        nearbyOnly: filters.nearbyOnly,
      }).filter((post) => matchesCreatorGender(post, filters.creatorGenderPreference)),
    [activeLocation?.lat, activeLocation?.lng, feedPosts, filters, locationKeyword, locationKeywords],
  );
  const channelPostGroups = useMemo(
    () => createChannelPostGroups(localFilteredPosts, matchedPostIds, filters, locationKeywords),
    [filters, localFilteredPosts, locationKeywords, matchedPostIds],
  );
  const activeChannelIndex = Math.max(0, channels.indexOf(filters.channel));
  const visibleChannelPostGroups = useMemo(
    () =>
      channels.reduce(
        (groups, channel, index) => {
          const channelPosts = channelPostGroups[channel];
          groups[channel] = index === activeChannelIndex ? channelPosts : Math.abs(index - activeChannelIndex) === 1 ? channelPosts.slice(0, 12) : [];
          return groups;
        },
        {} as Record<FeedChannel, FeedPost[]>,
      ),
    [activeChannelIndex, channelPostGroups],
  );
  const activeFilterCount = getActiveFilterCount(filters);
  const locationActive = hasActiveLocationFilter(filters);
  const topChromeHidden = homeChromeCompact && !searchOpen && !cityOpen && !filterOpen;
  const topPaddingClass = 'pt-2';

  const selectFeedChannel = useCallback(
    (channel: FeedChannel) => {
      if (channel === '附近') {
        requestConsumerLocation();
        return;
      }

      setMatchedPostIds(null);
      setLocationMessage('');
      setFilters((current) => ({
        ...current,
        channel,
        nearbyOnly: false,
      }));
    },
    [requestConsumerLocation],
  );

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

  const handleFeedPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    setFeedDrag({ active: true, startX: event.clientX, deltaX: 0, pointerId: event.pointerId });
  }, []);

  const handleFeedPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!feedDrag.active || feedDrag.pointerId !== event.pointerId) return;
      const rawDelta = event.clientX - feedDrag.startX;
      const width = feedSwipeRef.current?.clientWidth || 360;
      const atLeftEdge = activeChannelIndex === 0 && rawDelta > 0;
      const atRightEdge = activeChannelIndex === channels.length - 1 && rawDelta < 0;
      const resistance = atLeftEdge || atRightEdge ? 0.28 : 1;
      const deltaX = clampNumber(rawDelta * resistance, -width * 0.42, width * 0.42);
      if (Math.abs(rawDelta) > 8 && !event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setFeedDrag((current) => ({ ...current, deltaX }));
    },
    [activeChannelIndex, feedDrag.active, feedDrag.pointerId, feedDrag.startX],
  );

  const finishFeedDrag = useCallback(
    (event?: PointerEvent<HTMLDivElement>) => {
      if (!feedDrag.active) return;

      const width = feedSwipeRef.current?.clientWidth || 360;
      const shouldSwitch = Math.abs(feedDrag.deltaX) > width * 0.16;
      const nextIndex = shouldSwitch ? clampNumber(activeChannelIndex + (feedDrag.deltaX < 0 ? 1 : -1), 0, channels.length - 1) : activeChannelIndex;

      if (event && feedDrag.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (Math.abs(feedDrag.deltaX) > 8) {
        setBlockFeedClick(true);
        window.setTimeout(() => setBlockFeedClick(false), 80);
      }

      setFeedDrag(idleFeedDragState);
      if (nextIndex !== activeChannelIndex) selectFeedChannel(channels[nextIndex]);
    },
    [activeChannelIndex, feedDrag, selectFeedChannel],
  );

  useEffect(() => {
    if (!filters.nearbyOnly || !activeLocation) {
      setMatchedPostIds(null);
      return;
    }

    let mounted = true;
    fetchMatchedCompanions({
      city: filters.city,
      lat: activeLocation.lat,
      lng: activeLocation.lng,
      location: locationKeyword,
      keyword: filters.query,
      activityType: filters.scene,
      minDurationMinutes: filters.minDurationMinutes,
      maxDurationMinutes: filters.maxDurationMinutes,
      minBudgetCents: filters.minBudgetCents || undefined,
      maxBudgetCents: filters.maxBudgetCents ?? undefined,
      maxDistanceMeters: filters.maxDistanceKm ? filters.maxDistanceKm * 1000 : undefined,
      genderPreference: filters.photographerGenderPreference,
      nearbyOnly: true,
    }).then((items) => {
      if (!mounted) return;
      const companionIds = items.map((item) => item.companion.id);
      setMatchedPostIds(companionIds.length ? companionIds : null);
    });

    return () => {
      mounted = false;
    };
  }, [activeLocation?.lat, activeLocation?.lng, filters, locationKeyword]);

  useEffect(() => {
    const node = feedLoadRef.current;
    if (!node || !hasMoreFeed || searchOpen || cityOpen || filterOpen) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreFeed();
      },
      { rootMargin: '720px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cityOpen, filterOpen, hasMoreFeed, loadMoreFeed, searchOpen]);


  return (
    <div className={`min-h-dvh bg-[#050505] text-white transition-[padding] duration-300 ${topPaddingClass}`}>
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto max-w-md px-4 pt-3 text-white transition-all duration-300 ${
          topChromeHidden ? 'pointer-events-none -translate-y-full opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex h-10 items-center justify-between gap-3">
          <button
            className={`pointer-events-auto flex h-9 max-w-[112px] shrink-0 items-center gap-1.5 rounded-full px-2 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition ${
              locationActive ? 'bg-white text-black' : 'bg-black/26 text-white'
            }`}
            onClick={() => setCityOpen(true)}
            aria-label={`选择位置：${locationLabel}`}
            title={locationLabel}
          >
            <MapPin size={17} className="shrink-0" />
            <span className="min-w-0 truncate text-base font-black leading-none">{locationLabel}</span>
          </button>

          <nav className="pointer-events-auto flex h-9 items-center gap-5 text-base font-black text-white/48 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            {channels.map((channel) => (
              <button
                key={channel}
                className={`relative flex h-9 items-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${filters.channel === channel ? 'text-white' : ''}`}
                onClick={() => selectFeedChannel(channel)}
              >
                {channel}
                {filters.channel === channel ? <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-white" /> : null}
              </button>
            ))}
          </nav>

          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <button
              className={`relative grid h-9 w-9 place-items-center rounded-full transition ${
                filters.query ? 'bg-white text-black' : 'bg-black/26 text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] ring-1 ring-white/14 backdrop-blur-md'
              }`}
              onClick={openSearch}
              aria-label="搜索"
            >
              <Search size={18} />
              {filters.query ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-black" /> : null}
            </button>
            <button
              className={`relative grid h-9 w-9 place-items-center rounded-full transition ${
                activeFilterCount ? 'bg-white text-black' : 'bg-black/26 text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] ring-1 ring-white/14 backdrop-blur-md'
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
          <div className="pointer-events-auto mt-3 flex items-center justify-between gap-2 border border-white/14 bg-black/42 px-3 py-2 text-xs font-bold text-white/82 shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
            <button className="min-w-0 flex-1 truncate text-left" onClick={openSearch}>
              搜索：{filters.query}
            </button>
            <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-white/70" onClick={clearSearch} aria-label="清除搜索">
              <X size={14} />
            </button>
          </div>
        ) : null}

        {locationMessage ? <p className="pointer-events-auto mt-2 bg-black/36 px-2 py-1 text-xs font-semibold text-white/70 backdrop-blur-md">{locationMessage}</p> : null}

      </header>

      <div
        ref={feedSwipeRef}
        className="overflow-hidden touch-pan-y"
        onPointerDown={handleFeedPointerDown}
        onPointerMove={handleFeedPointerMove}
        onPointerUp={finishFeedDrag}
        onPointerCancel={finishFeedDrag}
        onClickCapture={(event) => {
          if (!blockFeedClick) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          className={`flex ${feedDrag.active ? '' : 'transition-transform duration-300 ease-out'}`}
          style={{ transform: `translateX(calc(${-activeChannelIndex * 100}% + ${feedDrag.deltaX}px))` }}
        >
          {channels.map((channel) => (
            <div key={channel} className="w-full shrink-0">
              <PhotoFeed posts={visibleChannelPostGroups[channel]} />
            </div>
          ))}
        </div>
      </div>
      <div ref={feedLoadRef} className="grid h-16 place-items-center bg-[#050505] text-[10px] font-semibold uppercase tracking-[0.18em] text-white/24">
        {feedLoading ? 'Loading' : null}
      </div>

      {searchOpen ? (
        <SearchOverlay
          value={searchDraft}
          history={searchHistory}
          suggestions={searchSuggestions}
          posts={channelPostGroups[filters.channel]}
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

      {cityOpen ? (
        <LocationDrawer
          filters={filters}
          onChange={(partial) => {
            setMatchedPostIds(null);
            setFilters((current) => ({ ...current, ...partial }));
          }}
          onUseCurrentLocation={requestConsumerLocation}
          onClose={() => setCityOpen(false)}
        />
      ) : null}
      {filterOpen ? (
        <FilterSheet
          filters={filters}
          onChange={(partial) => setFilters((current) => ({ ...current, ...partial }))}
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
  posts,
  onChange,
  onSubmit,
  onClose,
  onPick,
  onClearHistory,
}: {
  value: string;
  history: string[];
  suggestions: string[];
  posts: FeedPost[];
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClose: () => void;
  onPick: (value: string) => void;
  onClearHistory: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const previewPosts = useMemo(() => getSearchPreviewPosts(posts, value), [posts, value]);
  const suggestionTiles = useMemo(() => getSearchSuggestionTiles(suggestions, posts), [posts, suggestions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-y-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 overflow-y-auto bg-[#17171c] text-white">
      <div className="min-h-dvh w-full px-4 pb-8 pt-5">
        <div className="flex items-start gap-3">
          <button
            className="grid h-12 w-8 shrink-0 place-items-center text-white/86"
            onClick={onClose}
            aria-label="返回"
          >
            <ChevronLeft size={28} strokeWidth={1.8} />
          </button>

          <div className="relative min-w-0 flex-1">
            <div className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-white ring-1 ring-white/10">
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
              {history.length ? (
                <button
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/8 text-white/58 transition hover:bg-white/12"
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-label={historyOpen ? '收起历史记录' : '展开历史记录'}
                  type="button"
                >
                  <ChevronDown className={`transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`} size={16} />
                </button>
              ) : null}
              <button className="border-l border-white/10 pl-3 text-sm font-black text-white" onClick={() => onSubmit(value)}>
                搜索
              </button>
            </div>

            {historyOpen && history.length ? (
              <div className="absolute inset-x-0 top-[56px] z-20 rounded-[18px] border border-white/8 bg-[#24242a]/96 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-black text-white/54">历史记录</span>
                  <button
                    className="text-[11px] font-bold text-white/34"
                    onClick={() => {
                      onClearHistory();
                      setHistoryOpen(false);
                    }}
                  >
                    清空
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                  {history.map((item) => (
                    <button
                      key={item}
                      className="h-8 shrink-0 rounded-full bg-white/[0.07] px-3 text-xs font-semibold text-white/78"
                      onClick={() => {
                        onPick(item);
                        setHistoryOpen(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-black text-white/86">猜你想搜</h2>
            <span className="text-xs font-bold text-white/26">按风格找作品</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {suggestionTiles.map(({ label, post }) => (
              <button key={label} className="relative h-20 w-36 shrink-0 overflow-hidden rounded-[3px] bg-white/[0.06] text-left" onClick={() => onPick(label)}>
                {post ? <LivePhotoMedia className="absolute inset-0" media={post.images[0]} alt={label} playLive={false} mediaClassName="opacity-75" /> : null}
                <span className="absolute inset-0 bg-gradient-to-t from-black/76 via-black/24 to-black/8" />
                <span className="absolute bottom-2 left-2 right-2 truncate text-sm font-black text-white/78">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 grid grid-cols-3 gap-px">
          {previewPosts.map((post, index) => (
            <Link key={post.id} to={`/consumer/post/${post.id}`} className="group relative aspect-square overflow-hidden bg-white/[0.04]" aria-label={`查看${getPostTitle(post)}`}>
              <LivePhotoMedia media={post.images[0]} alt={getPostTitle(post)} loading={index < 9 ? 'eager' : 'lazy'} playLive={false} mediaClassName="transition duration-300 group-active:scale-[0.98]" />
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}

function getSearchPreviewPosts(posts: FeedPost[], value: string) {
  const keyword = value.trim().toLowerCase();
  const source = posts.length ? posts : listFeedPosts();
  if (!keyword) return source.slice(0, 45);

  const matched = source.filter((post) => getPostSearchText(post).includes(keyword));
  return (matched.length ? matched : source).slice(0, 45);
}

function getSearchSuggestionTiles(suggestions: string[], posts: FeedPost[]) {
  const source = posts.length ? posts : listFeedPosts();
  return suggestions.map((label, index) => {
    const keyword = label.toLowerCase();
    const post = source.find((item) => getPostSearchText(item).includes(keyword)) ?? source[index % Math.max(source.length, 1)];
    return { label, post };
  });
}

function loadInitialFeedPage(): FeedPostPage {
  return readFeedCache() ?? listFeedPostPage({ limit: feedPageSize });
}

function readFeedCache(): FeedPostPage | null {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(feedCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedPostPage & { savedAt?: number };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > feedCacheTtlMs) return null;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      nextCursor: parsed.nextCursor ?? null,
      hasMore: Boolean(parsed.hasMore),
    };
  } catch {
    return null;
  }
}

function saveFeedCache(page: FeedPostPage) {
  if (typeof sessionStorage === 'undefined') return;

  try {
    sessionStorage.setItem(
      feedCacheKey,
      JSON.stringify({
        ...page,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage pressure in local preview and mini program webviews.
  }
}

function mergeUniqueFeedPosts(current: FeedPost[], incoming: FeedPost[]) {
  const seen = new Set(current.map((post) => post.id));
  const merged = [...current];
  incoming.forEach((post) => {
    if (seen.has(post.id)) return;
    seen.add(post.id);
    merged.push(post);
  });
  return merged;
}

function LocationDrawer({
  filters,
  onChange,
  onUseCurrentLocation,
  onClose,
}: {
  filters: FeedFilters;
  onChange: (partial: Partial<FeedFilters>) => void;
  onUseCurrentLocation: () => void;
  onClose: () => void;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const cityOptions = Object.keys(locationOptions);
  const districtOptions = getDistrictOptions(filters.city);
  const pointOptions = getMapPointOptions(filters.city, filters.district);
  const selectedPointLabel = filters.locationPointName || '当前位置';
  const distanceLabel = filters.maxDistanceKm ? `${filters.maxDistanceKm}km内` : '距离不限';

  return (
    <div className="fixed inset-y-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 justify-start bg-black/70" onClick={onClose}>
      <section className="h-full w-[86%] max-w-sm overflow-y-auto bg-white p-4 pb-6 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <SheetHeader title="选择位置" onClose={onClose} />
        <div className="mt-4 rounded-[8px] bg-zinc-50 p-3 text-sm font-black text-zinc-900">
          <p>{getLocationLabel(filters)}</p>
          <p className="mt-1 text-xs font-semibold text-zinc-400">{selectedPointLabel} · {distanceLabel}</p>
        </div>

        <LocationOptionColumn
          label="城市"
          options={cityOptions}
          value={filters.city}
          onSelect={(city) => onChange({ city, district: '不限', area: '不限', locationPointName: '当前位置', locationLat: null, locationLng: null, nearbyOnly: false, channel: channels[1] })}
        />
        <LocationOptionColumn
          label="区"
          options={districtOptions}
          value={filters.district}
          onSelect={(district) => onChange({ district, area: '不限', locationPointName: '当前位置', locationLat: null, locationLng: null, nearbyOnly: false, channel: channels[1] })}
        />

        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-zinc-500">定位点</p>
          <div className="rounded-[10px] border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">
                <MapPin size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-zinc-950">{selectedPointLabel}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-zinc-400">
                  {filters.locationLat !== null && filters.locationLng !== null ? `${filters.locationLat.toFixed(4)}, ${filters.locationLng.toFixed(4)}` : '未手动选点时使用当前定位'}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="h-10 rounded-full bg-zinc-100 text-xs font-black text-zinc-700" onClick={onUseCurrentLocation} type="button">
                使用当前位置
              </button>
              <button className="h-10 rounded-full bg-black text-xs font-black text-white" onClick={() => setMapOpen(true)} type="button">
                打开地图选点
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <DistanceSlider value={filters.maxDistanceKm} onChange={(maxDistanceKm) => onChange({ maxDistanceKm })} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="h-12 rounded-full bg-zinc-100 text-sm font-bold text-zinc-700"
            onClick={() => onChange({ city: '不限', district: '不限', area: '不限', locationPointName: '当前位置', locationLat: null, locationLng: null, maxDistanceKm: null, nearbyOnly: false, channel: channels[1] })}
          >
            不限
          </button>
          <button className="h-12 rounded-full bg-black text-sm font-bold text-white" onClick={onClose}>
            完成
          </button>
        </div>
      </section>
      {mapOpen ? (
        <MapPointPicker
          points={pointOptions}
          selectedName={selectedPointLabel}
          onSelect={(point) => {
            onChange({
              area: '不限',
              locationPointName: point.name,
              locationLat: point.lat,
              locationLng: point.lng,
              nearbyOnly: false,
              channel: channels[1],
            });
            setMapOpen(false);
          }}
          onClose={() => setMapOpen(false)}
        />
      ) : null}
    </div>
  );
}

function LocationOptionColumn({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: string[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold text-zinc-500">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={`h-11 rounded-full text-sm font-black ${option === value ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'}`}
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function DistanceSlider({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const sliderValue = value ?? 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-zinc-500">可接受最大距离</p>
        <p className="text-xs font-black text-zinc-900">{sliderValue ? `${sliderValue}km内` : '距离不限'}</p>
      </div>
      <div className="rounded-[12px] bg-zinc-50 px-3 py-3 ring-1 ring-zinc-100">
        <input className="w-full" type="range" min={0} max={maxDistanceLimitKm} step={1} value={sliderValue} onChange={(event) => onChange(Number(event.target.value) || null)} />
        <div className="mt-1 flex justify-between text-[10px] font-bold text-zinc-400">
          <span>不限</span>
          <span>10km</span>
          <span>30km</span>
          <span>50km</span>
        </div>
      </div>
    </div>
  );
}

function MapPointPicker({
  points,
  selectedName,
  onSelect,
  onClose,
}: {
  points: DemoMapPoint[];
  selectedName: string;
  onSelect: (point: DemoMapPoint) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/55 px-3 pb-3" onClick={onClose}>
      <section className="w-full rounded-[14px] bg-zinc-950 p-3 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black">地图选点</h3>
            <p className="mt-0.5 text-xs font-semibold text-white/42">选择拍摄起点</p>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/72" onClick={onClose} aria-label="关闭地图">
            <X size={16} />
          </button>
        </div>

        <div className="relative mt-3 h-48 overflow-hidden rounded-[10px] bg-[#111] ring-1 ring-white/10">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
          {points.map((point) => {
            const active = point.name === selectedName;
            return (
              <button
                key={point.name}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[10px] font-black shadow-lg transition ${
                  active ? 'bg-white text-black' : 'bg-black/72 text-white ring-1 ring-white/20'
                }`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onClick={() => onSelect(point)}
                type="button"
              >
                {point.name.replace('定位点', '')}
              </button>
            );
          })}
        </div>

        <div className="mt-3 max-h-32 space-y-1 overflow-y-auto">
          {points.map((point) => (
            <button
              key={`${point.name}-list`}
              className={`flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-left ${
                point.name === selectedName ? 'bg-white text-black' : 'bg-white/[0.06] text-white'
              }`}
              onClick={() => onSelect(point)}
              type="button"
            >
              <MapPin size={14} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black">{point.name}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-55">{point.address}</span>
              </span>
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
    <div className="fixed inset-y-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 justify-end bg-black/70" onClick={onClose}>
      <section className="h-full w-[84%] max-w-sm overflow-y-auto bg-white p-4 pb-6 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <SheetHeader title="筛选" onClose={onClose} />
        <div className="mt-4 space-y-4">
          <FilterGroup label="活动类型" options={sceneOptions} value={filters.scene} onChange={(scene) => onChange({ scene })} />
          <RangeSliderGroup
            label="时长范围"
            min={minDurationLimit}
            max={maxDurationLimit}
            step={durationStepMinutes}
            minValue={filters.minDurationMinutes}
            maxValue={filters.maxDurationMinutes}
            formatValue={formatDurationLabel}
            onChange={(minDurationMinutes, maxDurationMinutes) => onChange({ minDurationMinutes, maxDurationMinutes })}
          />
          <RangeSliderGroup
            label="预算范围"
            min={0}
            max={maxBudgetLimitCents}
            step={budgetStepCents}
            minValue={filters.minBudgetCents}
            maxValue={filters.maxBudgetCents ?? maxBudgetLimitCents}
            formatValue={formatBudgetLabel}
            onChange={(minBudgetCents, maxBudgetCents) =>
              onChange({
                minBudgetCents,
                maxBudgetCents: maxBudgetCents >= maxBudgetLimitCents ? null : maxBudgetCents,
              })
            }
          />
          <OptionGroup
            label="创作者性别"
            options={genderOptions}
            value={filters.creatorGenderPreference}
            onChange={(creatorGenderPreference) => onChange({ creatorGenderPreference })}
          />
          <OptionGroup
            label="摄影师性别"
            options={genderOptions}
            value={filters.photographerGenderPreference}
            onChange={(photographerGenderPreference) => onChange({ photographerGenderPreference })}
          />
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

function RangeSliderGroup({
  label,
  min,
  max,
  step,
  minValue,
  maxValue,
  formatValue,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  minValue: number;
  maxValue: number;
  formatValue: (value: number) => string;
  onChange: (minValue: number, maxValue: number) => void;
}) {
  const safeMinValue = clampNumber(minValue, min, max - step);
  const safeMaxValue = clampNumber(maxValue, min + step, max);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-zinc-500">{label}</p>
        <p className="text-xs font-black text-zinc-900">
          {formatValue(safeMinValue)} - {formatValue(safeMaxValue)}
        </p>
      </div>
      <div className="rounded-[12px] bg-zinc-50 px-3 py-3 ring-1 ring-zinc-100">
        <label className="grid grid-cols-[36px_1fr_52px] items-center gap-2 text-xs font-bold text-zinc-400">
          下限
          <input
            type="range"
            min={min}
            max={max - step}
            step={step}
            value={safeMinValue}
            onChange={(event) => {
              const nextMin = Number(event.target.value);
              onChange(nextMin, Math.max(safeMaxValue, nextMin + step));
            }}
          />
          <span className="text-right text-zinc-700">{formatValue(safeMinValue)}</span>
        </label>
        <label className="mt-2 grid grid-cols-[36px_1fr_52px] items-center gap-2 text-xs font-bold text-zinc-400">
          上限
          <input
            type="range"
            min={min + step}
            max={max}
            step={step}
            value={safeMaxValue}
            onChange={(event) => {
              const nextMax = Number(event.target.value);
              onChange(Math.min(safeMinValue, nextMax - step), nextMax);
            }}
          />
          <span className="text-right text-zinc-700">{formatValue(safeMaxValue)}</span>
        </label>
      </div>
    </div>
  );
}

function createChannelPostGroups(
  posts: FeedPost[],
  matchedPostIds: string[] | null,
  filters: Pick<FeedFilters, 'city' | 'district' | 'area' | 'locationPointName' | 'maxDistanceKm'>,
  locationKeywords: string[],
): Record<FeedChannel, FeedPost[]> {
  const matchedSortedPosts = sortPostsByMatchedIds(posts, matchedPostIds);

  return {
    关注: rankPosts(posts, (post, index) => getFollowScore(post, index)),
    发现: rankPosts(posts, (post, index) => getDiscoveryScore(post, index)),
    附近: rankPosts(matchedSortedPosts, (post, index) => getNearbyScore(post, index, filters, locationKeywords, matchedPostIds)),
  };
}

function rankPosts(posts: FeedPost[], getScore: (post: FeedPost, index: number) => number) {
  return posts
    .map((post, index) => ({ post, index, score: getScore(post, index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.post);
}

function getFollowScore(post: FeedPost, index: number) {
  const text = getPostSearchText(post);
  const affinityScore = ['citywalk', '探店', '街拍', '黑白', '大片', '旅行'].some((keyword) => text.includes(keyword.toLowerCase())) ? 42 : 0;
  const simulatedFollowScore = Math.abs(hashString(post.companion.id)) % 4 === 0 ? 120 : 0;
  const creatorMomentum = post.companion.ratingAvg * 18 + post.companion.ratingCount * 1.8;
  return simulatedFollowScore + affinityScore + creatorMomentum - index * 0.25;
}

function getDiscoveryScore(post: FeedPost, index: number) {
  const coverRatio = getCoverRatio(post);
  const visualScore = coverRatio >= 1.16 ? 18 : coverRatio <= 0.78 ? 24 : 14;
  const engagementScore = post.companion.ratingAvg * 24 + post.companion.ratingCount * 2;
  const freshnessScore = 80 - (index % 10) * 4;
  const diversityScore = Math.abs(hashString(`${post.id}-${post.activity}`)) % 36;
  return visualScore + engagementScore + freshnessScore + diversityScore;
}

function getNearbyScore(
  post: FeedPost,
  index: number,
  filters: Pick<FeedFilters, 'city' | 'district' | 'area' | 'locationPointName' | 'maxDistanceKm'>,
  locationKeywords: string[],
  matchedPostIds: string[] | null,
) {
  const text = getPostSearchText(post);
  const matchedRank = matchedPostIds?.indexOf(post.companion.id) ?? -1;
  const matchedScore = matchedRank >= 0 ? 520 - matchedRank * 24 : 0;
  const selectedAreaScore = locationKeywords.some((keyword) => keyword !== '不限' && text.includes(keyword.toLowerCase())) ? 210 : 0;
  const cityScore = filters.city !== '不限' && text.includes(filters.city.toLowerCase()) ? 54 : 0;
  const nearbyDemoScore = ['外滩', '武康路', '安福路', '静安寺', '新天地', '徐汇', '黄浦'].some((keyword) => text.includes(keyword.toLowerCase())) ? 70 : 0;
  const availabilityScore = post.companion.slots.some((slot) => slot.status === 'available') ? 36 : 0;
  const distancePreferenceScore = filters.maxDistanceKm ? Math.max(0, 80 - filters.maxDistanceKm * 4) : 0;
  return matchedScore + selectedAreaScore + cityScore + nearbyDemoScore + availabilityScore + distancePreferenceScore - index * 0.2;
}

function getPostSearchText(post: FeedPost) {
  return [
    post.title,
    post.location,
    post.locationName,
    post.activity,
    post.caption,
    post.city,
    post.companion.name,
    post.companion.baseCity,
    ...post.styleTags,
    ...post.companion.tags,
    ...post.companion.areas,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getCoverRatio(post: FeedPost) {
  const cover = post.images[0];
  return cover?.width && cover.height ? cover.width / cover.height : 3 / 4;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDurationLabel(value: number) {
  if (value < 60) return `${value}分钟`;
  return value % 60 === 0 ? `${value / 60}小时` : `${Math.floor(value / 60)}.5小时`;
}

function formatBudgetLabel(value: number) {
  if (value >= maxBudgetLimitCents) return '不限';
  if (value <= 0) return '¥0';
  return `¥${Math.round(value / 100)}`;
}

function matchesCreatorGender(post: FeedPost, preference: GenderPreference) {
  if (preference === 'any') return true;
  const creatorGender = getCreatorGender(post);
  return creatorGender === preference;
}

function getCreatorGender(post: FeedPost): GenderPreference | 'unknown' {
  const explicitGender = (post.creator as { gender?: string } | undefined)?.gender;
  if (explicitGender === 'male' || explicitGender === 'female') return explicitGender;
  const seed = `${post.creator?.id ?? post.id}-${post.creator?.name ?? ''}`;
  return Math.abs(hashString(seed)) % 3 === 0 ? 'male' : 'female';
}

function getActiveFilterCount(filters: FeedFilters) {
  return [
    filters.scene !== initialFilters.scene,
    filters.minDurationMinutes !== initialFilters.minDurationMinutes || filters.maxDurationMinutes !== initialFilters.maxDurationMinutes,
    filters.minBudgetCents !== initialFilters.minBudgetCents,
    filters.maxBudgetCents !== initialFilters.maxBudgetCents,
    filters.creatorGenderPreference !== initialFilters.creatorGenderPreference,
    filters.photographerGenderPreference !== initialFilters.photographerGenderPreference,
  ].filter(Boolean).length;
}

function hasActiveLocationFilter(filters: FeedFilters) {
  return [
    filters.nearbyOnly,
    filters.city !== initialFilters.city,
    filters.district !== initialFilters.district,
    filters.area !== initialFilters.area,
    filters.locationPointName !== initialFilters.locationPointName,
    filters.locationLat !== initialFilters.locationLat,
    filters.locationLng !== initialFilters.locationLng,
    filters.maxDistanceKm !== initialFilters.maxDistanceKm,
  ].some(Boolean);
}

function getDistrictOptions(city: string) {
  return Object.keys(locationOptions[city] ?? locationOptions['不限']);
}

function getAreaOptions(city: string, district: string) {
  return locationOptions[city]?.[district] ?? locationOptions[city]?.['不限'] ?? ['不限'];
}

function getLocationLabel(filters: Pick<FeedFilters, 'city' | 'district' | 'locationPointName' | 'nearbyOnly'>) {
  if (filters.nearbyOnly && filters.locationPointName === '当前位置') return '当前位置';
  if (filters.district !== '不限') return filters.district;
  return filters.city;
}

function getLocationKeyword(filters: Pick<FeedFilters, 'district' | 'area' | 'locationPointName'>) {
  if (filters.locationPointName && filters.locationPointName !== '当前位置') return cleanLocationPointName(filters.locationPointName);
  if (filters.area !== '不限') return filters.area;
  if (filters.district !== '不限') return filters.district;
  return '';
}

function getLocationKeywords(filters: Pick<FeedFilters, 'city' | 'district' | 'area' | 'locationPointName'>) {
  if (filters.locationPointName && filters.locationPointName !== '当前位置') return [cleanLocationPointName(filters.locationPointName), filters.district].filter((item) => item && item !== '不限');
  if (filters.area !== '不限') return [filters.area];
  if (filters.district === '不限') return [];

  return [filters.district, ...getAreaOptions(filters.city, filters.district).filter((area) => area !== '不限')];
}

function getActiveLocation(filters: Pick<FeedFilters, 'locationLat' | 'locationLng'>, consumerLocation: ConsumerLocation | null) {
  if (filters.locationLat !== null && filters.locationLng !== null) {
    return { lat: filters.locationLat, lng: filters.locationLng };
  }

  return consumerLocation;
}

function getMapPointOptions(city: string, district: string) {
  const cityMatched = demoMapPoints.filter((point) => city === '不限' || point.city === city);
  const districtMatched = cityMatched.filter((point) => district === '不限' || point.district === district);
  return districtMatched.length ? districtMatched : cityMatched.length ? cityMatched : demoMapPoints;
}

function cleanLocationPointName(name: string) {
  return name.replace('定位点', '');
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
