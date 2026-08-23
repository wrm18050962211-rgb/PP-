import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleX,
  ClipboardList,
  Clock3,
  Copy,
  Database,
  FileSearch,
  Headphones,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRoundX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  BlockedCompanion,
  ContentReportCategory,
  ContentReportConsumerDetail,
  ContentReportConsumerSummary,
  ContentReportResolutionAction,
  ContentReportStatus,
  ContentReportTargetType,
  UserRequestConsumerDetail,
  UserRequestConsumerSummary,
  UserRequestStatus,
  UserRequestSupportCategory,
  UserRequestType,
} from '../../types/api';
import {
  cancelStoreLiteUserRequest,
  clearStoreLiteComplianceRequestId,
  createStoreLiteContentReport,
  createStoreLiteUserRequest,
  getMyStoreLiteContentReport,
  getOrCreateStoreLiteComplianceRequestId,
  getStoreLiteUserRequest,
  listMyStoreLiteContentReports,
  listStoreLiteBlockedCompanions,
  listStoreLiteUserRequests,
  unblockStoreLiteCompanion,
} from '../storeLiteComplianceService';
import { formatStoreLiteDateTime, StoreLiteError, StoreLiteLoading, StoreLiteNotice, StoreLitePageHeader } from '../StoreLiteUi';

const requestTypeMeta: Record<UserRequestType, { label: string; description: string; icon: typeof Headphones }> = {
  support: { label: '联系客服', description: '提交预约、内容安全或账号问题', icon: Headphones },
  data_access: { label: '访问个人数据', description: '了解平台保存了哪些个人数据', icon: FileSearch },
  data_copy: { label: '获取数据副本', description: '申请一份可阅读的数据副本', icon: Copy },
  account_deletion: { label: '删除账号', description: '提交账号及关联数据删除请求', icon: Trash2 },
};

const requestStatusMeta: Record<UserRequestStatus, { label: string; color: string; icon: typeof Clock3 }> = {
  submitted: { label: '已提交', color: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Clock3 },
  processing: { label: '处理中', color: 'bg-sky-50 text-sky-800 ring-sky-200', icon: RefreshCw },
  completed: { label: '已完成', color: 'bg-emerald-50 text-emerald-800 ring-emerald-200', icon: CheckCircle2 },
  declined: { label: '未受理', color: 'bg-rose-50 text-rose-800 ring-rose-200', icon: CircleX },
  cancelled: { label: '已取消', color: 'bg-zinc-100 text-zinc-600 ring-zinc-200', icon: CircleX },
};

