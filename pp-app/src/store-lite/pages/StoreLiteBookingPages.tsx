import { CalendarCheck2, CalendarClock, CheckCircle2, CircleX, Clock3, MapPin, RefreshCw, RotateCcw, Send, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BookingRequestConsumerDetail, BookingRequestConsumerSummary, BookingRequestStatus, Companion } from '../../types/api';
import {
  cancelStoreLiteBooking,
  createStoreLiteBooking,
  fetchStoreLitePhotographer,
  getStoreLiteBooking,
  listStoreLiteBookings,
} from '../storeLiteService';
import { formatStoreLiteDateTime, StoreLiteError, StoreLiteLoading, StoreLiteNotice, StoreLitePageHeader } from '../StoreLiteUi';

const statusMeta: Record<BookingRequestStatus, { label: string; description: string; color: string; icon: typeof Clock3 }> = {
  submitted: { label: '待确认', description: '平台正在核对摄影师和时间', color: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Clock3 },
  confirmed: { label: '已确认', description: '请按确认后的时间与地点准备', color: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: CheckCircle2 },
  declined: { label: '无法承接', description: '本次申请未能确认', color: 'bg-rose-50 text-rose-800 ring-rose-200', icon: CircleX },
  cancelled: { label: '已取消', description: '本次申请已结束', color: 'bg-zinc-100 text-zinc-600 ring-zinc-200', icon: CircleX },
};

const supportUrl = String(import.meta.env.VITE_SUPPORT_URL ?? '').trim();
const fallbackClientRequestIds = new Map<string, string>();

