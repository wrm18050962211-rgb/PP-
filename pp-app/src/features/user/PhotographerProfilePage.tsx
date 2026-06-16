import { ArrowLeft, CalendarDays, ChevronDown, MapPin, MessageCircle, Send, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import { ConsultationRequestModal } from './ConsultationRequestModal';
import { formatCents, readCompanionPackageSettings } from '../../services/companionPackageService';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import { isOrderWorkConfirmed, listOrderWorkRecords, orderWorkToFeedPost } from '../../services/orderWorkService';
import { getFollowerCountForPerson, getPostLikeCount } from '../../services/userCollectionService';
import type { FeedPost } from '../../types/api';
import type { CompanionPackage, CompanionPackageSettings } from '../../services/companionPackageService';

export function PhotographerProfilePage() {
  const { photographerId } = useParams();
  const navigate = useNavigate();
  const { orders, session } = useAppData();
  const isCompanionMode = session?.role === 'companion';
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultPackageId, setConsultPackageId] = useState<string | null>(null);
  const posts = listFeedPosts();
  const photographerPosts = posts.filter((post) => post.companion.id === photographerId);
  const profilePost = photographerPosts[0] || posts[0];
  const photographer = profilePost.companion;
  const photographerOrderWorks = listOrderWorkRecords()
    .filter((record) => record.publishToPhotographer && isOrderWorkConfirmed(record))
    .map((record) => {
      const order = orders.find((item) => item.id === record.orderId && item.companionId === photographerId);
      const seedPost = posts.find((post) => post.id === order?.postId) ?? profilePost;
      return order ? orderWorkToFeedPost(record, order, seedPost) : null;
    })
    .filter((post): post is FeedPost => Boolean(post));
  const works = [...photographerOrderWorks, ...(photographerPosts.length ? photographerPosts : [profilePost])];
  const handle = `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`;
  const likeTotal = works.reduce((sum, post) => sum + getPostLikeCount(post.id, posts), 0);
  const followerCount = getFollowerCountForPerson(`photographer-${photographer.id}`, posts);
  const ratingDistribution = buildRatingDistribution(photographer.ratingCount, photographer.ratingAvg);
  const reviews = buildPhotographerReviews(photographer, works);
  const packageSettings = readCompanionPackageSettings(photographer);

  function openConsultForPackage(packageId?: string) {
    if (isCompanionMode) return;
    setConsultPackageId(packageId ?? packageSettings.packages[0].id);
    setConsultOpen(true);
  }

  return (
    <div className="min-h-dvh bg-[#050505] pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-[#050505]/94 px-4 backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center text-white/88" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={24} />
        </button>
        <p className="min-w-0 truncate text-lg font-black tracking-tight">{handle}</p>
        {isCompanionMode ? (
          <span className="h-10 w-10" aria-hidden />
        ) : (
          <Link to="/consumer/messages" className="grid h-10 w-10 place-items-center text-white/88" aria-label="咨询">
            <MessageCircle size={20} />
          </Link>
        )}
      </header>

      <section className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-5">
          <img className="h-[86px] w-[86px] shrink-0 rounded-full object-cover ring-1 ring-white/14" src={photographer.avatar} alt={photographer.name} />
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
            <ProfileStat value={formatMetric(likeTotal)} label="点赞数" />
            <ProfileStat value={followerCount} label="关注数" />
            <ProfileStat value={photographer.ratingCount} label="评价数" onClick={() => setReviewsOpen(true)} />
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-base font-black">{photographer.name}</h1>
          <p className="mt-1 text-sm font-semibold leading-5 text-white/72">{photographer.bio}</p>
          <p className="mt-2 flex min-w-0 items-center gap-1 text-sm font-black text-white/88">
            <MapPin size={15} className="shrink-0" />
            <span className="truncate">{photographer.areas.slice(0, 3).join(' / ')}</span>
          </p>
        </div>

        <div className={`mt-4 grid gap-2 ${isCompanionMode ? 'grid-cols-1' : 'grid-cols-[1fr_1fr]'}`}>
          <Link className="flex h-10 items-center justify-center rounded-[6px] bg-[#4d5dff] text-sm font-black text-white" to={`/consumer/post/${profilePost.id}`}>
            看作品
          </Link>
          {isCompanionMode ? null : (
            <button className="flex h-10 items-center justify-center rounded-[6px] bg-white/12 text-sm font-black text-white" onClick={() => openConsultForPackage()} type="button">
              咨询档期/报价
            </button>
          )}
        </div>
      </section>

      <section className="mx-4 mb-4 rounded-[10px] bg-white/[0.08] p-3 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black">套餐与报价</h2>
            <p className="mt-1 text-[11px] font-semibold text-white/42">服务内容、价格和规则以摄影师设置为准。</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-white/58">
            <Star size={12} className="fill-white/46 text-white/46" />
            {photographer.ratingAvg.toFixed(1)}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {packageSettings.packages.map((pkg) => (
            <PackageQuoteCard
              key={pkg.id}
              pkg={pkg}
              settings={packageSettings}
              expanded={expandedPackageId === pkg.id}
              isCompanionMode={isCompanionMode}
              onToggle={() => setExpandedPackageId((current) => (current === pkg.id ? null : pkg.id))}
              onConsult={() => openConsultForPackage(pkg.id)}
            />
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-white/48">
          <CalendarDays size={13} />
          {buildSlotSummary(photographer.slots)}
        </p>
      </section>

      <WorkGrid works={works} />
      {reviewsOpen ? (
        <PhotographerReviewsSheet
          ratingAvg={photographer.ratingAvg}
          ratingCount={photographer.ratingCount}
          distribution={ratingDistribution}
          reviews={reviews}
          onClose={() => setReviewsOpen(false)}
        />
      ) : null}
      {consultOpen && !isCompanionMode ? (
        <ConsultationRequestModal
          post={profilePost}
          session={session}
          packageSettings={packageSettings}
          initialPackageId={consultPackageId ?? undefined}
          onClose={() => setConsultOpen(false)}
          onSubmitted={(id) => {
            setConsultOpen(false);
            navigate(`/consumer/messages/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function PackageQuoteCard({
  pkg,
  settings,
  expanded,
  isCompanionMode,
  onToggle,
  onConsult,
}: {
  pkg: CompanionPackage;
  settings: CompanionPackageSettings;
  expanded: boolean;
  isCompanionMode: boolean;
  onToggle: () => void;
  onConsult: () => void;
}) {
  const balanceCents = Math.max(0, pkg.basePriceCents - pkg.depositCents);

  return (
    <article className="overflow-hidden rounded-[8px] bg-black/24 ring-1 ring-white/8">
      <button type="button" className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-3 text-left" onClick={onToggle}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-white">{pkg.name}</span>
          <span className="mt-1 block truncate text-[11px] font-semibold text-white/46">
            {formatDuration(pkg.durationMinutes)} · 含 {pkg.includedRetouchedCount} 张精修 · {formatCents(pkg.basePriceCents)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-right">
          <span className="text-sm font-black text-white">{formatCents(pkg.basePriceCents)}</span>
          <ChevronDown size={16} className={`text-white/46 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-white/10 px-3 pb-3 pt-2">
          <p className="text-xs font-semibold leading-5 text-white/64">{pkg.description}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
            <PackageMetric label="套餐价格" value={formatCents(pkg.basePriceCents)} />
            <PackageMetric label="定金" value={`${formatCents(pkg.depositCents)} 锁档期`} />
            <PackageMetric label="尾款" value={`${formatCents(balanceCents)} 拍摄前托管`} />
            <PackageMetric label="原图/精修" value={`${pkg.includedOriginals} 张原图 · ${pkg.includedRetouchedCount} 张精修`} />
            <PackageMetric label="多人加价" value={`+${formatCents(settings.addOns.extraPersonPerHourCents)} /人/小时`} />
            <PackageMetric label="额外修图" value={`${formatCents(settings.addOns.retouchPerImageCents)} /张`} />
          </div>
          <div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-white/58">
            <RuleLine label="可拍时间" value={settings.rules.availableTimeRanges} />
            <RuleLine label="取消规则" value={settings.rules.cancellationPolicy} />
            <RuleLine label="天气规则" value={settings.rules.weatherPolicy} />
            <RuleLine label="交通/门票" value={`${settings.rules.travelFeePolicy} ${settings.rules.ticketFeePolicy}`} />
            <RuleLine label="交付规则" value={settings.rules.deliveryPolicy} />
          </div>
          {isCompanionMode ? null : (
            <button type="button" className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black" onClick={onConsult}>
              <Send size={16} />
              按这个套餐询价
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function PackageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white/[0.06] p-2">
      <p className="text-white/36">{label}</p>
      <p className="mt-1 text-white">{value}</p>
    </div>
  );
}

function RuleLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="mr-2 font-black text-white/88">{label}</span>
      {value}
    </p>
  );
}

function ProfileStat({ value, label, onClick }: { value: number | string; label: string; onClick?: () => void }) {
  const content = (
    <>
      <p className="text-xl font-black leading-6">{value}</p>
      <p className="mt-0.5 text-xs font-semibold leading-4 text-white/62">{label}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="min-w-0 text-center" onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <div>
      {content}
    </div>
  );
}

function WorkGrid({ works }: { works: FeedPost[] }) {
  return (
    <section className="grid grid-cols-3 gap-[1px] bg-black">
      {works.map((post) => (
        <Link key={post.id} to={`/consumer/post/${post.id}`} className="relative aspect-[0.76] overflow-hidden bg-[#111]" aria-label={`查看作品 ${getPostTitle(post)}`}>
          <LivePhotoMedia media={post.images[0]} alt={getPostTitle(post)} loading="lazy" playLive={false} />
          {post.images.length > 1 ? <span className="absolute right-1.5 top-1.5 h-4 w-4 rounded-[4px] border border-white/80 bg-black/12" /> : null}
        </Link>
      ))}
    </section>
  );
}

type RatingDistributionItem = {
  rating: 1 | 2 | 3 | 4 | 5;
  count: number;
};

type PhotographerReview = {
  id: string;
  name: string;
  rating: number;
  text: string;
  postTitle: string;
};

function PhotographerReviewsSheet({
  ratingAvg,
  ratingCount,
  distribution,
  reviews,
  onClose,
}: {
  ratingAvg: number;
  ratingCount: number;
  distribution: RatingDistributionItem[];
  reviews: PhotographerReview[];
  onClose: () => void;
}) {
  const maxCount = Math.max(...distribution.map((item) => item.count), 1);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/58" onClick={onClose}>
      <section className="max-h-[76dvh] w-full overflow-y-auto rounded-t-[18px] bg-[#111] px-4 pb-6 pt-4 text-white" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black">摄影师评价</h2>
            <p className="mt-1 text-xs font-semibold text-white/46">{ratingCount} 条评价</p>
          </div>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg font-black" onClick={onClose} aria-label="关闭">
            x
          </button>
        </div>

        <div className="rounded-[12px] bg-white/[0.06] p-3">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black leading-none">{ratingAvg.toFixed(1)}</span>
            <span className="pb-0.5 text-xs font-semibold text-white/52">综合评分</span>
          </div>
          <div className="mt-4 space-y-2">
            {distribution.map((item) => (
              <div key={item.rating} className="grid grid-cols-[34px_1fr_34px] items-center gap-2 text-xs font-bold text-white/58">
                <span>{item.rating}分</span>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(4, (item.count / maxCount) * 100)}%` }} />
                </div>
                <span className="text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-[12px] bg-white/[0.06] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{review.name}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-white/42">{review.postTitle}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-black text-white/70">
                  <Star size={12} className="fill-white/70 text-white/70" />
                  {review.rating.toFixed(1)}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold leading-5 text-white/72">{review.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildSlotSummary(slots: FeedPost['companion']['slots']) {
  const available = slots.filter((slot) => slot.status === 'available').slice(0, 3);
  if (!available.length) return '近期时间待开放';
  return `可约时间：${available.map((slot) => slot.label).join(' / ')}`;
}

function buildRatingDistribution(total: number, avg: number): RatingDistributionItem[] {
  const count = Math.max(0, total);
  const five = Math.min(count, Math.round(count * Math.min(0.84, Math.max(0.42, avg / 5 + 0.04))));
  const four = Math.min(count - five, Math.round(count * (avg >= 4.6 ? 0.18 : 0.28)));
  const three = Math.min(count - five - four, Math.round(count * (avg >= 4.4 ? 0.04 : 0.1)));
  const two = Math.min(count - five - four - three, Math.round(count * (avg >= 4.3 ? 0.01 : 0.04)));
  const one = Math.max(0, count - five - four - three - two);
  const distribution: RatingDistributionItem[] = [
    { rating: 5, count: five },
    { rating: 4, count: four },
    { rating: 3, count: three },
    { rating: 2, count: two },
    { rating: 1, count: one },
  ];
  const delta = count - distribution.reduce((sum, item) => sum + item.count, 0);
  if (delta !== 0) distribution[0].count += delta;
  return distribution;
}

function buildPhotographerReviews(photographer: FeedPost['companion'], works: FeedPost[]): PhotographerReview[] {
  const templates = [
    '沟通很清楚，现场会主动找角度，出片速度也很稳。',
    '路线安排紧凑，拍摄时会提醒动作和表情，整体体验轻松。',
    '很会利用自然光，照片风格和样片接近，后期颜色干净。',
    '准时到达，拍摄节奏舒服，适合第一次约拍的人。',
    '构图有耐心，会根据现场人流快速换位置。'
  ];
  const names = ['Rui', 'Mia', 'Joey', 'Annie', 'Coco'];
  const total = Math.min(5, Math.max(3, works.length + 2));

  return Array.from({ length: total }, (_, index) => {
    const post = works[index % works.length];
    const rating = Math.max(4, Math.min(5, photographer.ratingAvg + (index % 2 === 0 ? 0.2 : -0.1)));
    return {
      id: `${photographer.id}-review-${index}`,
      name: names[index % names.length],
      rating,
      text: templates[index % templates.length],
      postTitle: getPostTitle(post),
    };
  });
}

function stableMetricSeed(value: string, range: number) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0) % range;
}

function formatMetric(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatDuration(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  if (minutes > 60) return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
  return `${minutes}分钟`;
}
