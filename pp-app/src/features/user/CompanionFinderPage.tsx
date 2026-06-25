import { ChevronDown, MapPin, MessageCircle, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import { applyBookingSettingsToCompanion, defaultBookingSettings } from '../../data/bookingSettings';
import { readCompanionBookingSettings } from '../../services/companionBookingSettingsService';
import { applyCompanionProfile, readCompanionProfile } from '../../services/companionProfileService';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';

type FilterKey = 'area' | 'date' | 'time' | 'personality' | 'style' | 'interaction' | 'equipment' | 'budget';
type CategoricalFilterKey = Exclude<FilterKey, 'budget'>;
type FinderFilters = Record<CategoricalFilterKey, string> & {
  budgetMin: number;
  budgetMax: number;
};
type PublicCompanion = FeedPost['companion'] &
  Partial<{
    profilePersonalityTags: string[];
    profileStyleTags: string[];
    profileInteractionTags: string[];
    profileEquipment: string[];
  }>;
type PhotographerResult = {
  companion: PublicCompanion;
  posts: FeedPost[];
  post: FeedPost;
};
type ShellContext = {
  homeChromeCompact?: boolean;
};

const AREA_ANY = '地点不限';
const DATE_ANY = '日期不限';
const TIME_ANY = '时间不限';
const NOW_AVAILABLE = '现在可拍';
const PERSONALITY_ANY = '性格不限';
const STYLE_ANY = '风格不限';
const INTERACTION_ANY = '互动不限';
const EQUIPMENT_ANY = '设备不限';
const BUDGET_MIN = 0;
const BUDGET_MAX = 2000;
const BUDGET_UNLIMITED = BUDGET_MAX;
const BUDGET_STEP = 50;

const staticFilterOptions: Record<Exclude<CategoricalFilterKey, 'date'>, string[]> = {
  area: [AREA_ANY, '武康路', '安福路', '外滩', '静安寺', '徐汇滨江', '新天地'],
  time: [TIME_ANY, NOW_AVAILABLE, '早上', '中午', '下午', '晚上'],
  personality: [PERSONALITY_ANY, '轻松聊天', '温柔耐心', '不尴尬', '情绪稳定', '高效直接'],
  style: [STYLE_ANY, 'Citywalk', '探店', '街拍', '夜景', '旅行跟拍', '胶片感', '人像快拍'],
  interaction: [INTERACTION_ANY, '会指导动作', '会找角度', '会规划路线', '安静记录', '会带动情绪'],
  equipment: [EQUIPMENT_ANY, '全画幅', '半画幅', '手机', 'CCD'],
};

const filterLabels: Record<FilterKey, string> = {
  area: '地点',
  date: '日期',
  time: '时间',
  personality: '性格标签',
  style: '擅长风格',
  interaction: '互动方式',
  equipment: '摄影设备',
  budget: '预算范围',
};

const filterGroupOrder: FilterKey[] = ['area', 'date', 'time', 'personality', 'style', 'interaction', 'equipment', 'budget'];

const initialFinderFilters: FinderFilters = {
  area: AREA_ANY,
  date: DATE_ANY,
  time: TIME_ANY,
  personality: PERSONALITY_ANY,
  style: STYLE_ANY,
  interaction: INTERACTION_ANY,
  equipment: EQUIPMENT_ANY,
  budgetMin: BUDGET_MIN,
  budgetMax: BUDGET_UNLIMITED,
};

export function CompanionFinderPage() {
  const { homeChromeCompact = false } = useOutletContext<ShellContext>();
  const [params] = useSearchParams();
  const sameStylePostId = params.get('sameStyle');
  const posts = listFeedPosts();
  const sameStylePost = posts.find((post) => post.id === sameStylePostId);
  const [query, setQuery] = useState(() => params.get('query') ?? '');
  const [filterOpen, setFilterOpen] = useState<FilterKey | 'all' | null>(null);
  const [filters, setFilters] = useState<FinderFilters>(() => createInitialFinderFilters(params, sameStylePost));
  const activeFilterCount = getActiveFilterCount(filters);
  const topChromeHidden = homeChromeCompact && !filterOpen;

  const companions = useMemo(() => {
    const keyword = normalizeText(query);
    const grouped = new Map<string, PhotographerResult>();

    posts.forEach((post) => {
      const companion = buildPublicCompanion(post.companion);
      const current = grouped.get(companion.id);
      if (current) {
        current.posts.push(post);
        return;
      }
      grouped.set(companion.id, { companion, posts: [post], post });
    });

    return Array.from(grouped.values()).filter(({ companion, posts: portfolioPosts }) => {
      const searchable = buildSearchableText(companion, portfolioPosts);
      const matchesKeyword = !keyword || searchable.includes(keyword);
      return matchesKeyword && matchesFinderFilters(filters, companion, portfolioPosts, searchable);
    });
  }, [filters, posts, query]);

  return (
    <div className={`min-h-dvh bg-[#050505] pb-24 text-white transition-[padding] duration-300 ${topChromeHidden ? 'pt-2' : 'pt-[62px]'}`}>
      <header
        className={`fixed inset-x-0 top-0 z-20 mx-auto w-full max-w-md border-b border-white/10 bg-black/92 px-3 py-2.5 backdrop-blur-xl transition-all duration-300 ${
          topChromeHidden ? 'pointer-events-none -translate-y-full opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 text-sm font-semibold text-black ring-1 ring-white/20">
            <Search size={16} className="shrink-0 text-zinc-500" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-500"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索地点、风格、摄影师"
              aria-label="搜索地点、风格或摄影师"
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
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-[2px]">
              <LivePhotoMedia media={sameStylePost.images[0]} alt={sameStylePost.location} playLive={false} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-zinc-500">按这组作品找同款摄影师</p>
              <p className="mt-1 line-clamp-2 text-sm font-bold leading-5">{sameStylePost.locationName || sameStylePost.location}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="columns-2 gap-2 px-2 pt-2">
        {companions.map((result, index) => (
          <PhotographerResultCard key={result.companion.id} result={result} index={index} />
        ))}
      </section>

      {companions.length ? null : (
        <section className="px-5 py-16 text-center">
          <p className="text-lg font-black text-white">没有匹配的摄影师</p>
          <p className="mt-2 text-sm font-semibold text-white/45">可以放宽预算、日期或标签条件再试一次。</p>
        </section>
      )}

      {filterOpen ? (
        <CompanionFilterSheet
          filters={filters}
          mode={filterOpen}
          onSelect={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onBudgetChange={(patch) => setFilters((current) => normalizeBudgetRange({ ...current, ...patch }))}
          onReset={() => setFilters(initialFinderFilters)}
          onClose={() => setFilterOpen(null)}
        />
      ) : null}
    </div>
  );
}

function PhotographerResultCard({ result, index }: { result: PhotographerResult; index: number }) {
  const { companion, posts: portfolioPosts, post } = result;
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeWork, setActiveWork] = useState(0);
  const activity = companion.activities[0];
  const slot = companion.slots.find(isCurrentAvailableSlot) || companion.slots.find((item) => item.status === 'available') || companion.slots[0];
  const aspectClass = getPortfolioAspectClass(index, portfolioPosts[0]);

  const handlePortfolioScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActiveWork(Math.min(Math.round(track.scrollLeft / track.clientWidth), portfolioPosts.length - 1));
  };

  const scrollToWork = (workIndex: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * workIndex, behavior: 'smooth' });
    setActiveWork(workIndex);
  };

  return (
    <article className="mb-2 inline-block w-full break-inside-avoid overflow-hidden rounded-[2px] bg-[#151515] ring-1 ring-white/8">
      <div ref={trackRef} className={`flex ${aspectClass} snap-x snap-mandatory overflow-x-auto scroll-smooth bg-zinc-950 scrollbar-none`} onScroll={handlePortfolioScroll}>
        {portfolioPosts.map((work, workIndex) => (
          <Link
            key={work.id}
            to={`/consumer/post/${work.id}`}
            className="relative h-full w-full shrink-0 snap-center"
            aria-label={`查看${companion.name}作品 ${getPostTitle(work)}`}
          >
            <LivePhotoMedia
              media={work.images[0]}
              alt={getPostTitle(work)}
              loading={index < 2 && workIndex === 0 ? 'eager' : 'lazy'}
              fallbackSrc={companion.photo || companion.avatar}
              playLive={false}
              mediaClassName="saturate-[0.9] contrast-[1.05]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/76 via-black/22 to-transparent px-2 pb-2 pt-10">
              <p className="line-clamp-1 text-[11px] font-black text-white/86">{getPostTitle(work)}</p>
              <p className="mt-0.5 truncate text-[9px] font-semibold text-white/50">{work.locationName || work.location}</p>
            </div>
          </Link>
        ))}
      </div>

      {portfolioPosts.length > 1 ? (
        <div className="flex h-3 items-center justify-center gap-1 bg-[#151515]">
          {portfolioPosts.map((work, workIndex) => (
            <button
              key={work.id}
              className={`h-1 rounded-full transition-all ${workIndex === activeWork ? 'w-3 bg-white/82' : 'w-1 bg-white/26'}`}
              onClick={() => scrollToWork(workIndex)}
              aria-label={`查看第 ${workIndex + 1} 个作品封面`}
            />
          ))}
        </div>
      ) : (
        <div className="h-2 bg-[#151515]" />
      )}

      <div className="space-y-1.5 px-2 pb-2 pt-1">
        <Link to={`/consumer/photographer/${companion.id}`} className="flex min-w-0 items-center gap-1.5" aria-label={`查看${companion.name}主页`}>
          <img className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/18" src={companion.avatar || companion.photo || post.images[0]?.url} alt={companion.name} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-1.5">
              <p className="truncate text-[13px] font-black leading-4 text-white">{companion.name}</p>
              <span className="shrink-0 text-[11px] font-black text-white/74">¥{Math.round((activity?.priceCents || 0) / 100)}起</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold leading-3 text-white/46">
              <Star size={9} className="fill-white/42 text-white/42" />
              推荐 {96 - index * 3} · {companion.ratingAvg.toFixed(1)}
            </p>
          </div>
        </Link>

        <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] font-semibold text-white/52">
          <span className="truncate">{activity?.name || post.activity}</span>
          <span className="shrink-0 truncate">{slot ? formatSlotSummary(slot) : '暂无可约档期'}</span>
        </div>

        <p className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-white/48">
          <MapPin size={10} className="shrink-0" />
          <span className="truncate">{companion.areas.slice(0, 2).join(' / ')}</span>
        </p>

        <div className="grid grid-cols-[1fr_28px] gap-1.5 pt-0.5">
          <Link className="flex h-8 items-center justify-center rounded-[2px] bg-white text-[11px] font-black text-black" to={`/consumer/photographer/${companion.id}`}>
            查看主页
          </Link>
          <Link className="grid h-8 place-items-center rounded-[2px] bg-white/10 text-white" to="/consumer/messages" aria-label="咨询摄影师">
            <MessageCircle size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function CompanionFilterSheet({
  filters,
  mode,
  onSelect,
  onBudgetChange,
  onReset,
  onClose,
}: {
  filters: FinderFilters;
  mode: FilterKey | 'all';
  onSelect: (key: CategoricalFilterKey, value: string) => void;
  onBudgetChange: (patch: Partial<Pick<FinderFilters, 'budgetMin' | 'budgetMax'>>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const groups = mode === 'all' ? filterGroupOrder : [mode];
  const [expandedKey, setExpandedKey] = useState<FilterKey | null>(null);

  return (
    <div className="fixed inset-y-0 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 justify-end bg-black/70" onClick={onClose}>
      <section className="h-full w-[86%] max-w-sm overflow-y-auto bg-white p-4 pb-6 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">筛选</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {groups.map((key) => {
            const open = expandedKey === key;
            return (
              <FilterDrawerGroup
                key={key}
                label={filterLabels[key]}
                summary={getFilterSummary(key, filters)}
                open={open}
                onToggle={() => setExpandedKey((current) => (current === key ? null : key))}
              >
                {key === 'budget' ? (
                  <BudgetRangeEditor filters={filters} onChange={onBudgetChange} />
                ) : (
                  <FilterOptionGroup filterKey={key} value={filters[key]} onSelect={(value) => onSelect(key, value)} />
                )}
              </FilterDrawerGroup>
            );
          })}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
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

function FilterDrawerGroup({
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-zinc-200 bg-white">
      <button className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left" onClick={onToggle} type="button" aria-expanded={open}>
        <span>
          <span className="block text-xs font-black text-zinc-400">{label}</span>
          <span className="mt-1 block text-sm font-black text-zinc-950">{summary}</span>
        </span>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-700 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <ChevronDown size={18} />
        </span>
      </button>
      {open ? <div className="border-t border-zinc-100 px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  );
}

function FilterOptionGroup({ filterKey, value, onSelect }: { filterKey: CategoricalFilterKey; value: string; onSelect: (value: string) => void }) {
  const options = getFilterOptions(filterKey);

  return (
    <div className="max-h-[42dvh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={`min-h-10 rounded-full px-3 text-sm font-black ${
              value === option ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'
            }`}
            onClick={() => onSelect(option)}
            type="button"
          >
            {getFilterOptionLabel(filterKey, option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function BudgetRangeEditor({
  filters,
  onChange,
}: {
  filters: FinderFilters;
  onChange: (patch: Partial<Pick<FinderFilters, 'budgetMin' | 'budgetMax'>>) => void;
}) {
  return (
    <div>
      <div className="space-y-4 rounded-[14px] bg-zinc-50 p-4">
        <RangeRow label="下限" value={filters.budgetMin} onChange={(value) => onChange({ budgetMin: value })} min={BUDGET_MIN} max={filters.budgetMax} />
        <RangeRow label="上限" value={filters.budgetMax} onChange={(value) => onChange({ budgetMax: value })} min={filters.budgetMin} max={BUDGET_MAX} unlimited />
      </div>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  unlimited = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unlimited?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[44px_1fr_58px] items-center gap-3 text-sm font-black text-zinc-500">
      <span>{label}</span>
      <input
        className="h-2 w-full cursor-pointer accent-black"
        type="range"
        min={min}
        max={max}
        step={BUDGET_STEP}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="rounded-full bg-white px-2 py-1 text-center text-xs text-zinc-800 ring-1 ring-zinc-100">{unlimited && value >= BUDGET_MAX ? '不限' : `¥${value}`}</span>
    </label>
  );
}

function buildPublicCompanion(companion: FeedPost['companion']): PublicCompanion {
  const profiled = applyCompanionProfile(companion, readCompanionProfile(companion.id));
  const settings = readCompanionBookingSettings(companion.id) ?? (companion.isVirtual ? { ...defaultBookingSettings, companionId: companion.id } : null);
  return applyBookingSettingsToCompanion(profiled, settings ?? undefined) as PublicCompanion;
}

function matchesFinderFilters(filters: FinderFilters, companion: PublicCompanion, posts: FeedPost[], searchable: string) {
  return (
    matchesTextOption(filters.area, AREA_ANY, searchable) &&
    matchesScheduleFilters(filters, companion) &&
    matchesProfileOption(filters.personality, PERSONALITY_ANY, getProfileTags(companion, 'personality'), searchable) &&
    matchesProfileOption(filters.style, STYLE_ANY, getProfileTags(companion, 'style'), searchable) &&
    matchesProfileOption(filters.interaction, INTERACTION_ANY, getProfileTags(companion, 'interaction'), searchable) &&
    matchesProfileOption(filters.equipment, EQUIPMENT_ANY, getProfileTags(companion, 'equipment'), searchable) &&
    matchesBudgetRange(filters, getLowestPriceCents(companion, posts))
  );
}

function buildSearchableText(companion: PublicCompanion, portfolioPosts: FeedPost[]) {
  return normalizeText(
    [
      ...portfolioPosts.flatMap((post) => [
        post.title,
        getPostTitle(post),
        post.location,
        post.locationName,
        post.activity,
        post.caption,
        post.venueType,
        post.shootTime,
        post.activityCategory,
        ...post.styleTags,
      ]),
      companion.name,
      companion.gender,
      companion.bio,
      ...companion.tags,
      ...companion.areas,
      ...companion.activities.map((activity) => activity.name),
      ...companion.slots.map((slot) => `${slot.label} ${slot.dateLabel} ${slot.timeLabel}`),
      ...getProfileTags(companion, 'personality'),
      ...getProfileTags(companion, 'style'),
      ...getProfileTags(companion, 'interaction'),
      ...getProfileTags(companion, 'equipment'),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function matchesTextOption(option: string, emptyValue: string, searchable: string) {
  return option === emptyValue || searchable.includes(normalizeText(option));
}

function matchesProfileOption(option: string, emptyValue: string, tags: string[], searchable: string) {
  if (option === emptyValue) return true;
  const normalized = normalizeText(option);
  return tags.some((tag) => normalizeText(tag).includes(normalized) || normalized.includes(normalizeText(tag))) || searchable.includes(normalized);
}

function matchesBudgetRange(filters: FinderFilters, priceCents: number) {
  const priceYuan = Math.round(priceCents / 100);
  return priceYuan >= filters.budgetMin && (filters.budgetMax >= BUDGET_MAX || priceYuan <= filters.budgetMax);
}

function matchesScheduleFilters(filters: FinderFilters, companion: PublicCompanion) {
  if (filters.time === NOW_AVAILABLE) return isAvailableNow(companion);
  if (filters.date === DATE_ANY && filters.time === TIME_ANY) return true;

  return companion.slots.some((slot) => {
    if (slot.status !== 'available') return false;
    if (filters.date !== DATE_ANY && getSlotDateValue(slot) !== filters.date) return false;
    if (filters.time !== TIME_ANY && !matchesTimeBucket(slot, filters.time)) return false;
    return true;
  });
}

function isAvailableNow(companion: PublicCompanion) {
  return companion.serviceEnabled !== false && companion.slots.some(isCurrentAvailableSlot);
}

function isCurrentAvailableSlot(slot: FeedPost['companion']['slots'][number]) {
  if (slot.status !== 'available') return false;
  const now = Date.now();
  const start = new Date(slot.startAt).getTime();
  const end = new Date(slot.endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
}

function matchesTimeBucket(slot: FeedPost['companion']['slots'][number], option: string) {
  const ranges: Record<string, [number, number]> = {
    早上: [6 * 60, 12 * 60],
    中午: [11 * 60, 14 * 60],
    下午: [14 * 60, 18 * 60],
    晚上: [18 * 60, 24 * 60],
  };
  const bucket = ranges[option];
  if (!bucket) return true;
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return startMinutes < bucket[1] && endMinutes > bucket[0];
}

function getLowestPriceCents(companion: PublicCompanion, posts: FeedPost[]) {
  const prices = [
    ...companion.activities.map((activity) => activity.priceCents),
    ...posts.map((post) => post.budgetCents ?? 0),
  ].filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

function getProfileTags(companion: PublicCompanion, kind: 'personality' | 'style' | 'interaction' | 'equipment') {
  if (kind === 'personality') return companion.profilePersonalityTags?.length ? companion.profilePersonalityTags : companion.tags.filter((tag) => /沟通|耐心|温柔|轻松|不尴尬|情绪|高效/.test(tag));
  if (kind === 'style') return companion.profileStyleTags?.length ? companion.profileStyleTags : companion.tags.filter((tag) => !/沟通|耐心|温柔|轻松|不尴尬|情绪|指导|路线|角度|设备/.test(tag));
  if (kind === 'interaction') return companion.profileInteractionTags?.length ? companion.profileInteractionTags : companion.tags.filter((tag) => /指导|路线|角度|穿搭|光线|情绪|记录/.test(tag));
  return companion.profileEquipment?.length ? companion.profileEquipment : ['全画幅相机'];
}

function getFilterOptions(key: CategoricalFilterKey) {
  if (key === 'date') return [DATE_ANY, ...buildUpcomingDateValues(14)];
  return staticFilterOptions[key];
}

function getFilterOptionLabel(key: CategoricalFilterKey, value: string) {
  if (key === 'date' && value !== DATE_ANY) return formatDatePill(value);
  return value;
}

function getFilterSummary(key: FilterKey, filters: FinderFilters) {
  if (key === 'budget') return formatBudgetRange(filters.budgetMin, filters.budgetMax);
  return getFilterOptionLabel(key, filters[key]);
}

function createInitialFinderFilters(params: URLSearchParams, sameStylePost?: ReturnType<typeof listFeedPosts>[number]): FinderFilters {
  return normalizeBudgetRange({
    area: matchFilterOption('area', params.get('area') ?? sameStylePost?.locationName ?? sameStylePost?.companion.areas[0]),
    date: matchFilterOption('date', params.get('date')),
    time: matchFilterOption('time', params.get('time')),
    personality: matchFilterOption('personality', params.get('personality')),
    style: matchFilterOption('style', params.get('style') ?? sameStylePost?.activity ?? sameStylePost?.styleTags[0]),
    interaction: matchFilterOption('interaction', params.get('interaction')),
    equipment: matchFilterOption('equipment', params.get('equipment')),
    budgetMin: parseBudgetParam(params.get('budgetMin'), BUDGET_MIN),
    budgetMax: parseBudgetParam(params.get('budgetMax'), BUDGET_MAX),
  });
}

function matchFilterOption(key: CategoricalFilterKey, value?: string | null) {
  if (!value) return initialFinderFilters[key];
  if (key === 'date') {
    const normalizedDate = normalizeDateValue(value);
    return normalizedDate && getFilterOptions('date').includes(normalizedDate) ? normalizedDate : DATE_ANY;
  }

  const normalized = normalizeText(value);
  const options = getFilterOptions(key);
  return (
    options.find((option) => normalizeText(option) === normalized) ??
    options.find((option) => option !== initialFinderFilters[key] && (normalizeText(option).includes(normalized) || normalized.includes(normalizeText(option)))) ??
    initialFinderFilters[key]
  );
}

function normalizeBudgetRange(filters: FinderFilters): FinderFilters {
  const budgetMin = clampToBudget(filters.budgetMin);
  const budgetMax = clampToBudget(filters.budgetMax);
  return {
    ...filters,
    budgetMin: Math.min(budgetMin, budgetMax),
    budgetMax: Math.max(budgetMin, budgetMax),
  };
}

function getActiveFilterCount(filters: FinderFilters) {
  const categoricalCount = (Object.keys(initialFinderFilters) as Array<keyof FinderFilters>).filter((key) => {
    if (key === 'budgetMin' || key === 'budgetMax') return false;
    return filters[key] !== initialFinderFilters[key];
  }).length;
  const budgetChanged = filters.budgetMin !== BUDGET_MIN || filters.budgetMax !== BUDGET_UNLIMITED;
  return categoricalCount + (budgetChanged ? 1 : 0);
}

function getPortfolioAspectClass(index: number, post?: FeedPost) {
  const cover = post?.images[0];
  const ratio = cover?.width && cover.height ? cover.width / cover.height : 0;
  if (ratio >= 1.1) return 'aspect-[1.08]';

  const cycle = ['aspect-[0.74]', 'aspect-[0.88]', 'aspect-[0.8]', 'aspect-[0.96]'];
  return cycle[index % cycle.length];
}

function buildUpcomingDateValues(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return toDateValue(date);
  });
}

function formatDatePill(value: string) {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  const prefix = diffDays === 0 ? '今天' : diffDays === 1 ? '明天' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  return `${prefix} ${date.getMonth() + 1}/${date.getDate()}`;
}

function getSlotDateValue(slot: FeedPost['companion']['slots'][number]) {
  return toDateValue(new Date(slot.startAt));
}

function toDateValue(date: Date) {
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateValue(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return '';
}

function formatSlotSummary(slot: FeedPost['companion']['slots'][number]) {
  if (isCurrentAvailableSlot(slot)) return '现在可拍';
  return `${slot.dateLabel} ${slot.timeLabel || ''}`.trim();
}

function formatBudgetRange(min: number, max: number) {
  return `¥${min} - ${max >= BUDGET_MAX ? '不限' : `¥${max}`}`;
}

function parseBudgetParam(value: string | null, fallback: number) {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  if (normalized === '不限' || normalized === 'unlimited') return BUDGET_UNLIMITED;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampToBudget(parsed) : fallback;
}

function clampToBudget(value: number) {
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(value / BUDGET_STEP) * BUDGET_STEP));
}

function normalizeText(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}
