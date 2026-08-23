import { ChevronRight, ShieldAlert, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  AdminCompleteUserRequestInput,
  AdminDeclineUserRequestInput,
  AdminStartUserRequestInput,
  UserRequestAdminDetail,
  UserRequestAdminSummary,
  UserRequestStatus,
  UserRequestType,
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
  completeAdminUserRequest,
  declineAdminUserRequest,
  getAdminUserRequest,
  listAdminUserRequests,
  startAdminUserRequest,
} from './storeLiteAdminApi';
import {
  displayValue,
  formatDateTime,
  statusTone,
  supportCategoryLabels,
  userRequestStatusLabels,
  userRequestTypeLabels,
} from './format';

const requestTypes: Array<UserRequestType | ''> = ['', 'support', 'data_access', 'data_copy', 'account_deletion'];
const requestStatuses: Array<UserRequestStatus | ''> = ['', 'submitted', 'processing', 'completed', 'declined', 'cancelled'];

export function UserRequestQueue({ canWrite }: { canWrite: boolean }) {
  const [requestType, setRequestType] = useState<UserRequestType | ''>('');
  const [status, setStatus] = useState<UserRequestStatus | ''>('submitted');
  const [items, setItems] = useState<UserRequestAdminSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void listAdminUserRequests({ requestType: requestType || undefined, status: status || undefined, limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setSelectedId((current) => (current && page.items.some((item) => item.id === current) ? current : page.items[0]?.id ?? null));
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause, '用户请求队列加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, requestType, status]);

  function refresh() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listAdminUserRequests({ requestType: requestType || undefined, status: status || undefined, limit: 20, cursor: nextCursor });
      setItems((current) => mergeById(current, page.items));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(adminErrorMessage(cause, '更多用户请求加载失败'));
    } finally {
      setLoadingMore(false);
    }
  }

  const list = (
    <section className="min-h-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 p-4">
        <Field label="请求类型"><select className="admin-input min-w-36" value={requestType} onChange={(event) => { setLoading(true); setSelectedId(null); setRequestType(event.target.value as UserRequestType | ''); }}>{requestTypes.map((value) => <option key={value || 'all'} value={value}>{value ? userRequestTypeLabels[value] : '全部类型'}</option>)}</select></Field>
        <Field label="状态"><select className="admin-input min-w-32" value={status} onChange={(event) => { setLoading(true); setSelectedId(null); setStatus(event.target.value as UserRequestStatus | ''); }}>{requestStatuses.map((value) => <option key={value || 'all'} value={value}>{value ? userRequestStatusLabels[value] : '全部状态'}</option>)}</select></Field>
        <div className="ml-auto"><RefreshButton loading={loading} onClick={refresh} /></div>
      </div>
      {loading ? <AdminLoading label="正在加载用户请求" /> : null}
      {!loading && error ? <div className="p-4"><AdminError message={error} onRetry={refresh} /></div> : null}
      {!loading && !error && items.length === 0 ? <AdminEmpty title="暂无用户请求" description="当前筛选条件下没有需要处理的客服或数据权利请求。" /> : null}
      {!loading && items.length ? <div className="max-h-[calc(100dvh-250px)] overflow-y-auto">{items.map((item) => <UserRequestListItem key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}{hasMore ? <div className="p-4"><SecondaryButton type="button" disabled={loadingMore} onClick={() => void loadMore()} className="w-full">{loadingMore ? '加载中' : '加载更多'}</SecondaryButton></div> : null}</div> : null}
    </section>
  );

  const detail = selectedId ? <UserRequestDetail key={selectedId} id={selectedId} canWrite={canWrite} onChanged={refresh} /> : <section className="rounded-2xl border border-zinc-200 bg-white"><AdminEmpty title="选择一条请求" description="列表与详情均不提供用户电话或内部备注。" /></section>;
  return <QueueLayout list={list} detail={detail} />;
}

function UserRequestListItem({ item, selected, onSelect }: { item: UserRequestAdminSummary; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`block w-full border-b border-zinc-100 p-4 text-left transition ${selected ? 'bg-zinc-950 text-white' : 'bg-white hover:bg-zinc-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="m-0 truncate text-sm font-black">{userRequestTypeLabels[item.requestType]} · {item.user.nickname}</p><p className={`mt-1 text-xs font-semibold ${selected ? 'text-white/55' : 'text-zinc-400'}`}>{formatDateTime(item.createdAt)}</p></div><div className="flex items-center gap-2"><StatusBadge label={userRequestStatusLabels[item.status]} tone={statusTone(item.status)} /><ChevronRight size={15} /></div></div>{item.description ? <p className={`mt-3 line-clamp-2 text-xs font-semibold leading-5 ${selected ? 'text-white/70' : 'text-zinc-600'}`}>{item.description}</p> : null}{item.supportCategory ? <p className={`mt-2 text-[11px] font-bold ${selected ? 'text-white/45' : 'text-zinc-400'}`}>分类：{supportCategoryLabels[item.supportCategory]}</p> : null}</button>;
}

function UserRequestDetail({ id, canWrite, onChanged }: { id: string; canWrite: boolean; onChanged: () => void }) {
  const [item, setItem] = useState<UserRequestAdminDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void getAdminUserRequest(id)
      .then((detail) => {
        if (!active) return;
        setItem(detail);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause, '用户请求详情加载失败'));
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

  async function runAction(action: () => Promise<UserRequestAdminDetail>) {
    setMutating(true);
    setError('');
    try {
      setItem(await action());
      onChanged();
      return true;
    } catch (cause) {
      if (isConflictError(cause)) {
        try {
          setItem(await getAdminUserRequest(id));
          onChanged();
        } catch {
          setItem(null);
        }
      }
      setError(adminErrorMessage(cause, '用户请求操作失败'));
      return false;
    } finally {
      setMutating(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-zinc-200 bg-white"><AdminLoading label="正在加载请求详情" /></section>;
  if (!item) return <section className="rounded-2xl border border-zinc-200 bg-white p-4"><AdminError message={error || '用户请求不存在'} onRetry={refreshDetail} /></section>;

  return <section className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 lg:p-5"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4"><div><p className="m-0 text-xs font-black uppercase tracking-wide text-zinc-400">请求编号</p><h2 className="mt-1 break-all text-base font-black">{item.id}</h2></div><StatusBadge label={userRequestStatusLabels[item.status]} tone={statusTone(item.status)} /></div>{error ? <div className="mt-4"><AdminError message={error} onRetry={refreshDetail} /></div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><DetailRow label="请求类型">{userRequestTypeLabels[item.requestType]}</DetailRow><DetailRow label="用户">{item.user.nickname}<br /><span className="text-xs font-semibold text-zinc-500">{item.user.id}</span></DetailRow><DetailRow label="客服分类">{item.supportCategory ? supportCategoryLabels[item.supportCategory] : '—'}</DetailRow><DetailRow label="关联预约编号">{displayValue(item.bookingRequestId)}</DetailRow><DetailRow label="创建时间">{formatDateTime(item.createdAt)}</DetailRow><DetailRow label="更新时间">{formatDateTime(item.updatedAt)}</DetailRow></div><div className="mt-3"><DetailRow label="用户说明">{displayValue(item.description)}</DetailRow></div>{item.requestType === 'account_deletion' ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800"><Trash2 className="mt-0.5 shrink-0" size={15} />账号删除只能由受控系统执行完成；运营人员不能手动标记完成。</div> : null}<section className="mt-4 rounded-2xl border border-zinc-200 p-4"><h3 className="m-0 text-sm font-black">公开状态轨迹</h3><div className="mt-3 space-y-3">{item.statusLogs.map((log) => <div key={log.id} className="border-l-2 border-zinc-200 pl-3"><p className="m-0 text-xs font-black">{log.fromStatus ? userRequestStatusLabels[log.fromStatus] : '创建'} → {userRequestStatusLabels[log.toStatus]}</p><p className="mt-1 text-xs font-semibold text-zinc-500">{actorLabel(log.actorType)} · {formatDateTime(log.createdAt)}{log.reasonCode ? ` · ${log.reasonCode}` : ''}</p>{log.publicMessage ? <p className="mt-1 text-sm font-semibold leading-5 text-zinc-700">{log.publicMessage}</p> : null}</div>)}</div></section>{canWrite ? <div className="mt-4 space-y-4">{item.status === 'submitted' ? <StartRequestForm disabled={mutating} onSubmit={(input) => runAction(() => startAdminUserRequest(id, input))} /> : null}{item.status === 'processing' && item.requestType !== 'account_deletion' ? <CompleteRequestForm disabled={mutating} onSubmit={(input) => runAction(() => completeAdminUserRequest(id, input))} /> : null}{item.status === 'submitted' || item.status === 'processing' ? <DeclineRequestForm disabled={mutating} onSubmit={(input) => runAction(() => declineAdminUserRequest(id, input))} /> : null}</div> : <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800"><ShieldAlert className="mt-0.5 shrink-0" size={15} />当前账号只有读取权限，运营动作不会显示。</div>}</section>;
}

function StartRequestForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (input: AdminStartUserRequestInput) => Promise<boolean> }) {
  const [publicMessage, setPublicMessage] = useState('平台已开始处理你的请求');
  const [internalNote, setInternalNote] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const succeeded = await onSubmit({ ...(publicMessage.trim() ? { publicMessage: publicMessage.trim() } : {}), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }); if (succeeded) setInternalNote(''); }
  return <ActionSection title="开始处理"><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="用户可见说明（可选）"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled}>{disabled ? '提交中' : '标记处理中'}</ActionButton></form></ActionSection>;
}

function CompleteRequestForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (input: AdminCompleteUserRequestInput) => Promise<boolean> }) {
  const [publicMessage, setPublicMessage] = useState('你的请求已处理完成');
  const [internalNote, setInternalNote] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const succeeded = await onSubmit({ publicMessage: publicMessage.trim(), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }); if (succeeded) setInternalNote(''); }
  return <ActionSection title="完成请求"><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="用户可见结果"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} required /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled}>{disabled ? '提交中' : '标记已完成'}</ActionButton></form></ActionSection>;
}

function DeclineRequestForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (input: AdminDeclineUserRequestInput) => Promise<boolean> }) {
  const [reasonCode, setReasonCode] = useState('request_cannot_be_processed');
  const [publicMessage, setPublicMessage] = useState('当前信息不足或不符合处理条件，请核对后重新提交');
  const [internalNote, setInternalNote] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const succeeded = await onSubmit({ reasonCode: reasonCode.trim(), publicMessage: publicMessage.trim(), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }); if (succeeded) setInternalNote(''); }
  return <ActionSection title="不予受理"><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="原因代码"><input className="admin-input" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} maxLength={80} required /></Field><Field label="用户可见说明"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} required /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled} className="bg-rose-700">{disabled ? '提交中' : '确认不予受理'}</ActionButton></form></ActionSection>;
}

function actorLabel(actor: 'user' | 'admin' | 'system') {
  return { user: '用户', admin: '运营', system: '系统' }[actor];
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}
