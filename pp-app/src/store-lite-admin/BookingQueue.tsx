import { ChevronRight, Phone, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AdminCancelBookingRequestInput,
  BookingRequestAdminDetail,
  BookingRequestAdminSummary,
  BookingRequestStatus,
  ConfirmBookingRequestInput,
  DeclineBookingRequestInput,
} from '../types/api';
import {
  ActionButton,
  ActionSection,
  AdminEmpty,
  AdminError,
  AdminLoading,
  DetailRow,
  Field,
  QueueLayout,
  RefreshButton,
  SecondaryButton,
  StatusBadge,
} from './AdminUi';
import { adminErrorMessage, isConflictError } from './adminHttp';
import {
  cancelAdminBooking,
  confirmAdminBooking,
  declineAdminBooking,
  getAdminBooking,
  listAdminBookings,
} from './storeLiteAdminApi';
import { bookingStatusLabels, displayValue, formatDateTime, statusTone } from './format';

const bookingStatuses: Array<BookingRequestStatus | ''> = ['', 'submitted', 'confirmed', 'declined', 'cancelled'];

export function BookingQueue({ canWrite }: { canWrite: boolean }) {
  const [status, setStatus] = useState<BookingRequestStatus | ''>('submitted');
  const [items, setItems] = useState<BookingRequestAdminSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void listAdminBookings({ status: status || undefined, limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setSelectedId((current) => (current && page.items.some((item) => item.id === current) ? current : page.items[0]?.id ?? null));
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause, '预约队列加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, status]);

  function refresh() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listAdminBookings({ status: status || undefined, limit: 20, cursor: nextCursor });
      setItems((current) => mergeById(current, page.items));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(adminErrorMessage(cause, '更多预约加载失败'));
    } finally {
      setLoadingMore(false);
    }
  }

  const list = (
    <section className="min-h-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 p-4">
        <Field label="状态筛选">
          <select
            className="admin-input min-w-36"
            value={status}
            onChange={(event) => {
              setLoading(true);
              setSelectedId(null);
              setStatus(event.target.value as BookingRequestStatus | '');
            }}
          >
            {bookingStatuses.map((value) => <option key={value || 'all'} value={value}>{value ? bookingStatusLabels[value] : '全部状态'}</option>)}
          </select>
        </Field>
        <RefreshButton loading={loading} onClick={refresh} />
      </div>
      {loading ? <AdminLoading label="正在加载预约队列" /> : null}
      {!loading && error ? <div className="p-4"><AdminError message={error} onRetry={refresh} /></div> : null}
      {!loading && !error && items.length === 0 ? <AdminEmpty title="暂无预约申请" description="当前筛选条件下没有需要处理的记录。" /> : null}
      {!loading && items.length ? (
        <div className="max-h-[calc(100dvh-250px)] overflow-y-auto">
          {items.map((item) => <BookingListItem key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}
          {hasMore ? <div className="p-4"><SecondaryButton type="button" disabled={loadingMore} onClick={() => void loadMore()} className="w-full">{loadingMore ? '加载中' : '加载更多'}</SecondaryButton></div> : null}
        </div>
      ) : null}
    </section>
  );

  const detail = selectedId ? (
    <BookingDetail key={selectedId} id={selectedId} canWrite={canWrite} onChanged={refresh} />
  ) : (
    <section className="rounded-2xl border border-zinc-200 bg-white"><AdminEmpty title="选择一条预约" description="详情中的完整电话只用于履约处理，不会出现在队列列表。" /></section>
  );

  return <QueueLayout list={list} detail={detail} />;
}

function BookingListItem({ item, selected, onSelect }: { item: BookingRequestAdminSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={`block w-full border-b border-zinc-100 p-4 text-left transition ${selected ? 'bg-zinc-950 text-white' : 'bg-white hover:bg-zinc-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="m-0 truncate text-sm font-black">{item.consumer.name} · {item.photographer.name}</p><p className={`mt-1 text-xs font-semibold ${selected ? 'text-white/55' : 'text-zinc-400'}`}>{formatDateTime(item.requestedSchedule.startAt)}</p></div>
        <div className="flex items-center gap-2"><StatusBadge label={bookingStatusLabels[item.status]} tone={statusTone(item.status)} /><ChevronRight size={15} /></div>
      </div>
      <p className={`mt-3 line-clamp-2 text-xs font-semibold leading-5 ${selected ? 'text-white/70' : 'text-zinc-600'}`}>{displayValue(item.requirementsPreview)}</p>
      <p className={`mt-2 text-[11px] font-bold ${selected ? 'text-white/45' : 'text-zinc-400'}`}>{item.consumer.phoneMasked || '用户电话未提供'} · {item.companionPhoneMasked || '摄影师电话未提供'}</p>
    </button>
  );
}

function BookingDetail({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
  const [item, setItem] = useState<BookingRequestAdminDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void getAdminBooking(id)
      .then((detail) => {
        if (!active) return;
        setItem(detail);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause, '预约详情加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  function refreshDetail() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  async function runAction(action: () => Promise<BookingRequestAdminDetail>) {
    setMutating(true);
    setError('');
    try {
      setItem(await action());
      onChanged();
      return true;
    } catch (cause) {
      if (isConflictError(cause)) {
        try {
          setItem(await getAdminBooking(id));
          onChanged();
        } catch {
          setItem(null);
        }
      }
      setError(adminErrorMessage(cause, '预约操作失败'));
      return false;
    } finally {
      setMutating(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-zinc-200 bg-white"><AdminLoading label="正在加载预约详情" /></section>;
  if (!item) return <section className="rounded-2xl border border-zinc-200 bg-white p-4"><AdminError message={error || '预约详情不存在'} onRetry={refreshDetail} /></section>;

  return (
    <section className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4">
        <div><p className="m-0 text-xs font-black uppercase tracking-wide text-zinc-400">预约编号</p><h2 className="mt-1 break-all text-base font-black">{item.id}</h2></div>
        <StatusBadge label={bookingStatusLabels[item.status]} tone={statusTone(item.status)} />
      </div>

      {error ? <div className="mt-4"><AdminError message={error} onRetry={refreshDetail} /></div> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DetailRow label="消费者">{item.consumer.name}<br /><span className="text-xs font-semibold text-zinc-500">{item.consumer.id}</span></DetailRow>
        <DetailRow label="摄影师">{item.photographer.name}<br /><span className="text-xs font-semibold text-zinc-500">{item.photographer.id}</span></DetailRow>
        <DetailRow label="消费者电话（受保护详情）" sensitive><span className="inline-flex items-center gap-2"><Phone size={14} />{displayValue(item.consumer.phone)}</span></DetailRow>
        <DetailRow label="摄影师电话（受保护详情）" sensitive><span className="inline-flex items-center gap-2"><Phone size={14} />{displayValue(item.companionPhone)}</span></DetailRow>
      </div>

      <section className="mt-4 rounded-2xl border border-zinc-200 p-4"><h3 className="m-0 text-sm font-black">用户申请</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><DetailRow label="申请时间">{formatDateTime(item.requestedSchedule.startAt)} — {formatDateTime(item.requestedSchedule.endAt)}</DetailRow><DetailRow label="城市与地点">{item.requestedSchedule.city} · {item.requestedSchedule.addressText}</DetailRow></div><div className="mt-3"><DetailRow label="完整需求">{displayValue(item.requirements)}</DetailRow></div></section>

      {item.confirmation ? <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="m-0 text-sm font-black text-emerald-900">确认安排</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><DetailRow label="确认时间">{formatDateTime(item.confirmation.startAt)} — {formatDateTime(item.confirmation.endAt)}</DetailRow><DetailRow label="确认地点">{item.confirmation.city} · {item.confirmation.addressText}</DetailRow><DetailRow label="到场说明">{displayValue(item.confirmation.arrivalInstructions)}</DetailRow><DetailRow label="平台支持渠道键">{displayValue(item.confirmation.supportChannel)}</DetailRow></div></section> : null}

      <section className="mt-4 rounded-2xl border border-zinc-200 p-4"><h3 className="m-0 text-sm font-black">公开状态轨迹</h3><div className="mt-3 space-y-3">{item.statusLogs.map((log) => <div key={log.id} className="border-l-2 border-zinc-200 pl-3"><p className="m-0 text-xs font-black">{log.fromStatus ? bookingStatusLabels[log.fromStatus] : '创建'} → {bookingStatusLabels[log.toStatus]}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{log.actorType === 'admin' ? '运营' : '用户'} · {formatDateTime(log.createdAt)}{log.reasonCode ? ` · ${log.reasonCode}` : ''}</p><p className="mt-1 text-sm font-semibold leading-5 text-zinc-700">{displayValue(log.message)}</p></div>)}</div></section>

      {canWrite ? <div className="mt-4 space-y-4">{item.status === 'submitted' ? <ConfirmBookingForm item={item} disabled={mutating} onSubmit={(input) => runAction(() => confirmAdminBooking(id, input))} /> : null}{item.status === 'submitted' ? <BookingReasonAction title="无法承接" buttonLabel="确认无法承接" disabled={mutating} onSubmit={(input) => runAction(() => declineAdminBooking(id, input))} /> : null}{item.status === 'submitted' || item.status === 'confirmed' ? <BookingReasonAction title="运营取消" buttonLabel="确认取消预约" disabled={mutating} danger onSubmit={(input) => runAction(() => cancelAdminBooking(id, input))} /> : null}</div> : <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800"><ShieldAlert className="mt-0.5 shrink-0" size={15} />当前账号只有读取权限，运营动作不会显示。</div>}
    </section>
  );
}

function ConfirmBookingForm({ item, disabled, onSubmit }: { item: BookingRequestAdminDetail; disabled: boolean; onSubmit: (input: ConfirmBookingRequestInput) => Promise<boolean> }) {
  const [startAt, setStartAt] = useState(item.requestedSchedule.startAt);
  const [endAt, setEndAt] = useState(item.requestedSchedule.endAt);
  const [city, setCity] = useState(item.requestedSchedule.city);
  const [address, setAddress] = useState(item.requestedSchedule.addressText);
  const [arrival, setArrival] = useState('请按确认时间到达，并在 App 内查看最新状态');
  const [supportKey, setSupportKey] = useState('store_lite.support');
  const [publicMessage, setPublicMessage] = useState('预约已确认，请按确认安排准备');
  const [internalNote, setInternalNote] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await onSubmit({
      confirmedStartAt: startAt.trim(),
      confirmedEndAt: endAt.trim(),
      confirmedCity: city.trim(),
      confirmedAddressText: address.trim(),
      arrivalInstructions: arrival.trim(),
      supportChannelKey: supportKey.trim(),
      ...(publicMessage.trim() ? { publicMessage: publicMessage.trim() } : {}),
      ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
    });
    if (succeeded) setInternalNote('');
  }

  return <ActionSection title="确认预约" description="公开说明会展示给用户；内部备注只写入受保护审计记录。"><form className="space-y-3" onSubmit={(event) => void submit(event)}><div className="grid gap-3 sm:grid-cols-2"><Field label="开始时间（ISO 8601，含时区）"><input className="admin-input" value={startAt} onChange={(event) => setStartAt(event.target.value)} required /></Field><Field label="结束时间（ISO 8601，含时区）"><input className="admin-input" value={endAt} onChange={(event) => setEndAt(event.target.value)} required /></Field><Field label="城市"><input className="admin-input" value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} required /></Field><Field label="确认地点"><input className="admin-input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} required /></Field></div><Field label="到场说明"><textarea className="admin-input admin-textarea" value={arrival} onChange={(event) => setArrival(event.target.value)} maxLength={1000} required /></Field><Field label="平台支持渠道键"><input className="admin-input" value={supportKey} onChange={(event) => setSupportKey(event.target.value)} pattern="[a-z0-9][a-z0-9._-]{0,79}" maxLength={80} required /></Field><Field label="用户可见说明（可选）"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled}>{disabled ? '提交中' : '确认并通知用户'}</ActionButton></form></ActionSection>;
}

function BookingReasonAction({ title, buttonLabel, disabled, danger = false, onSubmit }: { title: string; buttonLabel: string; disabled: boolean; danger?: boolean; onSubmit: (input: DeclineBookingRequestInput | AdminCancelBookingRequestInput) => Promise<boolean> }) {
  const [reasonCode, setReasonCode] = useState('photographer_unavailable');
  const [publicMessage, setPublicMessage] = useState('摄影师无法承接该安排，请重新选择时间或摄影师');
  const [internalNote, setInternalNote] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await onSubmit({ reasonCode: reasonCode.trim(), publicMessage: publicMessage.trim(), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) });
    if (succeeded) setInternalNote('');
  }

  return <ActionSection title={title}><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="原因代码"><input className="admin-input" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} maxLength={80} required /></Field><Field label="用户可见说明"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} required /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled} className={danger ? 'bg-rose-700' : ''}>{disabled ? '提交中' : buttonLabel}</ActionButton></form></ActionSection>;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}