const reportStatusMeta: Record<ContentReportStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-amber-50 text-amber-800 ring-amber-200' },
  investigating: { label: '调查中', color: 'bg-sky-50 text-sky-800 ring-sky-200' },
  resolved: { label: '已处理', color: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  rejected: { label: '未采纳', color: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
};

const supportCategoryLabels: Record<UserRequestSupportCategory, string> = {
  booking: '预约问题',
  safety: '内容与安全',
  account: '账号问题',
  privacy: '隐私问题',
  other: '其他问题',
};

const reportCategoryLabels: Record<ContentReportCategory, string> = {
  content_violation: '内容违规',
  safety: '安全风险',
  fraud: '虚假或欺诈',
  privacy_or_rights: '隐私或权利问题',
  other: '其他问题',
};

export function StoreLiteComplianceCenterPage() {
  const [requestType, setRequestType] = useState<UserRequestType>('support');
  const [supportCategory, setSupportCategory] = useState<UserRequestSupportCategory>('other');
  const [bookingRequestId, setBookingRequestId] = useState('');
  const [description, setDescription] = useState('');
  const [deletionAcknowledged, setDeletionAcknowledged] = useState(false);
  const [deletionPhrase, setDeletionPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<UserRequestConsumerDetail | null>(null);
  const [error, setError] = useState('');

  async function submit() {
    if (submitting) return;
    if (requestType === 'account_deletion') {
      if (!deletionAcknowledged || deletionPhrase.trim() !== '删除账号') {
        setError('请勾选确认，并输入“删除账号”后再提交');
        return;
      }
      if (!window.confirm('确认提交账号删除请求吗？处理完成后将无法继续使用该账号。')) return;
    }
    const workflow = `user-request:${requestType}`;
    setSubmitting(true);
    try {
      const next = await createStoreLiteUserRequest({
        requestType,
        ...(requestType === 'support' ? { supportCategory } : {}),
        ...(requestType === 'support' && bookingRequestId.trim() ? { bookingRequestId: bookingRequestId.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        clientRequestId: getOrCreateStoreLiteComplianceRequestId(workflow),
      });
      clearStoreLiteComplianceRequestId(workflow);
      setCreated(next);
      setDescription('');
      setBookingRequestId('');
      setDeletionAcknowledged(false);
      setDeletionPhrase('');
      setError('');
    } catch (cause) {
      setError(errorText(cause, '请求提交失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StoreLitePageHeader title="客服与数据权利" eyebrow="Support & privacy" />
      <div className="space-y-5 px-4 py-5">
        <StoreLiteNotice>请选择需要平台处理的事项。每次提交都会生成可查询的状态记录。</StoreLiteNotice>

        <section className="grid grid-cols-2 gap-3">
          {(Object.keys(requestTypeMeta) as UserRequestType[]).map((type) => {
            const item = requestTypeMeta[type];
            const Icon = item.icon;
            const active = requestType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setRequestType(type);
                  setCreated(null);
                  setError('');
                }}
                className={`rounded-2xl p-4 text-left ring-1 transition ${active ? 'bg-zinc-950 text-white ring-zinc-950' : 'bg-white text-zinc-950 ring-zinc-200'}`}
              >
                <Icon size={21} />
                <span className="mt-4 block text-sm font-black">{item.label}</span>
                <span className={`mt-1 block text-xs font-semibold leading-5 ${active ? 'text-white/55' : 'text-zinc-400'}`}>{item.description}</span>
              </button>
            );
          })}
        </section>

        <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-200">
          <div>
            <p className="text-xs font-black text-zinc-400">当前事项</p>
            <h2 className="mt-1 text-xl font-black">{requestTypeMeta[requestType].label}</h2>
          </div>

          {requestType === 'support' ? (
            <>
              <Field label="问题类型">
                <select value={supportCategory} onChange={(event) => setSupportCategory(event.target.value as UserRequestSupportCategory)} className="store-lite-input">
                  {(Object.keys(supportCategoryLabels) as UserRequestSupportCategory[]).map((category) => <option key={category} value={category}>{supportCategoryLabels[category]}</option>)}
                </select>
              </Field>
              <Field label="关联预约编号（可选）">
                <input value={bookingRequestId} maxLength={100} onChange={(event) => setBookingRequestId(event.target.value)} placeholder="仅填写当前账号下的预约编号" className="store-lite-input" />
              </Field>
            </>
          ) : null}

          <Field label="补充说明（可选）">
            <textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="请说明希望平台协助处理的内容" className="min-h-28 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none ring-1 ring-zinc-200 focus:ring-zinc-950" />
            <p className="mt-1 text-right text-[11px] font-bold text-zinc-400">{description.length}/2000</p>
          </Field>

          {requestType === 'account_deletion' ? (
            <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-black text-rose-800">这是账号删除请求</p>
              <p className="text-xs font-semibold leading-5 text-rose-700">请求会先进入核验流程；系统完成处理后，账号将无法继续使用。处理完成前可在请求详情中取消。</p>
              <label className="flex items-start gap-3 text-xs font-bold leading-5 text-rose-800"><input type="checkbox" checked={deletionAcknowledged} onChange={(event) => setDeletionAcknowledged(event.target.checked)} className="mt-1" />我理解账号删除完成后无法恢复。</label>
              <Field label="输入“删除账号”确认">
                <input value={deletionPhrase} onChange={(event) => setDeletionPhrase(event.target.value)} className="store-lite-input" />
              </Field>
            </div>
          ) : null}

          {created ? (
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 ring-1 ring-emerald-200">
              <p className="text-sm font-black">请求已由平台接收</p>
              <Link to={`/compliance/requests/${encodeURIComponent(created.id)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-black">查看处理状态<ChevronRight size={14} /></Link>
            </div>
          ) : null}
          {error ? <StoreLiteError message={error} /> : null}
          <button type="button" disabled={submitting || Boolean(created)} onClick={() => void submit()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300"><Send size={17} />{submitting ? '提交中' : created ? '已提交' : '提交请求'}</button>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
          <CenterLink to="/compliance/requests" icon={ClipboardList} title="我的请求" description="查看处理进度或取消请求" />
          <CenterLink to="/compliance/reports" icon={ShieldAlert} title="我的举报" description="查看作品与摄影师举报结果" />
          <CenterLink to="/compliance/blocked" icon={Ban} title="已屏蔽摄影师" description="管理不再展示的摄影师" />
        </section>
      </div>
    </>
  );
}

export function StoreLiteUserRequestsPage() {
  const [items, setItems] = useState<UserRequestConsumerSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void listStoreLiteUserRequests({ limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, '请求记录加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function load(reset = true) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await listStoreLiteUserRequests({ limit: 20, cursor: reset ? undefined : nextCursor ?? undefined });
      setItems((current) => (reset ? page.items : mergeById(current, page.items)));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(errorText(cause, '请求记录加载失败，请稍后重试'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  return (
    <>
      <StoreLitePageHeader title="我的请求" eyebrow="Requests" />
      <ListRefresh loading={loading} onRefresh={() => void load(true)} />
      {loading ? <StoreLiteLoading label="正在加载请求记录" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load(true)} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState icon={ClipboardList} title="还没有请求记录" description="可以从客服与数据权利中心提交请求。" actionTo="/compliance" actionLabel="前往提交" /> : null}
      <section className="space-y-3 px-4 py-4">
        {items.map((item) => <UserRequestCard key={item.id} item={item} />)}
      </section>
      <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={() => void load(false)} />
    </>
  );
}

export function StoreLiteUserRequestDetailPage() {
  const { userRequestId = '' } = useParams();
  const [item, setItem] = useState<UserRequestConsumerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getStoreLiteUserRequest(userRequestId)
      .then((next) => {
        if (!active) return;
        setItem(next);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, '请求详情加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userRequestId]);

  async function load() {
    setLoading(true);
    try {
      setItem(await getStoreLiteUserRequest(userRequestId));
      setError('');
    } catch (cause) {
      setError(errorText(cause, '请求详情加载失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!item || cancelling || !window.confirm('确认取消这条请求吗？')) return;
    setCancelling(true);
    try {
      setItem(await cancelStoreLiteUserRequest(item.id, { reasonCode: 'user_cancelled', reason: '用户在 App 内主动取消' }));
      setError('');
    } catch (cause) {
      setError(errorText(cause, '取消请求失败，请稍后重试'));
    } finally {
      setCancelling(false);
    }
  }

  if (loading && !item) return <StoreLiteLoading label="正在加载请求详情" />;
  if (!item) return <StoreLiteError message={error || '这条请求不存在或已不可查看'} onRetry={() => void load()} />;
  const meta = requestStatusMeta[item.status];
  const StatusIcon = meta.icon;

  return (
    <>
      <StoreLitePageHeader title="请求详情" eyebrow={item.id.slice(0, 12)} />
      <div className="space-y-4 px-4 py-5">
        <section className={`rounded-2xl p-4 ring-1 ${meta.color}`}><div className="flex items-center gap-3"><StatusIcon size={22} /><div><h2 className="text-lg font-black">{meta.label}</h2><p className="mt-1 text-xs font-bold opacity-70">最后更新 {formatStoreLiteDateTime(item.updatedAt)}</p></div></div></section>
        {item.requestType === 'account_deletion' && (item.status === 'submitted' || item.status === 'processing') ? <StoreLiteNotice>账号删除请求尚未完成；完成前可在本页取消。</StoreLiteNotice> : null}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-xs font-black text-zinc-400">事项</p>
          <p className="mt-2 text-base font-black">{requestTypeMeta[item.requestType].label}</p>
          {item.supportCategory ? <p className="mt-2 text-sm font-semibold text-zinc-500">{supportCategoryLabels[item.supportCategory]}</p> : null}
          {item.bookingRequestId ? <p className="mt-2 break-all text-xs font-semibold text-zinc-400">关联预约：{item.bookingRequestId}</p> : null}
          {item.description ? <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-700">{item.description}</p> : null}
        </section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between"><h3 className="text-sm font-black">处理记录</h3><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 text-xs font-black text-zinc-500"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />刷新</button></div>
          <div className="mt-4 space-y-4">
            {item.statusLogs.map((log, index) => <StatusLog key={log.id} label={requestStatusMeta[log.toStatus].label} message={log.publicMessage || defaultRequestLogMessage(log.toStatus)} createdAt={log.createdAt} last={index === item.statusLogs.length - 1} />)}
          </div>
        </section>
        {error ? <StoreLiteError message={error} /> : null}
        {item.status === 'submitted' || item.status === 'processing' ? <button type="button" onClick={() => void cancel()} disabled={cancelling} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-rose-600 ring-1 ring-rose-200 disabled:text-zinc-300"><RotateCcw size={16} />{cancelling ? '取消中' : '取消这条请求'}</button> : null}
      </div>
    </>
  );
}

export function StoreLiteContentReportForm({
  targetType,
  targetId,
  targetLabel,
  onCreated,
}: {
  targetType: ContentReportTargetType;
  targetId: string;
  targetLabel: string;
  onCreated?: (report: ContentReportConsumerDetail) => void;
}) {
  const [category, setCategory] = useState<ContentReportCategory>('other');
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState<ContentReportConsumerDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (submitting) return;
    const workflow = `content-report:${targetType}:${targetId}`;
    setSubmitting(true);
    try {
      const next = await createStoreLiteContentReport({
        targetType,
        targetId,
        category,
        ...(description.trim() ? { description: description.trim() } : {}),
        clientRequestId: getOrCreateStoreLiteComplianceRequestId(workflow),
      });
      clearStoreLiteComplianceRequestId(workflow);
      setCreated(next);
      setError('');
      onCreated?.(next);
    } catch (cause) {
      setError(errorText(cause, '举报提交失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-zinc-200">
      <div><p className="text-xs font-black text-zinc-400">举报对象</p><p className="mt-1 text-base font-black">{targetLabel}</p></div>
      <Field label="问题类型"><select value={category} onChange={(event) => setCategory(event.target.value as ContentReportCategory)} className="store-lite-input">{(Object.keys(reportCategoryLabels) as ContentReportCategory[]).map((item) => <option key={item} value={item}>{reportCategoryLabels[item]}</option>)}</select></Field>
      <Field label="补充说明（可选）"><textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="请客观说明需要平台核查的内容" className="min-h-28 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm font-semibold leading-6 outline-none ring-1 ring-zinc-200 focus:ring-zinc-950" /><p className="mt-1 text-right text-[11px] font-bold text-zinc-400">{description.length}/2000</p></Field>
      {created ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-800 ring-1 ring-emerald-200">举报已由平台接收，可在“我的举报”查看状态。</div> : null}
      {error ? <StoreLiteError message={error} /> : null}
      <button type="button" disabled={submitting || Boolean(created)} onClick={() => void submit()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white disabled:bg-zinc-300"><ShieldAlert size={17} />{submitting ? '提交中' : created ? '已提交' : '提交举报'}</button>
    </section>
  );
}

export function StoreLiteContentReportPage() {
  const { targetType = '', targetId = '' } = useParams();
  if (!['post', 'companion'].includes(targetType) || !targetId) {
    return <StoreLiteError message="举报对象不存在或已不可查看" />;
  }

  const normalizedTargetType = targetType as ContentReportTargetType;
  return (
    <>
      <StoreLitePageHeader title="举报" eyebrow="Safety" />
      <div className="space-y-4 px-4 py-5">
        <StoreLiteNotice>平台会核查举报内容。请客观描述问题；本版本不支持上传附件。</StoreLiteNotice>
        <StoreLiteContentReportForm
          targetType={normalizedTargetType}
          targetId={targetId}
          targetLabel={normalizedTargetType === 'post' ? '这组作品' : '这位摄影师'}
        />
      </div>
    </>
  );
}

export function StoreLiteContentReportsPage() {
  const [items, setItems] = useState<ContentReportConsumerSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void listMyStoreLiteContentReports({ limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, '举报记录加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function load(reset = true) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await listMyStoreLiteContentReports({ limit: 20, cursor: reset ? undefined : nextCursor ?? undefined });
      setItems((current) => (reset ? page.items : mergeById(current, page.items)));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(errorText(cause, '举报记录加载失败，请稍后重试'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  return (
    <>
      <StoreLitePageHeader title="我的举报" eyebrow="Safety reports" />
      <ListRefresh loading={loading} onRefresh={() => void load(true)} />
      {loading ? <StoreLiteLoading label="正在加载举报记录" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load(true)} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState icon={ShieldCheck} title="还没有举报记录" description="在作品或摄影师页面发现问题时可以提交举报。" /> : null}
      <section className="space-y-3 px-4 py-4">{items.map((item) => <ContentReportCard key={item.id} item={item} />)}</section>
      <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={() => void load(false)} />
    </>
  );
}

export function StoreLiteContentReportDetailPage() {
  const { contentReportId = '' } = useParams();
  const [item, setItem] = useState<ContentReportConsumerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getMyStoreLiteContentReport(contentReportId)
      .then((next) => {
        if (!active) return;
        setItem(next);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, '举报详情加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [contentReportId]);

  async function load() {
    setLoading(true);
    try {
      setItem(await getMyStoreLiteContentReport(contentReportId));
      setError('');
    } catch (cause) {
      setError(errorText(cause, '举报详情加载失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }

  if (loading && !item) return <StoreLiteLoading label="正在加载举报详情" />;
  if (!item) return <StoreLiteError message={error || '这条举报不存在或已不可查看'} onRetry={() => void load()} />;
  const meta = reportStatusMeta[item.status];

  return (
    <>
      <StoreLitePageHeader title="举报详情" eyebrow={item.id.slice(0, 12)} />
      <div className="space-y-4 px-4 py-5">
        <section className={`rounded-2xl p-4 ring-1 ${meta.color}`}><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">{meta.label}</h2><p className="mt-1 text-xs font-bold opacity-70">最后更新 {formatStoreLiteDateTime(item.updatedAt)}</p></div><button type="button" onClick={() => void load()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-full bg-white/60"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div></section>
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200"><p className="text-xs font-black text-zinc-400">举报内容</p><p className="mt-2 text-sm font-black">{targetTypeLabel(item.targetType)} · {reportCategoryLabels[item.category]}</p><p className="mt-2 break-all text-xs font-semibold text-zinc-400">对象编号：{item.targetId}</p>{item.description ? <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-700">{item.description}</p> : null}</section>
        {item.result ? <section className="rounded-2xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200"><p className="text-xs font-black text-emerald-700">平台处理结果</p><p className="mt-2 text-sm font-black">{resolutionActionLabel(item.result.resolutionAction)}</p><p className="mt-2 text-sm font-semibold leading-6">{item.result.publicMessage}</p></section> : <StoreLiteNotice>平台正在核查，请稍后刷新查看处理结果。</StoreLiteNotice>}
        {error ? <StoreLiteError message={error} /> : null}
      </div>
    </>
  );
}

export function StoreLiteBlockedCompanionsPage() {
  const [items, setItems] = useState<BlockedCompanion[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unblockingId, setUnblockingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void listStoreLiteBlockedCompanions({ limit: 20 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError('');
      })
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause, '屏蔽列表加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function load(reset = true) {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const page = await listStoreLiteBlockedCompanions({ limit: 20, cursor: reset ? undefined : nextCursor ?? undefined });
      setItems((current) => (reset ? page.items : mergeCompanions(current, page.items)));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setError('');
    } catch (cause) {
      setError(errorText(cause, '屏蔽列表加载失败，请稍后重试'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function unblock(item: BlockedCompanion) {
    if (unblockingId || !window.confirm(`确认解除对“${item.displayName}”的屏蔽吗？`)) return;
    setUnblockingId(item.companionId);
    try {
      await unblockStoreLiteCompanion(item.companionId);
      setItems((current) => current.filter((candidate) => candidate.companionId !== item.companionId));
      setError('');
    } catch (cause) {
      setError(errorText(cause, '解除屏蔽失败，请稍后重试'));
    } finally {
      setUnblockingId('');
    }
  }

  return (
    <>
      <StoreLitePageHeader title="已屏蔽摄影师" eyebrow="Blocked" />
      <ListRefresh loading={loading} onRefresh={() => void load(true)} />
      {loading ? <StoreLiteLoading label="正在加载屏蔽列表" /> : null}
      {!loading && error ? <StoreLiteError message={error} onRetry={() => void load(true)} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState icon={UserRoundX} title="没有已屏蔽摄影师" description="屏蔽后，对方及其作品不会出现在你的浏览结果中。" /> : null}
      <section className="space-y-3 px-4 py-4">
        {items.map((item) => <div key={item.companionId} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">{item.avatarUrl ? <img src={item.avatarUrl} alt={item.displayName} className="h-12 w-12 rounded-full bg-zinc-100 object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100"><Ban size={18} /></span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{item.displayName}</p><p className="mt-1 text-xs font-semibold text-zinc-400">{item.baseCity || '服务城市待确认'} · {formatStoreLiteDateTime(item.blockedAt)}</p></div><button type="button" disabled={Boolean(unblockingId)} onClick={() => void unblock(item)} className="h-9 shrink-0 rounded-full bg-zinc-100 px-3 text-xs font-black text-zinc-700 disabled:text-zinc-300">{unblockingId === item.companionId ? '处理中' : '解除'}</button></div>)}
      </section>
      <LoadMore hasMore={hasMore} loading={loadingMore} onLoad={() => void load(false)} />
    </>
  );
}

function UserRequestCard({ item }: { item: UserRequestConsumerSummary }) {
  const meta = requestStatusMeta[item.status];
  const StatusIcon = meta.icon;
  return <Link to={`/compliance/requests/${encodeURIComponent(item.id)}`} className="block rounded-2xl bg-white p-4 ring-1 ring-zinc-200"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-base font-black">{requestTypeMeta[item.requestType].label}</p><p className="mt-1 text-xs font-semibold text-zinc-400">{formatStoreLiteDateTime(item.createdAt)}</p></div><span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${meta.color}`}><StatusIcon size={12} />{meta.label}</span></div>{item.description ? <p className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-zinc-500">{item.description}</p> : null}</Link>;
}

function ContentReportCard({ item }: { item: ContentReportConsumerSummary }) {
  const meta = reportStatusMeta[item.status];
  return <Link to={`/compliance/reports/${encodeURIComponent(item.id)}`} className="block rounded-2xl bg-white p-4 ring-1 ring-zinc-200"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{targetTypeLabel(item.targetType)} · {reportCategoryLabels[item.category]}</p><p className="mt-1 text-xs font-semibold text-zinc-400">{formatStoreLiteDateTime(item.createdAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${meta.color}`}>{meta.label}</span></div>{item.result?.publicMessage ? <p className="mt-3 line-clamp-2 text-sm font-semibold text-zinc-500">{item.result.publicMessage}</p> : null}</Link>;
}

function CenterLink({ to, icon: Icon, title, description }: { to: string; icon: typeof ClipboardList; title: string; description: string }) {
  return <Link to={to} className="flex min-h-18 items-center gap-3 border-b border-zinc-100 px-4 last:border-0"><span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{title}</span><span className="mt-1 block truncate text-xs font-semibold text-zinc-400">{description}</span></span><ChevronRight size={17} className="text-zinc-300" /></Link>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-zinc-500">{label}</span>{children}</label>;
}

function ListRefresh({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return <div className="flex justify-end px-4 pt-4"><button type="button" onClick={onRefresh} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-black ring-1 ring-zinc-200"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新</button></div>;
}

function LoadMore({ hasMore, loading, onLoad }: { hasMore: boolean; loading: boolean; onLoad: () => void }) {
  return hasMore ? <div className="px-4 pb-7 text-center"><button type="button" disabled={loading} onClick={onLoad} className="h-11 rounded-full bg-zinc-950 px-7 text-sm font-black text-white disabled:bg-zinc-300">{loading ? '加载中' : '加载更多'}</button></div> : null;
}

function EmptyState({ icon: Icon, title, description, actionTo, actionLabel }: { icon: typeof Database; title: string; description: string; actionTo?: string; actionLabel?: string }) {
  return <div className="px-6 py-20 text-center"><Icon className="mx-auto text-zinc-300" size={34} /><p className="mt-4 text-base font-black">{title}</p><p className="mt-2 text-sm font-semibold leading-6 text-zinc-400">{description}</p>{actionTo && actionLabel ? <Link to={actionTo} className="mt-5 inline-flex h-11 items-center rounded-full bg-zinc-950 px-6 text-sm font-black text-white">{actionLabel}</Link> : null}</div>;
}

function StatusLog({ label, message, createdAt, last }: { label: string; message: string; createdAt: string; last: boolean }) {
  return <div className="grid grid-cols-[1rem_1fr] gap-3"><div className="flex flex-col items-center"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-zinc-950" />{!last ? <span className="mt-1 min-h-8 w-px flex-1 bg-zinc-200" /> : null}</div><div className="pb-1"><p className="text-sm font-black">{label}</p><p className="mt-1 text-xs font-semibold leading-5 text-zinc-500">{message}</p><p className="mt-1 text-[10px] font-bold text-zinc-400">{formatStoreLiteDateTime(createdAt)}</p></div></div>;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

function mergeCompanions(current: BlockedCompanion[], incoming: BlockedCompanion[]) {
  const byId = new Map(current.map((item) => [item.companionId, item]));
  for (const item of incoming) byId.set(item.companionId, item);
  return [...byId.values()];
}

function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function targetTypeLabel(value: ContentReportTargetType) {
  return value === 'post' ? '作品' : '摄影师';
}

function resolutionActionLabel(value: ContentReportResolutionAction) {
  if (value === 'remove_post') return '相关作品已处理';
  if (value === 'suspend_companion') return '相关摄影师已处理';
  return '平台已完成核查';
}

function defaultRequestLogMessage(status: UserRequestStatus) {
  const messages: Record<UserRequestStatus, string> = {
    submitted: '请求已提交',
    processing: '平台正在处理',
    completed: '请求已完成',
    declined: '请求未受理',
    cancelled: '请求已取消',
  };
  return messages[status];
}