export function StoreLiteBookingFormPage() {
  const { photographerId = '' } = useParams();
  const navigate = useNavigate();
  const [photographer, setPhotographer] = useState<Companion | null>(null);
  const [photographerLoading, setPhotographerLoading] = useState(true);
  const [photographerError, setPhotographerError] = useState('');
  const [photographerRetryKey, setPhotographerRetryKey] = useState(0);
  const [startLocal, setStartLocal] = useState(defaultLocalDateTime());
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [city, setCity] = useState('');
  const cityManuallyEditedRef = useRef(false);
  const [addressText, setAddressText] = useState('');
  const [requirements, setRequirements] = useState('');
  const clientRequestId = useMemo(
    () => readOrCreateClientRequestId(photographerId),
    [photographerId],
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchStoreLitePhotographer(photographerId)
      .then((profile) => {
        if (!active) return;
        setPhotographer(profile);
        setPhotographerError('');
        setCity((current) => (cityManuallyEditedRef.current ? current : profile.baseCity?.trim() || current));
      })
      .catch((cause) => {
        if (!active) return;
        setPhotographer(null);
        setPhotographerError(cause instanceof Error ? cause.message : '摄影师加载失败');
      })
      .finally(() => {
        if (active) setPhotographerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [photographerId, photographerRetryKey]);

  function retryPhotographer() {
    setPhotographer(null);
    setPhotographerError('');
    setPhotographerLoading(true);
    setPhotographerRetryKey((value) => value + 1);
  }

  async function submit() {
    if (submitting) return;
    if (!startLocal || !city.trim() || !addressText.trim() || !requirements.trim()) {
      setError('请完整填写时间、城市、地点和拍摄需求');
      return;
    }
    setSubmitting(true);
    try {
      const requestedStartAt = shanghaiLocalToIso(startLocal);
      const requestedEndAt = new Date(new Date(requestedStartAt).getTime() + durationMinutes * 60_000).toISOString();
      const booking = await createStoreLiteBooking({
        companionId: photographerId,
        clientRequestId,
        requestedStartAt,
        requestedEndAt,
        timezone: 'Asia/Shanghai',
        city: city.trim(),
        addressText: addressText.trim(),
        requirements: requirements.trim(),
      });
      clearStoredClientRequestId(photographerId);
      navigate(`/bookings/${encodeURIComponent(booking.id)}`, { replace: true, state: { created: true } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预约申请提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StoreLitePageHeader title="提交预约申请" eyebrow="Booking request" />
      <div className="space-y-5 px-4 py-5">
        <StoreLiteNotice>提交申请不代表摄影师已确认，也不会产生扣款。平台运营核对后，你会在“我的预约”看到结果。</StoreLiteNotice>

        <section className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          {photographer?.avatar ? <img src={photographer.avatar} alt={photographer.name} className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100"><UserRound size={20} /></span>}
          <div className="min-w-0 flex-1"><p className="text-xs font-black text-zinc-400">申请摄影师</p><p className="mt-1 truncate text-base font-black">{photographer?.name || (photographerLoading ? '加载中' : '暂未加载')}</p></div>
        </section>

        {photographerError ? <StoreLiteError message={photographerError} onRetry={retryPhotographer} /> : null}

        <Field label="希望开始时间">
          <input type="datetime-local" value={startLocal} min={minimumLocalDateTime()} onChange={(event) => setStartLocal(event.target.value)} className="store-lite-input" />
        </Field>

        <Field label="预计拍摄时长">
          <div className="grid grid-cols-4 gap-2">
            {[60, 90, 120, 180].map((minutes) => (
              <button key={minutes} type="button" onClick={() => setDurationMinutes(minutes)} className={`h-11 rounded-xl text-sm font-black ring-1 ${durationMinutes === minutes ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-white text-zinc-600 ring-zinc-200'}`}>
                {minutes >= 60 ? `${minutes / 60}小时` : `${minutes}分钟`}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="城市"><input value={city} maxLength={80} onChange={(event) => { cityManuallyEditedRef.current = true; setCity(event.target.value); }} className="store-lite-input" /></Field>
          <Field label="希望区域或地点"><input value={addressText} maxLength={500} onChange={(event) => setAddressText(event.target.value)} placeholder="例如：武康路附近" className="store-lite-input" /></Field>
        </div>

        <Field label="拍摄需求">
          <textarea value={requirements} maxLength={2000} onChange={(event) => setRequirements(event.target.value)} placeholder="说明拍摄目的、风格、人数和可调整的时间范围" className="min-h-32 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none ring-1 ring-zinc-200 focus:ring-zinc-950" />
          <p className="mt-1 text-right text-[11px] font-bold text-zinc-400">{requirements.length}/2000</p>
        </Field>

        {error ? <StoreLiteError message={error} /> : null}
        <button type="button" disabled={submitting || photographerLoading || !photographer || Boolean(photographerError)} onClick={() => void submit()} className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300">
          <Send size={17} />
          {submitting ? '提交中' : '确认提交申请'}
        </button>
      </div>
    </>
  );
}

export function StoreLiteBookingsPage() {
  const [items, setItems] = useState<BookingRequestConsumerSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function load(reset = true) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await listStoreLiteBookings({ limit: 20, cursor: reset ? undefined : nextCursor ?? undefined });
      setItems((current) => (reset ? page.items : mergeBookings(current, page.items)));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预约记录加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let active = true;
    listStoreLiteBookings({ limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError('');
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : '预约记录加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <StoreLitePageHeader title="我的预约" eyebrow="Requests" back={false} />
      <div className="flex justify-end px-4 pt-4"><button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-black ring-1 ring-zinc-200"><RefreshCw size={14} />刷新状态</button></div>
      {loading ? <StoreLiteLoading label="正在加载预约" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load(true)} /> : null}
      {!loading && !error && items.length === 0 ? (
        <div className="px-6 py-20 text-center"><CalendarClock className="mx-auto text-zinc-300" size={34} /><p className="mt-4 text-base font-black">还没有预约申请</p><p className="mt-2 text-sm font-semibold text-zinc-400">先从作品或摄影师页面选择想要的服务方。</p><Link to="/photographers" className="mt-5 inline-flex h-11 items-center rounded-full bg-zinc-950 px-6 text-sm font-black text-white">去找摄影师</Link></div>
      ) : null}
      <section className="space-y-3 px-4 py-4">
        {items.map((booking) => <BookingCard key={booking.id} booking={booking} />)}
      </section>
      {hasMore ? <div className="px-4 pb-6 text-center"><button type="button" disabled={loadingMore} onClick={() => void load(false)} className="h-11 rounded-full bg-zinc-950 px-7 text-sm font-black text-white disabled:bg-zinc-300">{loadingMore ? '加载中' : '加载更多'}</button></div> : null}
    </>
  );
}

export function StoreLiteBookingDetailPage() {
  const { bookingRequestId = '' } = useParams();
  const [booking, setBooking] = useState<BookingRequestConsumerDetail | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      setBooking(await getStoreLiteBooking(bookingRequestId));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预约详情加载失败');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    getStoreLiteBooking(bookingRequestId)
      .then((detail) => {
        if (!active) return;
        setBooking(detail);
        setError('');
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : '预约详情加载失败');
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [bookingRequestId]);

  async function cancel() {
    if (!booking || cancelling) return;
    const confirmationMessage = booking.status === 'confirmed'
      ? '该预约已确认，确定取消吗？本版本未发生扣款，因此不涉及退款。'
      : '确定撤回这次预约申请吗？本版本未发生扣款，因此不涉及退款。';
    if (!window.confirm(confirmationMessage)) return;
    setCancelling(true);
    try {
      setBooking(await cancelStoreLiteBooking(booking.id, { reasonCode: 'user_cancelled', reason: '用户在 App 内主动取消' }));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败');
    } finally {
      setCancelling(false);
    }
  }

  if (!booking && refreshing) return <StoreLiteLoading label="正在加载预约详情" />;
  if (!booking) return <StoreLiteError message={error || '预约记录不存在'} onRetry={() => void load()} />;

  const meta = statusMeta[booking.status];
  const StatusIcon = meta.icon;
  const schedule = booking.confirmation ?? booking.requestedSchedule;

  return (
    <>
      <StoreLitePageHeader title="预约详情" eyebrow={booking.id.slice(0, 12)} />
      <div className="space-y-4 px-4 py-5">
        <section className={`rounded-2xl p-4 ring-1 ${meta.color}`}>
          <div className="flex items-center gap-3"><StatusIcon size={22} /><div><h2 className="text-lg font-black">{meta.label}</h2><p className="mt-1 text-xs font-bold opacity-75">{meta.description}</p></div></div>
        </section>

        {booking.status === 'submitted' ? <StoreLiteNotice>此时间只是你的希望安排。平台尚未确认摄影师档期，请不要直接前往。</StoreLiteNotice> : null}
        {booking.status === 'confirmed' ? <StoreLiteNotice>预约已确认。请以下方“确认安排”为准，不再以原始申请时间为准。</StoreLiteNotice> : null}

        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-black text-zinc-400">{booking.confirmation ? '确认安排' : '申请安排'}</p>
          <div className="mt-4 space-y-3 text-sm font-bold text-zinc-700">
            <p className="flex items-start gap-2"><CalendarCheck2 size={17} className="mt-0.5 shrink-0" />{formatStoreLiteDateTime(schedule.startAt, booking.requestedSchedule.timezone)} — {formatStoreLiteDateTime(schedule.endAt, booking.requestedSchedule.timezone)}</p>
            <p className="flex items-start gap-2"><MapPin size={17} className="mt-0.5 shrink-0" />{schedule.city} · {schedule.addressText}</p>
            <p className="flex items-start gap-2"><UserRound size={17} className="mt-0.5 shrink-0" />{booking.photographer.name}</p>
          </div>
          {booking.confirmation?.arrivalInstructions ? <p className="mt-4 rounded-xl bg-zinc-100 px-3 py-3 text-xs font-bold leading-5 text-zinc-600">到场说明：{booking.confirmation.arrivalInstructions}</p> : null}
          {booking.confirmation?.supportChannel && supportUrl ? <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white">联系平台客服</a> : null}
          <p className="mt-4 text-[11px] font-bold text-zinc-400">状态更新于 {formatStoreLiteDateTime(booking.updatedAt, booking.requestedSchedule.timezone)}</p>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200"><p className="text-xs font-black text-zinc-400">拍摄需求</p><p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-700">{booking.requirements}</p></section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between"><h3 className="text-sm font-black">状态记录</h3><button type="button" onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-1 text-xs font-black text-zinc-500"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />刷新</button></div>
          <div className="mt-4 space-y-4">
            {booking.statusLogs.map((log, index) => <div key={log.id} className="grid grid-cols-[1rem_1fr] gap-3"><div className="flex flex-col items-center"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-zinc-950" />{index < booking.statusLogs.length - 1 ? <span className="mt-1 min-h-8 w-px flex-1 bg-zinc-200" /> : null}</div><div className="pb-1"><p className="text-sm font-black">{statusMeta[log.toStatus].label}</p><p className="mt-1 text-xs font-semibold leading-5 text-zinc-500">{log.message}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">{formatStoreLiteDateTime(log.createdAt)}</p></div></div>)}
          </div>
        </section>

        {error ? <StoreLiteError message={error} /> : null}
        {booking.status === 'confirmed' ? <StoreLiteNotice>取消已确认预约会将状态更新为“已取消”。本版本未发生扣款，不涉及退款。</StoreLiteNotice> : null}
        {booking.status === 'submitted' || booking.status === 'confirmed' ? <button type="button" onClick={() => void cancel()} disabled={cancelling} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-rose-600 ring-1 ring-rose-200"><RotateCcw size={16} />{cancelling ? '取消中' : booking.status === 'confirmed' ? '取消已确认预约' : '撤回预约申请'}</button> : null}
      </div>
    </>
  );
}

function BookingCard({ booking }: { booking: BookingRequestConsumerSummary }) {
  const meta = statusMeta[booking.status];
  const StatusIcon = meta.icon;
  const schedule = booking.confirmation ?? booking.requestedSchedule;
  return (
    <Link to={`/bookings/${encodeURIComponent(booking.id)}`} className="block rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-black">{booking.photographer.name}</p><p className="mt-1 text-xs font-bold text-zinc-400">{booking.confirmation ? '已更新为确认时间' : '你提交的希望时间'}</p></div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${meta.color}`}><StatusIcon size={12} />{meta.label}</span></div>
      <div className="mt-4 space-y-2 text-sm font-bold text-zinc-600"><p className="flex items-center gap-2"><CalendarClock size={15} />{formatStoreLiteDateTime(schedule.startAt, booking.requestedSchedule.timezone)}</p><p className="flex items-center gap-2"><MapPin size={15} />{schedule.city} · {schedule.addressText}</p></div>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-zinc-500">{label}</span>{children}</label>;
}

function defaultLocalDateTime() {
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shanghai.setUTCMinutes(0, 0, 0);
  return shanghai.toISOString().slice(0, 16);
}

function minimumLocalDateTime() {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shanghai.toISOString().slice(0, 16);
}

function shanghaiLocalToIso(value: string) {
  const timestamp = Date.parse(`${value}:00+08:00`);
  if (!Number.isFinite(timestamp)) throw new Error('请选择有效时间');
  return new Date(timestamp).toISOString();
}

function createClientRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `ios-${crypto.randomUUID()}`;
  return `ios-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function readOrCreateClientRequestId(photographerId: string) {
  const storageKey = clientRequestStorageKey(photographerId);
  if (typeof sessionStorage !== 'undefined') {
    try {
      const stored = String(sessionStorage.getItem(storageKey) || '').trim();
      if (stored.length >= 8 && stored.length <= 120) return stored;
      const created = createClientRequestId();
      sessionStorage.setItem(storageKey, created);
      return created;
    } catch {
      // Safari private mode or a restricted webview may deny session storage.
    }
  }
  const existing = fallbackClientRequestIds.get(storageKey);
  if (existing) return existing;
  const created = createClientRequestId();
  fallbackClientRequestIds.set(storageKey, created);
  return created;
}

function clearStoredClientRequestId(photographerId: string) {
  const storageKey = clientRequestStorageKey(photographerId);
  fallbackClientRequestIds.delete(storageKey);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // The request succeeded; an unavailable session store needs no further cleanup.
  }
}

function clientRequestStorageKey(photographerId: string) {
  return `pp:store-lite:booking-client-request:${encodeURIComponent(photographerId || 'unknown')}`;
}

function mergeBookings(current: BookingRequestConsumerSummary[], incoming: BookingRequestConsumerSummary[]) {
  const byId = new Map(current.map((booking) => [booking.id, booking]));
  for (const booking of incoming) byId.set(booking.id, booking);
  return [...byId.values()];
}
