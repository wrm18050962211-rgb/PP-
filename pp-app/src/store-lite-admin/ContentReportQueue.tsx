import { ChevronRight, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  ContentReportAdminDetail,
  ContentReportAdminSummary,
  ContentReportCategory,
  ContentReportResolutionAction,
  ContentReportStatus,
  ContentReportTargetType,
  InvestigateContentReportInput,
  RejectContentReportInput,
  ResolveContentReportInput,
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
  getAdminContentReport,
  investigateAdminContentReport,
  listAdminContentReports,
  rejectAdminContentReport,
  resolveAdminContentReport,
} from './storeLiteAdminApi';
import {
  contentCategoryLabels,
  contentReportStatusLabels,
  contentTargetLabels,
  displayValue,
  formatDateTime,
  statusTone,
} from './format';

const reportStatuses: Array<ContentReportStatus | ''> = ['', 'pending', 'investigating', 'resolved', 'rejected'];
const targetTypes: Array<ContentReportTargetType | ''> = ['', 'post', 'companion'];
const categories: Array<ContentReportCategory | ''> = ['', 'content_violation', 'safety', 'fraud', 'privacy_or_rights', 'other'];

export function ContentReportQueue({ canModerate }: { canModerate: boolean }) {
  const [status, setStatus] = useState<ContentReportStatus | ''>('pending');
  const [targetType, setTargetType] = useState<ContentReportTargetType | ''>('');
  const [category, setCategory] = useState<ContentReportCategory | ''>('');
  const [items, setItems] = useState<ContentReportAdminSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void listAdminContentReports({ status: status || undefined, targetType: targetType || undefined, category: category || undefined, limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setSelectedId((current) => (current && page.items.some((item) => item.id === current) ? current : page.items[0]?.id ?? null));
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause, '内容举报队列加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, reloadKey, status, targetType]);

  function refresh() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listAdminContentReports({ status: status || undefined, targetType: targetType || undefined, category: category || undefined, limit: 20, cursor: nextCursor });
      setItems((current) => mergeById(current, page.items));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(adminErrorMessage(cause, '更多内容举报加载失败'));
    } finally {
      setLoadingMore(false);
    }
  }

  function changeFilters(change: () => void) {
    setLoading(true);
    setSelectedId(null);
    change();
  }

  const list = (
    <section className="min-h-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 p-4">
        <Field label="状态"><select className="admin-input min-w-32" value={status} onChange={(event) => changeFilters(() => setStatus(event.target.value as ContentReportStatus | ''))}>{reportStatuses.map((value) => <option key={value || 'all'} value={value}>{value ? contentReportStatusLabels[value] : '全部状态'}</option>)}</select></Field>
        <Field label="对象"><select className="admin-input min-w-28" value={targetType} onChange={(event) => changeFilters(() => setTargetType(event.target.value as ContentReportTargetType | ''))}>{targetTypes.map((value) => <option key={value || 'all'} value={value}>{value ? contentTargetLabels[value] : '全部对象'}</option>)}</select></Field>
        <Field label="分类"><select className="admin-input min-w-32" value={category} onChange={(event) => changeFilters(() => setCategory(event.target.value as ContentReportCategory | ''))}>{categories.map((value) => <option key={value || 'all'} value={value}>{value ? contentCategoryLabels[value] : '全部分类'}</option>)}</select></Field>
        <div className="ml-auto"><RefreshButton loading={loading} onClick={refresh} /></div>
      </div>
      {loading ? <AdminLoading label="正在加载举报队列" /> : null}
      {!loading && error ? <div className="p-4"><AdminError message={error} onRetry={refresh} /></div> : null}
      {!loading && !error && items.length === 0 ? <AdminEmpty title="暂无内容举报" description="当前筛选条件下没有需要处理的举报。" /> : null}
      {!loading && items.length ? <div className="max-h-[calc(100dvh-250px)] overflow-y-auto">{items.map((item) => <ReportListItem key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}{hasMore ? <div className="p-4"><SecondaryButton type="button" disabled={loadingMore} onClick={() => void loadMore()} className="w-full">{loadingMore ? '加载中' : '加载更多'}</SecondaryButton></div> : null}</div> : null}
    </section>
  );

  const detail = selectedId ? <ReportDetail key={selectedId} id={selectedId} canModerate={canModerate} onChanged={refresh} /> : <section className="rounded-2xl border border-zinc-200 bg-white"><AdminEmpty title="选择一条举报" description="详情仅展示契约允许的举报人与目标公开摘要，不包含附件或联系电话。" /></section>;
  return <QueueLayout list={list} detail={detail} />;
}

function ReportListItem({ item, selected, onSelect }: { item: ContentReportAdminSummary; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`block w-full border-b border-zinc-100 p-4 text-left transition ${selected ? 'bg-zinc-950 text-white' : 'bg-white hover:bg-zinc-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="m-0 truncate text-sm font-black">{contentTargetLabels[item.targetType]} · {item.target.displayName}</p><p className={`mt-1 text-xs font-semibold ${selected ? 'text-white/55' : 'text-zinc-400'}`}>{contentCategoryLabels[item.category]} · {formatDateTime(item.createdAt)}</p></div><div className="flex items-center gap-2"><StatusBadge label={contentReportStatusLabels[item.status]} tone={statusTone(item.status)} /><ChevronRight size={15} /></div></div>{item.description ? <p className={`mt-3 line-clamp-2 text-xs font-semibold leading-5 ${selected ? 'text-white/70' : 'text-zinc-600'}`}>{item.description}</p> : null}<p className={`mt-2 text-[11px] font-bold ${selected ? 'text-white/45' : 'text-zinc-400'}`}>举报人：{item.reporter.nickname}</p></button>;
}

function ReportDetail({ id, canModerate, onChanged }: { id: string; canModerate: boolean; onChanged: () => void }) {
  const [item, setItem] = useState<ContentReportAdminDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void getAdminContentReport(id)
      .then((detail) => {
        if (!active) return;
        setItem(detail);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(adminErrorMessage(cause, '举报详情加载失败'));
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

  async function runAction(action: () => Promise<ContentReportAdminDetail>) {
    setMutating(true);
    setError('');
    try {
      setItem(await action());
      onChanged();
      return true;
    } catch (cause) {
      if (isConflictError(cause)) {
        try {
          setItem(await getAdminContentReport(id));
          onChanged();
        } catch {
          setItem(null);
        }
      }
      setError(adminErrorMessage(cause, '举报操作失败'));
      return false;
    } finally {
      setMutating(false);
    }
  }

  if (loading) return <section className="rounded-2xl border border-zinc-200 bg-white"><AdminLoading label="正在加载举报详情" /></section>;
  if (!item) return <section className="rounded-2xl border border-zinc-200 bg-white p-4"><AdminError message={error || '举报不存在'} onRetry={refreshDetail} /></section>;

  const canAct = item.status === 'pending' || item.status === 'investigating';
  return <section className="min-h-0 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 lg:p-5"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 pb-4"><div><p className="m-0 text-xs font-black uppercase tracking-wide text-zinc-400">举报编号</p><h2 className="mt-1 break-all text-base font-black">{item.id}</h2></div><StatusBadge label={contentReportStatusLabels[item.status]} tone={statusTone(item.status)} /></div>{error ? <div className="mt-4"><AdminError message={error} onRetry={refreshDetail} /></div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><DetailRow label="举报人">{item.reporter.nickname}<br /><span className="text-xs font-semibold text-zinc-500">{item.reporter.id}</span></DetailRow><DetailRow label="举报对象">{contentTargetLabels[item.targetType]} · {item.target.displayName}<br /><span className="text-xs font-semibold text-zinc-500">{item.target.id}</span></DetailRow><DetailRow label="举报分类">{contentCategoryLabels[item.category]}</DetailRow><DetailRow label="创建时间">{formatDateTime(item.createdAt)}</DetailRow><DetailRow label="处理时间">{formatDateTime(item.handledAt)}</DetailRow><DetailRow label="处理管理员 ID">{displayValue(item.handledByAdminId)}</DetailRow></div>{item.target.imageUrl ? <img className="mt-3 max-h-52 w-full rounded-xl bg-zinc-100 object-contain" src={item.target.imageUrl} alt={`${item.target.displayName}公开摘要`} /> : null}<div className="mt-3"><DetailRow label="举报说明">{displayValue(item.description)}</DetailRow></div>{item.result ? <div className="mt-3"><DetailRow label="公开处理结果">{resolutionLabel(item.result.resolutionAction)}<br />{item.result.publicMessage}</DetailRow></div> : null}<div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs font-semibold leading-5 text-zinc-500">本域不接受证据附件；运营台也不会展示被举报人的非公开身份信息或电话。</div>{canModerate && canAct ? <div className="mt-4 space-y-4">{item.status === 'pending' ? <InvestigateForm disabled={mutating} onSubmit={(input) => runAction(() => investigateAdminContentReport(id, input))} /> : null}<ResolveForm targetType={item.targetType} disabled={mutating} onSubmit={(input) => runAction(() => resolveAdminContentReport(id, input))} /><RejectForm disabled={mutating} onSubmit={(input) => runAction(() => rejectAdminContentReport(id, input))} /></div> : !canModerate ? <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-800"><ShieldAlert className="mt-0.5 shrink-0" size={15} />当前账号只有读取权限，审核动作不会显示。</div> : null}</section>;
}

function InvestigateForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (input: InvestigateContentReportInput) => Promise<boolean> }) {
  const [internalNote, setInternalNote] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const succeeded = await onSubmit({ ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }); if (succeeded) setInternalNote(''); }
  return <ActionSection title="开始调查"><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled}>{disabled ? '提交中' : '标记调查中'}</ActionButton></form></ActionSection>;
}

function ResolveForm({ targetType, disabled, onSubmit }: { targetType: ContentReportTargetType; disabled: boolean; onSubmit: (input: ResolveContentReportInput) => Promise<boolean> }) {
  const [resolutionAction, setResolutionAction] = useState<ContentReportResolutionAction>('no_action');
  const [publicMessage, setPublicMessage] = useState('举报已核查并完成处理');
  const [internalNote, setInternalNote] = useState('');
  const actions: ContentReportResolutionAction[] = targetType === 'post' ? ['no_action', 'remove_post'] : ['no_action', 'suspend_companion'];
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const succeeded = await onSubmit({ resolutionAction, publicMessage: publicMessage.trim(), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }); if (succeeded) setInternalNote(''); }
  return <ActionSection title="解决举报" description="处置动作已按举报对象类型限制，服务端仍会再次校验并原子执行。"><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="处置动作"><select className="admin-input" value={resolutionAction} onChange={(event) => setResolutionAction(event.target.value as ContentReportResolutionAction)}>{actions.map((action) => <option key={action} value={action}>{resolutionLabel(action)}</option>)}</select></Field><Field label="用户可见结果"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} required /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled}>{disabled ? '提交中' : '执行处置并解决'}</ActionButton></form></ActionSection>;
}

function RejectForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (input: RejectContentReportInput) => Promise<boolean> }) {
  const [publicMessage, setPublicMessage] = useState('经核查，当前信息不足以支持举报内容');
  const [internalNote, setInternalNote] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const succeeded = await onSubmit({ publicMessage: publicMessage.trim(), ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}) }); if (succeeded) setInternalNote(''); }
  return <ActionSection title="驳回举报"><form className="space-y-3" onSubmit={(event) => void submit(event)}><Field label="用户可见结果"><textarea className="admin-input admin-textarea" value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} maxLength={1000} required /></Field><Field label="内部备注（仅审计，可选）"><textarea className="admin-input admin-textarea" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></Field><ActionButton type="submit" disabled={disabled} className="bg-rose-700">{disabled ? '提交中' : '确认驳回'}</ActionButton></form></ActionSection>;
}

function resolutionLabel(value: ContentReportResolutionAction) {
  return { no_action: '不处置目标', remove_post: '下架作品', suspend_companion: '暂停摄影师' }[value];
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}
