import { CalendarDays, LocateFixed, MapPin, MessageCircle, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listFeedPosts } from '../../services/feedService';

const intentChips = ['现在可拍', '1小时内', 'Citywalk', '探店', '夜景', '预算300内', '女生摄影师', '会指导动作'];

export function CompanionFinderPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState('');
  const sameStylePostId = params.get('sameStyle');
  const posts = listFeedPosts();
  const sameStylePost = posts.find((post) => post.id === sameStylePostId);
  const companions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return Array.from(new Map(posts.map((post) => [post.companion.id, { companion: post.companion, post }])).values()).filter(({ companion, post }) => {
      const searchable = [post.location, post.locationName, post.activity, ...post.styleTags, companion.name, ...companion.tags, ...companion.areas]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesKeyword = !keyword || searchable.includes(keyword);
      const matchesIntent = !selectedIntent || matchesCompanionIntent(selectedIntent, companion.gender, searchable, companion.activities[0]?.priceCents || 0);
      return matchesKeyword && matchesIntent;
    });
  }, [posts, query, selectedIntent]);

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/92 px-4 pb-4 pt-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/42">Instant Booking</p>
            <h1 className="mt-1 text-2xl font-black">{sameStylePost ? '拍同款' : '找陪拍'}</h1>
          </div>
          <button className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-black" aria-label="筛选" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal size={18} />
            {selectedIntent ? <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-black ring-2 ring-white" /> : null}
          </button>
        </div>

        <div className="mt-4 rounded-[10px] bg-white p-3 text-black">
          <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">
            <Search size={16} className="shrink-0" />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入地点、风格、预算或拍摄需求"
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
          selectedIntent={selectedIntent}
          onSelect={(intent) => setSelectedIntent(intent === selectedIntent ? '' : intent)}
          onReset={() => setSelectedIntent('')}
          onClose={() => setFilterOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CompanionFilterSheet({
  selectedIntent,
  onSelect,
  onReset,
  onClose,
}: {
  selectedIntent: string;
  onSelect: (intent: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3" onClick={onClose}>
      <section className="w-full max-w-md rounded-t-[18px] bg-white p-4 pb-5 text-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">选择拍摄需求</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {intentChips.map((chip) => (
            <button
              key={chip}
              className={`h-11 rounded-full text-sm font-black ${selectedIntent === chip ? 'bg-black text-white' : 'border border-zinc-200 bg-white text-zinc-800'}`}
              onClick={() => onSelect(chip)}
            >
              {chip}
            </button>
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

function matchesCompanionIntent(intent: string, gender: string, searchable: string, priceCents: number) {
  if (intent === '现在可拍') return searchable.includes('今天') || searchable.includes('现在');
  if (intent === '1小时内') return searchable.includes('1小时') || searchable.includes('快拍');
  if (intent === '预算300内') return priceCents <= 30000;
  if (intent === '女生摄影师') return gender === 'female';
  return searchable.includes(intent.toLowerCase());
}
