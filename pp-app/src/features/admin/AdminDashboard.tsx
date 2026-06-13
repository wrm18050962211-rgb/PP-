import {
  Banknote,
  Ban,
  Bell,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileSearch,
  Flag,
  LockKeyhole,
  MessageSquareWarning,
  PauseCircle,
  Settings,
  Shield,
  Snowflake,
  UserCheck,
  UserCog,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';
import { fetchAdminModerationData, syncAdminModerationAction } from '../../services/adminService';
import type { AdminActionType, AdminModerationData, AdminReportCase, AdminRiskMessageCase } from '../../types/api';
import type { AppOrder, OrderStatus, PublishedWorkDraft } from '../../types/domain';
import { formatMoney } from '../../utils/money';

type AdminModuleKey = 'companions' | 'works' | 'orders' | 'risk' | 'reports' | 'accounts' | 'finance' | 'settings';

type RiskCase = {
  id: string;
  orderNo: string;
  sender: string;
  target: string;
  message: string;
  level: '高危' | '中危';
  status: '待处理' | '已拦截' | '已放行';
  hits: string[];
};

type ReportCase = {
  id: string;
  type: string;
  reporter: string;
  target: string;
  orderNo: string;
  status: '待处理' | '处理中' | '已完结';
  summary: string;
};

type SettlementCase = {
  id: string;
  companion: string;
  orderNo: string;
  grossCents: number;
  commissionCents: number;
  payableCents: number;
  status: '待结算' | '冻结中' | '已结算';
};

type SystemConfig = {
  id: string;
  name: string;
  value: string;
  status: '已启用' | '待完善';
};

type AccountCase = {
  id: string;
  name: string;
  role: '创作者' | '摄影师' | '普通用户';
  status: '正常' | '观察中' | '限制中' | '已停用';
  risk: string;
  lastActive: string;
};

const modules: Array<{ key: AdminModuleKey; label: string; icon: React.ElementType }> = [
  { key: 'companions', label: '陪拍者审核', icon: UserCheck },
  { key: 'works', label: '作品审核', icon: FileSearch },
  { key: 'orders', label: '订单管理', icon: CreditCard },
  { key: 'risk', label: '消息风控', icon: MessageSquareWarning },
  { key: 'reports', label: '举报处理', icon: Flag },
  { key: 'accounts', label: '账号状态', icon: UserCog },
  { key: 'finance', label: '财务结算', icon: Banknote },
  { key: 'settings', label: '系统配置', icon: Settings },
];

const riskSeed: RiskCase[] = [
  {
    id: 'risk-1',
    orderNo: 'PP26052401',
    sender: 'Mori',
    target: '用户 201',
    message: '我们可以加微信发原图，私下付精修会便宜一点。',
    level: '高危',
    status: '待处理',
    hits: ['微信', '私下付'],
  },
  {
    id: 'risk-2',
    orderNo: 'PP26052405',
    sender: '用户 203',
    target: 'Echo',
    message: '方便留个电话吗？现场找不到人的时候联系快一点。',
    level: '中危',
    status: '待处理',
    hits: ['电话', '联系'],
  },
];

const reportSeed: ReportCase[] = [
  {
    id: 'report-1',
    type: '爽约纠纷',
    reporter: '用户 202',
    target: 'Nana',
    orderNo: 'PP26052404',
    status: '待处理',
    summary: '用户反馈陪拍者迟到 40 分钟且未提前说明，需要核对聊天记录和定位。',
  },
  {
    id: 'report-2',
    type: '照片质量',
    reporter: '用户 203',
    target: 'Echo',
    orderNo: 'PP26052403',
    status: '处理中',
    summary: '用户认为精修结果与样片差异较大，申请部分退款。',
  },
];

const settlementSeed: SettlementCase[] = [
  { id: 'settlement-1', companion: 'Mori', orderNo: 'PP26052401', grossCents: 48900, commissionCents: 7335, payableCents: 41565, status: '待结算' },
  { id: 'settlement-2', companion: 'Echo', orderNo: 'PP26052403', grossCents: 22900, commissionCents: 3435, payableCents: 19465, status: '已结算' },
  { id: 'settlement-3', companion: 'Nana', orderNo: 'PP26052404', grossCents: 36900, commissionCents: 5535, payableCents: 31365, status: '冻结中' },
];

const accountSeed: AccountCase[] = [
  { id: 'account-creator-1', name: 'Demo Creator', role: '创作者', status: '正常', risk: '内容发布稳定', lastActive: '今天 18:10' },
  { id: 'account-photographer-1', name: 'Mori', role: '摄影师', status: '观察中', risk: '近期出现 1 次联系方式拦截', lastActive: '今天 17:42' },
  { id: 'account-user-1', name: '用户 203', role: '普通用户', status: '限制中', risk: '举报处理中，聊天能力已临时限制', lastActive: '昨天 21:36' },
];

const configSeed: SystemConfig[] = [
  { id: 'config-1', name: '取消规则', value: '服务开始前 2 小时可免费取消', status: '已启用' },
  { id: 'config-2', name: '平台抽成', value: '15%', status: '已启用' },
  { id: 'config-3', name: '消息屏蔽词', value: '微信、VX、私下付、转账', status: '已启用' },
  { id: 'config-4', name: '高风险地点', value: '酒店房间、封闭私人空间', status: '待完善' },
];

export function AdminDashboard() {
  const { application, workDraft, orders, reviewApplication, reviewWork, updateOrderStatus } = useAppData();
  const [activeModule, setActiveModule] = useState<AdminModuleKey>('companions');
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? '');
  const [riskCases, setRiskCases] = useState(riskSeed);
  const [selectedRiskId, setSelectedRiskId] = useState(riskSeed[0]?.id ?? '');
  const [riskActionLogs, setRiskActionLogs] = useState<Record<string, string[]>>({});
  const [reportCases, setReportCases] = useState(reportSeed);
  const [selectedReportId, setSelectedReportId] = useState(reportSeed[0]?.id ?? '');
  const [reportActionLogs, setReportActionLogs] = useState<Record<string, string[]>>({});
  const [settlements, setSettlements] = useState(settlementSeed);
  const [selectedSettlementId, setSelectedSettlementId] = useState(settlementSeed[0]?.id ?? '');
  const [accounts, setAccounts] = useState(accountSeed);
  const [selectedAccountId, setSelectedAccountId] = useState(accountSeed[0]?.id ?? '');
  const [configs, setConfigs] = useState(configSeed);
  const [selectedConfigId, setSelectedConfigId] = useState(configSeed[0]?.id ?? '');

  useEffect(() => {
    let mounted = true;
    fetchAdminModerationData(orders).then((data) => {
      if (!mounted) return;
      const mapped = mapRemoteModerationData(data);
      setRiskCases(mapped.riskCases);
      setReportCases(mapped.reportCases);
      setSelectedRiskId(mapped.riskCases[0]?.id ?? '');
      setSelectedReportId(mapped.reportCases[0]?.id ?? '');
    });

    return () => {
      mounted = false;
    };
  }, [orders]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0];
  const selectedRisk = riskCases.find((item) => item.id === selectedRiskId) ?? riskCases[0];
  const selectedReport = reportCases.find((item) => item.id === selectedReportId) ?? reportCases[0];
  const selectedSettlement = settlements.find((item) => item.id === selectedSettlementId) ?? settlements[0];
  const selectedAccount = accounts.find((item) => item.id === selectedAccountId) ?? accounts[0];
  const selectedConfig = configs.find((item) => item.id === selectedConfigId) ?? configs[0];

  const metrics = useMemo(
    () => [
      { label: '待审陪拍者', value: application.reviewStatus === '待审核' ? '1' : '0' },
      { label: '待审作品', value: workDraft.reviewStatus === '待审核' ? '1' : '0' },
      { label: '订单总数', value: String(orders.length) },
      { label: '风控待处理', value: String(riskCases.filter((item) => item.status === '待处理').length) },
    ],
    [application.reviewStatus, orders.length, riskCases, workDraft.reviewStatus],
  );

  const pendingReports = reportCases.filter((item) => item.status !== '已完结').length;
  const pendingSettlementCents = settlements.filter((item) => item.status === '待结算').reduce((sum, item) => sum + item.payableCents, 0);

  function recordRiskAction(id: string, action: string, actionType: AdminActionType) {
    setRiskActionLogs((logs) => ({ ...logs, [id]: [action, ...(logs[id] ?? [])] }));
    void syncAdminModerationAction(id, actionType, action);
  }

  function recordReportAction(id: string, action: string, actionType: AdminActionType) {
    setReportActionLogs((logs) => ({ ...logs, [id]: [action, ...(logs[id] ?? [])] }));
    void syncAdminModerationAction(id, actionType, action);
  }

  return (
    <div className="min-h-dvh pp-page pb-8 text-[#27211f]">
      <header className="sticky top-0 z-20 border-b border-[#eadfd8] bg-[#fbf7f2]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-[#e85d75]">PP 运营后台</p>
            <h1 className="mt-1 text-xl font-black text-[#3f302c] md:text-2xl">审核、风控、订单和结算</h1>
          </div>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/78 text-[#6f625d] ring-1 ring-[#eadfd8]" aria-label="通知">
            <Bell size={18} />
          </button>
        </div>
        <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto">
          {modules.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.key;
            return (
              <button
                key={item.key}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${active ? 'bg-[#3f302c] text-white' : 'bg-white/78 text-[#6f625d] ring-1 ring-[#eadfd8]'}`}
                onClick={() => setActiveModule(item.key)}
              >
                <Icon size={15} />
                {item.label}
              </button>
            );
          })}
        </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[20px] bg-white/82 p-4 shadow-sm ring-1 ring-[#eadfd8]">
              <p className="text-2xl font-black text-[#3f302c]">{metric.value}</p>
              <p className="mt-1 text-xs font-medium text-[#7a6b64]">{metric.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 md:max-w-xl">
          <SummaryTile label="举报处理中" value={`${pendingReports} 个`} icon={<Flag size={17} />} />
          <SummaryTile label="待结算金额" value={formatMoney(pendingSettlementCents)} icon={<Banknote size={17} />} />
        </section>

        <section className="mt-5">
          {activeModule === 'companions' && (
            <CompanionAuditPanel application={application} onApprove={() => reviewApplication('已通过')} onReject={() => reviewApplication('需修改')} />
          )}
          {activeModule === 'works' && <WorkAuditPanel workDraft={workDraft} onApprove={() => reviewWork('已通过')} onReject={() => reviewWork('需修改')} />}
          {activeModule === 'orders' && selectedOrder && (
            <OrderPanel orders={orders} selectedOrder={selectedOrder} onSelect={setSelectedOrderId} onUpdateStatus={updateOrderStatus} />
          )}
          {activeModule === 'risk' && selectedRisk && (
            <RiskPanel
              cases={riskCases}
              selectedCase={selectedRisk}
              selectedOrder={orders.find((order) => order.orderNo === selectedRisk.orderNo)}
              actionLogs={riskActionLogs[selectedRisk.id] ?? []}
              onSelect={setSelectedRiskId}
              onUpdate={(id, status) => setRiskCases((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))}
              onRecordAction={recordRiskAction}
              onFreezeOrder={(orderNo) => {
                const order = orders.find((item) => item.orderNo === orderNo);
                if (order) updateOrderStatus(order.id, 'disputed');
              }}
            />
          )}
          {activeModule === 'reports' && selectedReport && (
            <ReportPanel
              reports={reportCases}
              selectedReport={selectedReport}
              selectedOrder={orders.find((order) => order.orderNo === selectedReport.orderNo)}
              actionLogs={reportActionLogs[selectedReport.id] ?? []}
              onSelect={setSelectedReportId}
              onUpdate={(id, status) => setReportCases((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))}
              onRecordAction={recordReportAction}
              onFreezeOrder={(orderNo) => {
                const order = orders.find((item) => item.orderNo === orderNo);
                if (order) updateOrderStatus(order.id, 'disputed');
              }}
            />
          )}
          {activeModule === 'accounts' && selectedAccount && (
            <AccountPanel
              accounts={accounts}
              selectedAccount={selectedAccount}
              onSelect={setSelectedAccountId}
              onUpdate={(id, status) => setAccounts((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))}
            />
          )}
          {activeModule === 'finance' && selectedSettlement && (
            <FinancePanel
              settlements={settlements}
              selectedSettlement={selectedSettlement}
              onSelect={setSelectedSettlementId}
              onUpdate={(id, status) => setSettlements((items) => items.map((item) => (item.id === id ? { ...item, status } : item)))}
            />
          )}
          {activeModule === 'settings' && selectedConfig && (
            <SettingsPanel
              configs={configs}
              selectedConfig={selectedConfig}
              onSelect={setSelectedConfigId}
              onUpdate={(id) => setConfigs((items) => items.map((item) => (item.id === id ? { ...item, status: '已启用' } : item)))}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function SummaryTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-[#3f302c] p-4 text-white">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-black">{value}</p>
        <p className="mt-0.5 truncate text-xs text-white/65">{label}</p>
      </div>
    </div>
  );
}

function CompanionAuditPanel({
  application,
  onApprove,
  onReject,
}: {
  application: ReturnType<typeof useAppData>['application'];
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <ModuleFrame title="陪拍者审核" count={application.reviewStatus}>
      <DetailCard
        eyebrow={`${application.city} · ${application.ageRange} · ${application.gender}`}
        title={application.nickname || '未填写昵称'}
        status={application.reviewStatus}
        imageUrl={application.avatarImage}
      >
        <InfoGrid
          items={[
            ['服务报价', `¥${application.price || '-'} / ${application.extra || '无附加项'}`],
            ['服务半径', `${application.serviceRadiusKm}km`],
            ['实名状态', application.realName ? '已填写实名资料' : '实名资料待补充'],
            ['最近更新', formatDate(application.updatedAt)],
          ]}
        />
        <p className="mt-4 text-sm leading-6 text-zinc-600">{application.bio || application.strengths}</p>
        <ChipGroup values={[...application.areas, ...application.services, ...application.tags].slice(0, 10)} />
        <ActionBar disabled={application.reviewStatus !== '待审核'} onApprove={onApprove} onReject={onReject} approveText="通过审核" rejectText="要求修改" />
      </DetailCard>
    </ModuleFrame>
  );
}

function WorkAuditPanel({ workDraft, onApprove, onReject }: { workDraft: PublishedWorkDraft; onApprove: () => void; onReject: () => void }) {
  return (
    <ModuleFrame title="作品审核" count={workDraft.reviewStatus}>
      <DetailCard eyebrow={`${workDraft.activity} · ${workDraft.timeLabel}`} title={workDraft.location} status={workDraft.reviewStatus} imageUrl={workDraft.images[0]?.url}>
        <p className="text-sm leading-6 text-zinc-600">{workDraft.caption}</p>
        <InfoGrid
          items={[
            ['图片数量', `${workDraft.images.length} 张`],
            ['封面 ID', workDraft.coverImageId || '-'],
            ['最近更新', formatDate(workDraft.updatedAt)],
            ['状态', workDraft.reviewStatus],
          ]}
        />
        <ChipGroup values={workDraft.tags} />
        <ActionBar disabled={workDraft.reviewStatus !== '待审核'} onApprove={onApprove} onReject={onReject} approveText="发布通过" rejectText="退回修改" />
      </DetailCard>
    </ModuleFrame>
  );
}

function OrderPanel({
  orders,
  selectedOrder,
  onSelect,
  onUpdateStatus,
}: {
  orders: AppOrder[];
  selectedOrder: AppOrder;
  onSelect: (id: string) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
}) {
  return (
    <ModuleFrame title="订单管理" count={`${orders.length} 单`}>
      <ListDetailLayout
        list={orders.map((order) => (
          <ListRow key={order.id} active={order.id === selectedOrder.id} title={order.title} subtitle={`${order.orderNo} · ${order.companion}`} meta={order.statusText} onClick={() => onSelect(order.id)} />
        ))}
        detail={
          <DetailCard eyebrow={selectedOrder.orderNo} title={selectedOrder.title} status={selectedOrder.statusText}>
            <InfoGrid
              items={[
                ['陪拍者', selectedOrder.companion],
                ['服务时间', selectedOrder.time],
                ['地点', selectedOrder.place],
                ['订单金额', selectedOrder.amountText],
                ['服务项目', selectedOrder.activityName ?? '-'],
                ['创建时间', formatDate(selectedOrder.createdAt)],
              ]}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AdminButton onClick={() => onUpdateStatus(selectedOrder.id, 'confirmed')} disabled={selectedOrder.status === 'confirmed'}>
                确认服务
              </AdminButton>
              <AdminButton variant="soft" onClick={() => onUpdateStatus(selectedOrder.id, 'disputed')} disabled={selectedOrder.status === 'disputed'}>
                标记争议
              </AdminButton>
              <AdminButton variant="soft" onClick={() => onUpdateStatus(selectedOrder.id, 'refunding')} disabled={selectedOrder.status === 'refunding'}>
                发起退款
              </AdminButton>
              <AdminButton variant="danger" onClick={() => onUpdateStatus(selectedOrder.id, 'cancelled')} disabled={selectedOrder.status === 'cancelled'}>
                取消订单
              </AdminButton>
            </div>
          </DetailCard>
        }
      />
    </ModuleFrame>
  );
}

function RiskPanel({
  cases,
  selectedCase,
  selectedOrder,
  actionLogs,
  onSelect,
  onUpdate,
  onRecordAction,
  onFreezeOrder,
}: {
  cases: RiskCase[];
  selectedCase: RiskCase;
  selectedOrder?: AppOrder;
  actionLogs: string[];
  onSelect: (id: string) => void;
  onUpdate: (id: string, status: RiskCase['status']) => void;
  onRecordAction: (id: string, action: string, actionType: AdminActionType) => void;
  onFreezeOrder: (orderNo: string) => void;
}) {
  const contextMessages = [
    { from: selectedCase.target, text: '我想确认一下集合地点和拍摄风格，尽量自然一点。' },
    { from: selectedCase.sender, text: '可以，我会按订单路线先沟通时间和光线。' },
    { from: selectedCase.sender, text: selectedCase.message, risk: true },
    { from: '系统', text: '消息已被系统拦截，等待运营复核。' },
  ];

  function record(status: RiskCase['status'], action: string) {
    onUpdate(selectedCase.id, status);
    onRecordAction(selectedCase.id, action, status === '已放行' ? 'release_message' : 'confirm_violation');
  }

  return (
    <ModuleFrame title="消息风控查看" count={`${cases.filter((item) => item.status === '待处理').length} 待处理`}>
      <ListDetailLayout
        list={cases.map((item) => (
          <ListRow key={item.id} active={item.id === selectedCase.id} title={`${item.sender} → ${item.target}`} subtitle={item.orderNo} meta={item.level} onClick={() => onSelect(item.id)} />
        ))}
        detail={
          <DetailCard eyebrow={selectedCase.orderNo} title={`${selectedCase.sender} → ${selectedCase.target}`} status={selectedCase.status}>
            <p className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-rose-900 ring-1 ring-rose-100">{selectedCase.message}</p>
            <InfoGrid
              items={[
                ['风险等级', selectedCase.level],
                ['订单编号', selectedCase.orderNo],
                ['订单状态', selectedOrder ? selectedOrder.statusText : '-'],
                ['订单金额', selectedOrder ? selectedOrder.amountText : '-'],
                ['订单标题', selectedOrder ? selectedOrder.title : '-'],
                ['会话双方', `${selectedCase.sender} / ${selectedCase.target}`],
              ]}
            />
            <ChipGroup values={selectedCase.hits.map((hit) => `命中：${hit}`)} />
            <div className="mt-4 rounded-lg bg-zinc-50 p-3">
              <p className="text-xs font-black text-zinc-500">订单和聊天上下文</p>
              <div className="mt-3 space-y-2">
                {contextMessages.map((message) => (
                  <div key={`${message.from}-${message.text}`} className={`rounded-lg p-3 text-xs leading-5 ${message.risk ? 'bg-rose-50 text-rose-800' : 'bg-white text-zinc-700'}`}>
                    <p className="font-black">{message.from}</p>
                    <p className="mt-1">{message.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AdminButton onClick={() => record('已放行', '已放行消息')}>放行消息</AdminButton>
              <AdminButton variant="danger" onClick={() => record('已拦截', '已确认为违规')}>
                确认为违规
              </AdminButton>
              <AdminButton variant="soft" icon={<Flag size={16} />} onClick={() => onRecordAction(selectedCase.id, '已警告用户', 'warn_user')}>
                警告用户
              </AdminButton>
              <AdminButton variant="soft" icon={<Flag size={16} />} onClick={() => onRecordAction(selectedCase.id, '已警告陪拍者', 'warn_companion')}>
                警告陪拍者
              </AdminButton>
              <AdminButton variant="soft" icon={<Ban size={16} />} onClick={() => onRecordAction(selectedCase.id, '已限制该订单聊天', 'restrict_chat')}>
                限制聊天
              </AdminButton>
              <AdminButton
                variant="soft"
                icon={<Snowflake size={16} />}
                onClick={() => {
                  onFreezeOrder(selectedCase.orderNo);
                  onRecordAction(selectedCase.id, '已冻结订单并标记争议', 'freeze_order');
                }}
              >
                冻结订单
              </AdminButton>
              <AdminButton variant="danger" icon={<PauseCircle size={16} />} onClick={() => onRecordAction(selectedCase.id, '已暂停陪拍者接单', 'suspend_companion')}>
                暂停接单
              </AdminButton>
              <AdminButton variant="soft" icon={<LockKeyhole size={16} />} onClick={() => onRecordAction(selectedCase.id, '已同步风控记录', 'confirm_violation')}>
                记录备注
              </AdminButton>
            </div>
            <ActionLogList logs={actionLogs} />
          </DetailCard>
        }
      />
    </ModuleFrame>
  );
}

function ReportPanel({
  reports,
  selectedReport,
  selectedOrder,
  actionLogs,
  onSelect,
  onUpdate,
  onRecordAction,
  onFreezeOrder,
}: {
  reports: ReportCase[];
  selectedReport: ReportCase;
  selectedOrder?: AppOrder;
  actionLogs: string[];
  onSelect: (id: string) => void;
  onUpdate: (id: string, status: ReportCase['status']) => void;
  onRecordAction: (id: string, action: string, actionType: AdminActionType) => void;
  onFreezeOrder: (orderNo: string) => void;
}) {
  function record(status: ReportCase['status'], action: string) {
    onUpdate(selectedReport.id, status);
    onRecordAction(selectedReport.id, action, status === '已完结' ? 'resolve_report' : 'confirm_violation');
  }

  return (
    <ModuleFrame title="举报处理" count={`${reports.filter((item) => item.status !== '已完结').length} 未完结`}>
      <ListDetailLayout
        list={reports.map((item) => (
          <ListRow key={item.id} active={item.id === selectedReport.id} title={item.type} subtitle={`${item.reporter} 举报 ${item.target}`} meta={item.status} onClick={() => onSelect(item.id)} />
        ))}
        detail={
          <DetailCard eyebrow={selectedReport.orderNo} title={selectedReport.type} status={selectedReport.status}>
            <InfoGrid
              items={[
                ['举报人', selectedReport.reporter],
                ['被举报对象', selectedReport.target],
                ['关联订单', selectedReport.orderNo],
                ['处理状态', selectedReport.status],
                ['订单状态', selectedOrder ? selectedOrder.statusText : '-'],
                ['订单金额', selectedOrder ? selectedOrder.amountText : '-'],
              ]}
            />
            <p className="mt-4 text-sm leading-6 text-zinc-600">{selectedReport.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AdminButton onClick={() => record('处理中', '已开始处理举报')}>开始处理</AdminButton>
              <AdminButton variant="danger" onClick={() => record('处理中', '已确认为违规')}>
                确认为违规
              </AdminButton>
              <AdminButton variant="soft" icon={<Flag size={16} />} onClick={() => onRecordAction(selectedReport.id, '已警告用户', 'warn_user')}>
                警告用户
              </AdminButton>
              <AdminButton variant="soft" icon={<Flag size={16} />} onClick={() => onRecordAction(selectedReport.id, '已警告陪拍者', 'warn_companion')}>
                警告陪拍者
              </AdminButton>
              <AdminButton variant="soft" icon={<Ban size={16} />} onClick={() => onRecordAction(selectedReport.id, '已限制订单聊天', 'restrict_chat')}>
                限制聊天
              </AdminButton>
              <AdminButton
                variant="soft"
                icon={<Snowflake size={16} />}
                onClick={() => {
                  onFreezeOrder(selectedReport.orderNo);
                  onRecordAction(selectedReport.id, '已冻结订单并进入纠纷处理', 'freeze_order');
                }}
              >
                冻结订单
              </AdminButton>
              <AdminButton variant="danger" icon={<PauseCircle size={16} />} onClick={() => onRecordAction(selectedReport.id, '已暂停陪拍者接单', 'suspend_companion')}>
                暂停接单
              </AdminButton>
              <AdminButton variant="soft" onClick={() => record('已完结', '举报纠纷已完结')}>
                处理完成
              </AdminButton>
            </div>
            <ActionLogList logs={actionLogs} />
          </DetailCard>
        }
      />
    </ModuleFrame>
  );
}

function AccountPanel({
  accounts,
  selectedAccount,
  onSelect,
  onUpdate,
}: {
  accounts: AccountCase[];
  selectedAccount: AccountCase;
  onSelect: (id: string) => void;
  onUpdate: (id: string, status: AccountCase['status']) => void;
}) {
  return (
    <ModuleFrame title="账号状态管理" count={`${accounts.length} 个账号`}>
      <ListDetailLayout
        list={accounts.map((account) => (
          <ListRow
            key={account.id}
            active={account.id === selectedAccount.id}
            title={account.name}
            subtitle={`${account.role} · ${account.lastActive}`}
            meta={account.status}
            onClick={() => onSelect(account.id)}
          />
        ))}
        detail={
          <DetailCard eyebrow={selectedAccount.role} title={selectedAccount.name} status={selectedAccount.status}>
            <InfoGrid
              items={[
                ['账号类型', selectedAccount.role],
                ['当前状态', selectedAccount.status],
                ['最近活跃', selectedAccount.lastActive],
                ['风控备注', selectedAccount.risk],
              ]}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AdminButton onClick={() => onUpdate(selectedAccount.id, '正常')} disabled={selectedAccount.status === '正常'}>
                恢复正常
              </AdminButton>
              <AdminButton variant="soft" onClick={() => onUpdate(selectedAccount.id, '观察中')} disabled={selectedAccount.status === '观察中'}>
                加入观察
              </AdminButton>
              <AdminButton variant="soft" icon={<Ban size={16} />} onClick={() => onUpdate(selectedAccount.id, '限制中')} disabled={selectedAccount.status === '限制中'}>
                限制能力
              </AdminButton>
              <AdminButton variant="danger" icon={<PauseCircle size={16} />} onClick={() => onUpdate(selectedAccount.id, '已停用')} disabled={selectedAccount.status === '已停用'}>
                停用账号
              </AdminButton>
            </div>
          </DetailCard>
        }
      />
    </ModuleFrame>
  );
}

function FinancePanel({
  settlements,
  selectedSettlement,
  onSelect,
  onUpdate,
}: {
  settlements: SettlementCase[];
  selectedSettlement: SettlementCase;
  onSelect: (id: string) => void;
  onUpdate: (id: string, status: SettlementCase['status']) => void;
}) {
  return (
    <ModuleFrame title="基础财务结算" count={`${settlements.filter((item) => item.status === '待结算').length} 待结算`}>
      <ListDetailLayout
        list={settlements.map((item) => (
          <ListRow key={item.id} active={item.id === selectedSettlement.id} title={item.companion} subtitle={item.orderNo} meta={item.status} onClick={() => onSelect(item.id)} />
        ))}
        detail={
          <DetailCard eyebrow={selectedSettlement.orderNo} title={`${selectedSettlement.companion} 结算单`} status={selectedSettlement.status}>
            <InfoGrid
              items={[
                ['订单收入', formatMoney(selectedSettlement.grossCents)],
                ['平台抽成', formatMoney(selectedSettlement.commissionCents)],
                ['应结金额', formatMoney(selectedSettlement.payableCents)],
                ['结算状态', selectedSettlement.status],
              ]}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AdminButton onClick={() => onUpdate(selectedSettlement.id, '已结算')}>确认结算</AdminButton>
              <AdminButton variant="soft" onClick={() => onUpdate(selectedSettlement.id, '冻结中')}>
                冻结结算
              </AdminButton>
            </div>
          </DetailCard>
        }
      />
    </ModuleFrame>
  );
}

function SettingsPanel({
  configs,
  selectedConfig,
  onSelect,
  onUpdate,
}: {
  configs: SystemConfig[];
  selectedConfig: SystemConfig;
  onSelect: (id: string) => void;
  onUpdate: (id: string) => void;
}) {
  return (
    <ModuleFrame title="基础系统配置" count={`${configs.length} 项`}>
      <ListDetailLayout
        list={configs.map((item) => (
          <ListRow key={item.id} active={item.id === selectedConfig.id} title={item.name} subtitle={item.value} meta={item.status} onClick={() => onSelect(item.id)} />
        ))}
        detail={
          <DetailCard eyebrow="系统规则" title={selectedConfig.name} status={selectedConfig.status}>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs font-bold text-zinc-500">当前配置</p>
              <p className="mt-2 text-sm font-bold text-zinc-900">{selectedConfig.value}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AdminButton onClick={() => onUpdate(selectedConfig.id)}>启用配置</AdminButton>
              <AdminButton variant="soft" onClick={() => onSelect(selectedConfig.id)}>
                编辑占位
              </AdminButton>
            </div>
          </DetailCard>
        }
      />
    </ModuleFrame>
  );
}

function mapRemoteModerationData(data: AdminModerationData): { riskCases: RiskCase[]; reportCases: ReportCase[] } {
  return {
    riskCases: data.messageCases.map(mapRemoteRiskCase),
    reportCases: data.reportCases.map(mapRemoteReportCase),
  };
}

function mapRemoteRiskCase(item: AdminRiskMessageCase): RiskCase {
  return {
    id: item.id,
    orderNo: item.orderNo,
    sender: item.blockedMessage.from === 'companion' ? item.companionName : item.userName,
    target: item.blockedMessage.from === 'companion' ? item.userName : item.companionName,
    message: item.blockedMessage.text,
    level: item.riskLevel === 'high' ? '高危' : '中危',
    status: item.status === 'released' ? '已放行' : item.status === 'violation' || item.status === 'restricted' ? '已拦截' : '待处理',
    hits: item.hitWords.map((hit) => hit.keyword),
  };
}

function mapRemoteReportCase(item: AdminReportCase): ReportCase {
  return {
    id: item.id,
    type: item.riskLabel || item.reason,
    reporter: item.reporterName,
    target: item.targetName,
    orderNo: item.orderNo,
    status: item.status === 'resolved' ? '已完结' : item.status === 'investigating' ? '处理中' : '待处理',
    summary: item.description,
  };
}

function ActionLogList({ logs }: { logs: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-black text-zinc-500">处置记录</p>
      {logs.length ? (
        <div className="mt-2 space-y-2">
          {logs.map((log, index) => (
            <p key={`${log}-${index}`} className="rounded-lg bg-zinc-50 p-3 text-xs font-bold leading-5 text-zinc-700">
              {log}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">暂无处置记录</p>
      )}
    </div>
  );
}

function ModuleFrame({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black">{title}</h2>
        <span className="rounded-full bg-white/78 px-3 py-1 text-xs font-bold text-[#6f625d] ring-1 ring-[#eadfd8]">{count}</span>
      </div>
      {children}
    </div>
  );
}

function ListDetailLayout({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="space-y-3 md:grid md:grid-cols-[minmax(280px,360px)_1fr] md:items-start md:gap-4 md:space-y-0">
      <div className="space-y-2">{list}</div>
      {detail}
    </div>
  );
}

function ListRow({ active, title, subtitle, meta, onClick }: { active: boolean; title: string; subtitle: string; meta: string; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-[18px] border p-3 text-left ${active ? 'border-[#3f302c] bg-white shadow-sm' : 'border-[#eadfd8] bg-white/78'}`}
      onClick={onClick}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${active ? 'bg-[#3f302c] text-white' : 'bg-[#f4ebe6] text-[#6f625d]'}`}>
        <ChevronRight size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-[#3f302c]">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[#8f8078]">{subtitle}</span>
      </span>
      <StatusPill status={meta} />
    </button>
  );
}

function DetailCard({
  eyebrow,
  title,
  status,
  imageUrl,
  children,
}: {
  eyebrow: string;
  title: string;
  status: string;
  imageUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-[22px] border border-[#eadfd8] bg-white/86 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-[18px] object-cover" />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] bg-[#f4ebe6] text-[#6f625d]">
            <Shield size={22} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-[#7a6b64]">{eyebrow}</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-base font-black leading-6 text-[#3f302c]">{title}</h3>
            <StatusPill status={status} />
          </div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-h-16 rounded-[16px] bg-[#fff5f1] p-3">
          <p className="text-[11px] font-bold text-[#7a6b64]">{label}</p>
          <p className="mt-1 break-words text-sm font-bold leading-5 text-[#3f302c]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ChipGroup({ values }: { values: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {values.map((value) => (
        <Chip key={value}>{value}</Chip>
      ))}
    </div>
  );
}

function ActionBar({
  disabled,
  onApprove,
  onReject,
  approveText,
  rejectText,
}: {
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  approveText: string;
  rejectText: string;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <AdminButton onClick={onApprove} disabled={disabled} icon={<CheckCircle2 size={16} />}>
        {approveText}
      </AdminButton>
      <AdminButton variant="soft" onClick={onReject} disabled={disabled} icon={<XCircle size={16} />}>
        {rejectText}
      </AdminButton>
    </div>
  );
}

function AdminButton({
  children,
  disabled,
  variant = 'primary',
  icon,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'primary' | 'soft' | 'danger';
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  const classes = {
    primary: 'bg-[#3f302c] text-white disabled:bg-[#d8d0cb]',
    soft: 'bg-[#f2e8e1] text-[#3f302c] disabled:text-[#b0a29b]',
    danger: 'bg-[#fff1f2] text-[#be3450] disabled:text-[#e8a5b1]',
  };

  return (
    <button className={`flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-black ${classes[variant]}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const style = getStatusStyle(status);
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${style}`}>{status}</span>;
}

function getStatusStyle(status: string) {
  if (['已通过', '已结算', '已完结', '已放行', '已启用', '已确认'].includes(status)) return 'bg-[#eef8f1] text-[#23724a]';
  if (['待审核', '待处理', '待结算', '待确认', '中危', '待完善'].includes(status)) return 'bg-amber-100 text-amber-700';
  if (['需修改', '高危', '已拦截', '冻结中', '退款中', '争议处理中', '已取消'].includes(status)) return 'bg-[#fff1f2] text-[#be3450]';
  if (['处理中', '服务中'].includes(status)) return 'bg-sky-100 text-sky-700';
  return 'bg-[#f2e8e1] text-[#6f625d]';
}

function formatDate(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
