import { ChevronDown, MapPin, MessageCircle, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import { applyBookingSettingsToCompanion, defaultBookingSettings } from '../../data/bookingSettings';
import { readCompanionBookingSettings } from '../../services/companionBookingSettingsService';
import { applyCompanionProfile, readCompanionProfile } from '../../services/companionProfileService';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { FeedPost } from '../../types/api';

type FilterKey = 'area' | 'date' | 'time' | 'duration' | 'budget' | 'photographerGender' | 'need' | 'style' | 'media' | 'interaction' | 'equipment';
type CategoricalFilterKey = Exclude<FilterKey, 'budget' | 'duration'>;
type FinderFilters = Record<CategoricalFilterKey, string> & {
  budgetMin: number;
  budgetMax: number;
  durationMin: number;
  durationMax: number;
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
const PHOTOGRAPHER_GENDER_ANY = '不限';
const NEED_ANY = '需求不限';
const STYLE_ANY = '风格不限';
const MEDIA_ANY = '形式不限';
const INTERACTION_ANY = '互动不限';
const EQUIPMENT_ANY = '设备不限';
const BUDGET_MIN = 0;
const BUDGET_MAX = 10000; // Slider sentinel: the max value is treated as unlimited.
const BUDGET_STEP = 50;
const DURATION_MIN = 30;
const DURATION_MAX = 24 * 60;
const DURATION_STEP = 30;

const staticFilterOptions: Record<Exclude<CategoricalFilterKey, 'date'>, string[]> = {
  area: [AREA_ANY, '武康路', '安福路', '外滩', '静安寺', '徐汇滨江', '新天地'],
  time: [TIME_ANY, NOW_AVAILABLE, '上午', '下午', '傍晚', '晚上'],
  photographerGender: [PHOTOGRAPHER_GENDER_ANY, '女', '男'],
  need: [NEED_ANY, '日常出片', '旅行拍照', '纪念日', '多人合照'],
  style: [STYLE_ANY, '松弛日常', '清冷高级', '杂志街拍', '回忆胶片', '迷人状态'],
  media: [MEDIA_ANY, '照片', '视频', '照片+视频'],
  interaction: [INTERACTION_ANY, '耐心引导', '积极带动', '安静沉稳', '路线规划', '抓拍记录'],
  equipment: [EQUIPMENT_ANY, '相机', '手机', 'CCD', '胶片'],
};

const filterLabels: Record<FilterKey, string> = {
  area: '地点',
  date: '日期',
  time: '时间',
  duration: '时长',
  budget: '预算范围',
  photographerGender: '摄影师性别',
  need: '拍摄需求',
  style: '风格偏好',
  media: '内容形式',
  interaction: '拍摄互动',
  equipment: '设备偏好',
};

const filterGroupOrder: FilterKey[] = ['area', 'date', 'time', 'duration', 'budget', 'photographerGender', 'need', 'style', 'media', 'interaction', 'equipment'];

const initialFinderFilters: FinderFilters = {
  area: AREA_ANY,
  date: DATE_ANY,
  time: TIME_ANY,
  photographerGender: PHOTOGRAPHER_GENDER_ANY,
  need: NEED_ANY,
  style: STYLE_ANY,
  media: MEDIA_ANY,
  interaction: INTERACTION_ANY,
  equipment: EQUIPMENT_ANY,
  budgetMin: BUDGET_MIN,
  budgetMax: BUDGET_MAX,
  durationMin: DURATION_MIN,
  durationMax: DURATION_MAX,
};

const needKeywordMap: Record<string, string[]> = {
  日常出片: ['日常', '出片', 'citywalk', '逛街', '街拍', '探店', '咖啡', '小红书', '生活照'],
  旅行拍照: ['旅行', '跟拍', '游客', '城市', '景点', '地标', '路线', '旅拍', '外滩'],
  纪念日: ['纪念日', '生日', '毕业', '周年', '情侣', '胶片', '回忆', '节日', '领证'],
  多人合照: ['合照', '多人', '情侣', '朋友', '闺蜜', '家人', '家庭', '亲子', '宠物'],
};

const styleKeywordMap: Record<string, string[]> = {
  松弛日常: ['松弛', '日常', '自然', '自然光', '生活感', '抓拍', '不尴尬', 'citywalk'],
  清冷高级: ['清冷', '高级', '干净', '简洁', '极简', '通勤', '低饱和', '冷调'],
  杂志街拍: ['杂志', '街拍', '时装', '大片', '广告感', '黑白', '都市', '封面'],
  回忆胶片: ['回忆', '胶片', '复古', '暖色', '老街', '情绪片', '颗粒', '纪念'],
  迷人状态: ['迷人', '氛围感', '明亮', '笑容', '少年', '可爱', '纯欲', '性感', '状态'],
};

const interactionKeywordMap: Record<string, string[]> = {
  耐心引导: ['耐心', '温柔', '指导', '引导', '姿势', '动作', '第一次拍照'],
  积极带动: ['积极', '带动', '情绪', '夸', '笑容', '不尴尬', '轻松聊天', '情绪价值'],
  安静沉稳: ['安静', '沉稳', '安静记录', '专注', '构图', '稳定', '观察'],
  路线规划: ['路线', '规划', '机位', '地标', '夜景路线', '户外路线'],
  抓拍记录: ['抓拍', '记录', '自然抓拍', '纪实', '生活感', '自然'],
};

const equipmentKeywordMap: Record<string, string[]> = {
  相机: ['相机', '全画幅', '半画幅', '35mm', '50mm', '微单', '单反'],
  手机: ['手机', 'iphone'],
  CCD: ['ccd', '复古', '颗粒'],
  胶片: ['胶片', '胶片机', 'film'],
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
          <p className="mt-2 text-sm font-semibold text-white/45">可以放宽预算、时间或风格条件再试一次。</p>
        </section>
      )}

      {filterOpen ? (
        <CompanionFilterSheet
          filters={filters}
          mode={filterOpen}
          onSelect={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
          onBudgetChange={(patch) => setFilters((current) => normalizeBudgetRange({ ...current, ...patch }))}
          onDurationChange={(patch) => setFilters((current) => normalizeDurationRange({ ...current, ...patch }))}
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
  onDurationChange,
  onReset,
  onClose,
}: {
  filters: FinderFilters;
  mode: FilterKey | 'all';
  onSelect: (key: CategoricalFilterKey, value: string) => void;
  onBudgetChange: (patch: Partial<Pick<FinderFilters, 'budgetMin' | 'budgetMax'>>) => void;
  onDurationChange: (patch: Partial<Pick<FinderFilters, 'durationMin' | 'durationMax'>>) => void;
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
                ) : key === 'duration' ? (
                  <DurationRangeEditor filters={filters} onChange={onDurationChange} />
                ) : key === 'date' ? (
                  <DateOptionGroup value={filters.date} onSelect={(value) => onSelect('date', value)} />
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

function DateOptionGroup({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const dates = getFilterOptions('date').filter((option) => option !== DATE_ANY);

  return (
    <div className="space-y-3">
      <button
        className={`h-10 w-full rounded-[8px] px-3 text-left text-sm font-black ${
          value === DATE_ANY ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'
        }`}
        onClick={() => onSelect(DATE_ANY)}
        type="button"
      >
        {DATE_ANY}
      </button>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((dateValue) => {
          const meta = getDateOptionMeta(dateValue);
          const selected = value === dateValue;
          return (
            <button
              key={dateValue}
              className={`grid min-w-0 justify-items-center gap-1 rounded-[8px] py-1.5 text-center ${
                selected ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'
              }`}
              onClick={() => onSelect(dateValue)}
              type="button"
            >
              <span className={`text-[10px] font-black ${selected ? 'text-white/70' : 'text-zinc-400'}`}>{meta.short}</span>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${selected ? 'bg-white text-black' : 'bg-zinc-100 text-zinc-900'}`}>{meta.day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterOptionGroup({ filterKey, value, onSelect }: { filterKey: CategoricalFilterKey; value: string; onSelect: (value: string) => void }) {
  const options = getFilterOptions(filterKey);
  const singleColumn = filterKey === 'area' || filterKey === 'need' || filterKey === 'style' || filterKey === 'interaction';
  const compactRow = filterKey === 'photographerGender';

  return (
    <div className="max-h-[42dvh] overflow-y-auto pr-1">
      <div className={`grid gap-2 ${singleColumn ? 'grid-cols-1' : compactRow ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((option) => (
          <button
            key={option}
            className={`${compactRow ? 'min-h-8 rounded-full px-2 text-xs' : 'min-h-10 rounded-[8px] px-3 text-sm'} font-black ${
              value === option ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'
            } ${singleColumn ? 'text-left' : 'text-center'}`}
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

function DurationRangeEditor({
  filters,
  onChange,
}: {
  filters: FinderFilters;
  onChange: (patch: Partial<Pick<FinderFilters, 'durationMin' | 'durationMax'>>) => void;
}) {
  return (
    <div>
      <div className="space-y-4 rounded-[14px] bg-zinc-50 p-4">
        <RangeRow
          label="下限"
          value={filters.durationMin}
          onChange={(value) => onChange({ durationMin: value })}
          min={DURATION_MIN}
          max={filters.durationMax}
          step={DURATION_STEP}
          valueLabel={formatDurationValue}
        />
        <RangeRow
          label="上限"
          value={filters.durationMax}
          onChange={(value) => onChange({ durationMax: value })}
          min={filters.durationMin}
          max={DURATION_MAX}
          step={DURATION_STEP}
          valueLabel={formatDurationValue}
        />
      </div>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = BUDGET_STEP,
  unlimited = false,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unlimited?: boolean;
  valueLabel?: (value: number) => string;
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
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="rounded-full bg-white px-2 py-1 text-center text-xs text-zinc-800 ring-1 ring-zinc-100">
        {valueLabel ? valueLabel(value) : unlimited && value >= BUDGET_MAX ? '不限' : `¥${value}`}
      </span>
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
    matchesDurationFilter(filters, companion) &&
    matchesPhotographerGender(filters.photographerGender, companion) &&
    matchesSemanticOption(filters.need, NEED_ANY, needKeywordMap, searchable) &&
    matchesSemanticOption(filters.style, STYLE_ANY, styleKeywordMap, searchable, getProfileTags(companion, 'style')) &&
    matchesMediaFilter(filters.media, companion, posts, searchable) &&
    matchesSemanticOption(filters.interaction, INTERACTION_ANY, interactionKeywordMap, searchable, getProfileTags(companion, 'interaction')) &&
    matchesSemanticOption(filters.equipment, EQUIPMENT_ANY, equipmentKeywordMap, searchable, getProfileTags(companion, 'equipment')) &&
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
      ...companion.activities.map((activity) => `${activity.name} ${activity.durationLabel} ${activity.durationMinutes}`),
      ...companion.extras.map((extra) => `${extra.name} ${extra.unitLabel}`),
      ...companion.slots.map((slot) => `${slot.label} ${slot.dateLabel} ${slot.timeLabel}`),
      ...getProfileTags(companion, 'style'),
      ...getProfileTags(companion, 'interaction'),
      ...getProfileTags(companion, 'equipment'),
      ...portfolioPosts.flatMap((post) => post.images.map((image) => `${image.mediaKind ?? ''} ${image.contentType ?? ''} ${image.videoUrl ? '视频' : ''}`)),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function matchesTextOption(option: string, emptyValue: string, searchable: string) {
  return option === emptyValue || searchable.includes(normalizeText(option));
}

function matchesSemanticOption(option: string, emptyValue: string, keywordMap: Record<string, string[]>, searchable: string, tags: string[] = []) {
  if (option === emptyValue) return true;
  const normalized = normalizeText(option);
  const candidates = [option, ...(keywordMap[option] ?? []), ...tags];
  return candidates.some((candidate) => {
    const candidateText = normalizeText(candidate);
    return candidateText && (searchable.includes(candidateText) || candidateText.includes(normalized) || normalized.includes(candidateText));
  });
}

function matchesBudgetRange(filters: FinderFilters, priceCents: number) {
  const priceYuan = Math.round(priceCents / 100);
  return priceYuan >= filters.budgetMin && (filters.budgetMax >= BUDGET_MAX || priceYuan <= filters.budgetMax);
}

function matchesScheduleFilters(filters: FinderFilters, companion: PublicCompanion) {
  if (filters.date === DATE_ANY && filters.time === TIME_ANY) return true;
  if (filters.time === NOW_AVAILABLE) return (filters.date === DATE_ANY || filters.date === getTodayDateValue()) && isInstantBookable(companion);

  return companion.slots.some((slot) => {
    if (slot.status !== 'available') return false;
    if (filters.date !== DATE_ANY && getSlotDateValue(slot) !== filters.date) return false;
    if (filters.time === TIME_ANY) return true;
    return matchesTimeFilter(slot, filters.time);
  });
}

function isInstantBookable(companion: PublicCompanion) {
  // 摄影师端的“临时接单”会在 applyBookingSettingsToCompanion 中映射成 serviceEnabled 和可用档期。
  return isCompanionOnline(companion) && companion.serviceEnabled !== false && companion.slots.some(isCurrentAvailableSlot);
}

function isCompanionOnline(companion: PublicCompanion) {
  const presence = companion as PublicCompanion &
    Partial<{
      online: boolean;
      isOnline: boolean;
      presenceStatus: string;
    }>;
  if (presence.online === false || presence.isOnline === false) return false;
  if (presence.presenceStatus && !/online|active|available|在线|空闲/i.test(presence.presenceStatus)) return false;
  return true;
}

function isCurrentAvailableSlot(slot: FeedPost['companion']['slots'][number]) {
  if (slot.status !== 'available') return false;
  const now = Date.now();
  const start = new Date(slot.startAt).getTime();
  const end = new Date(slot.endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
}

function matchesTimeFilter(slot: FeedPost['companion']['slots'][number], option: string) {
  return matchesTimeBucket(slot, option);
}

function matchesTimeBucket(slot: FeedPost['companion']['slots'][number], option: string) {
  const ranges: Record<string, [number, number]> = {
    上午: [6 * 60, 12 * 60],
    下午: [12 * 60, 18 * 60],
    傍晚: [17 * 60, 20 * 60],
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

function matchesDurationFilter(filters: FinderFilters, companion: PublicCompanion) {
  return companion.activities.some((activity) => activity.durationMinutes >= filters.durationMin && activity.durationMinutes <= filters.durationMax);
}

function matchesPhotographerGender(option: string, companion: PublicCompanion) {
  if (option === PHOTOGRAPHER_GENDER_ANY) return true;
  const gender = normalizeText(companion.gender);
  if (option === '女') return /female|woman|girl|女/.test(gender);
  if (option === '男') return /male|man|boy|男/.test(gender);
  return true;
}

function matchesMediaFilter(option: string, companion: PublicCompanion, posts: FeedPost[], searchable: string) {
  if (option === MEDIA_ANY) return true;
  const hasVideo =
    posts.some((post) => post.images.some(isVideoMedia)) ||
    companion.extras.some((extra) => /视频|短片|video|reel|tiktok|抖音/i.test(extra.name)) ||
    /视频|短片|vlog|reel|tiktok|抖音/.test(searchable);
  const hasPhoto =
    posts.some((post) => post.images.some((image) => !isVideoMedia(image))) ||
    companion.activities.some((activity) => /拍照|照片|人像|跟拍|出片/.test(activity.name)) ||
    /照片|拍照|人像|出片|photo/.test(searchable);
  if (option === '照片+视频') return hasPhoto && hasVideo;
  if (option === '视频') return hasVideo;
  return hasPhoto;
}

function isVideoMedia(image: FeedPost['images'][number]) {
  return image.mediaKind === 'video' || Boolean(image.videoUrl) || Boolean(image.contentType?.startsWith('video/'));
}

function getLowestPriceCents(companion: PublicCompanion, posts: FeedPost[]) {
  const prices = [
    ...companion.activities.map((activity) => activity.priceCents),
    ...posts.map((post) => post.budgetCents ?? 0),
  ].filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

function getProfileTags(companion: PublicCompanion, kind: 'style' | 'interaction' | 'equipment') {
  if (kind === 'style') return companion.profileStyleTags?.length ? companion.profileStyleTags : companion.tags.filter((tag) => !/沟通|耐心|温柔|轻松|不尴尬|情绪|指导|路线|角度|设备/.test(tag));
  if (kind === 'interaction') {
    const profileTags = [...(companion.profileInteractionTags ?? []), ...(companion.profilePersonalityTags ?? [])];
    return profileTags.length ? profileTags : companion.tags.filter((tag) => /指导|路线|角度|穿搭|光线|情绪|记录|沟通|耐心|温柔|轻松|不尴尬|高效|安静|积极/.test(tag));
  }
  return companion.profileEquipment?.length ? companion.profileEquipment : companion.tags.filter((tag) => /相机|全画幅|半画幅|手机|ccd|胶片|设备/i.test(tag)).concat('相机');
}

function getFilterOptions(key: CategoricalFilterKey) {
  if (key === 'date') return [DATE_ANY, ...buildUpcomingDateValues(7)];
  return staticFilterOptions[key];
}

function getFilterOptionLabel(key: CategoricalFilterKey, value: string) {
  if (key === 'date' && value !== DATE_ANY) return formatDatePill(value);
  return value;
}

function getFilterSummary(key: FilterKey, filters: FinderFilters) {
  if (key === 'budget') return formatBudgetRange(filters.budgetMin, filters.budgetMax);
  if (key === 'duration') return formatDurationRange(filters.durationMin, filters.durationMax);
  return getFilterOptionLabel(key, filters[key]);
}

function createInitialFinderFilters(params: URLSearchParams, sameStylePost?: ReturnType<typeof listFeedPosts>[number]): FinderFilters {
  return normalizeFinderRanges({
    area: matchFilterOption('area', params.get('area') ?? sameStylePost?.locationName ?? sameStylePost?.companion.areas[0]),
    date: matchFilterOption('date', params.get('date')),
    time: matchFilterOption('time', params.get('time')),
    photographerGender: matchFilterOption('photographerGender', params.get('photographerGender') ?? params.get('gender')),
    need: matchFilterOption('need', params.get('need') ?? sameStylePost?.activityCategory ?? sameStylePost?.activity),
    style: matchFilterOption('style', params.get('style') ?? sameStylePost?.activity ?? sameStylePost?.styleTags[0]),
    media: matchFilterOption('media', params.get('media')),
    interaction: matchFilterOption('interaction', params.get('interaction')),
    equipment: matchFilterOption('equipment', params.get('equipment')),
    budgetMin: parseBudgetParam(params.get('budgetMin'), BUDGET_MIN),
    budgetMax: parseBudgetParam(params.get('budgetMax'), BUDGET_MAX),
    durationMin: parseDurationParam(params.get('durationMin'), DURATION_MIN),
    durationMax: parseDurationParam(params.get('durationMax'), DURATION_MAX),
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

function normalizeDurationRange(filters: FinderFilters): FinderFilters {
  const durationMin = clampToDuration(filters.durationMin);
  const durationMax = clampToDuration(filters.durationMax);
  return {
    ...filters,
    durationMin: Math.min(durationMin, durationMax),
    durationMax: Math.max(durationMin, durationMax),
  };
}

function normalizeFinderRanges(filters: FinderFilters): FinderFilters {
  return normalizeDurationRange(normalizeBudgetRange(filters));
}

function getActiveFilterCount(filters: FinderFilters) {
  const categoricalCount = (Object.keys(initialFinderFilters) as Array<keyof FinderFilters>).filter((key) => {
    if (key === 'budgetMin' || key === 'budgetMax' || key === 'durationMin' || key === 'durationMax') return false;
    return filters[key] !== initialFinderFilters[key];
  }).length;
  const budgetChanged = filters.budgetMin !== BUDGET_MIN || filters.budgetMax !== BUDGET_MAX;
  const durationChanged = filters.durationMin !== DURATION_MIN || filters.durationMax !== DURATION_MAX;
  return categoricalCount + (budgetChanged ? 1 : 0) + (durationChanged ? 1 : 0);
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

function getDateOptionMeta(value: string) {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return { short: '', day: '' };
  return {
    short: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
    day: String(date.getDate()),
  };
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

function getTodayDateValue() {
  return toDateValue(new Date());
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

function formatDurationRange(min: number, max: number) {
  return `${formatDurationValue(min)} - ${formatDurationValue(max)}`;
}

function formatDurationValue(minutes: number) {
  if (minutes >= DURATION_MAX) return '1天';
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  if (minutes > 60) return `${Number((minutes / 60).toFixed(1))}小时`;
  return `${minutes}分钟`;
}

function parseBudgetParam(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampToBudget(parsed) : fallback;
}

function parseDurationParam(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampToDuration(parsed) : fallback;
}

function clampToBudget(value: number) {
  return Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(value / BUDGET_STEP) * BUDGET_STEP));
}

function clampToDuration(value: number) {
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(value / DURATION_STEP) * DURATION_STEP));
}

function normalizeText(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}
