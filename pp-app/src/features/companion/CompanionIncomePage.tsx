import { ArrowDownToLine, Banknote, ChevronLeft, Clock3, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import type { AppOrder } from '../../types/domain';
import { formatMoney } from '../../utils/money';

const serviceFeeRate = 0.1;

export function CompanionIncomePage() {
  const { orders } = useAppData();
  const completedOrders = orders.filter((order) => order.status === 'completed');
  const grossIncome = sumAmount(completedOrders);
  const platformFee = Math.round(grossIncome * serviceFeeRate);
  const netIncome = grossIncome - platformFee;
  const pendingSettlement = Math.round(netIncome * 0.45);
  const withdrawable = netIncome - pendingSettlement;
  const withdrawalRecords = [
    { id: 'wd-1', amountCents: 20000, status: '已到账', time: '2026-05-20 18:12' },
    { id: 'wd-2', amountCents: 12000, status: '处理中', time: '2026-05-24 09:30' },
  ];

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-5">
      <header className="flex items-center gap-3">
        <Link className="grid h-10 w-10 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" to="/companion" aria-label="返回">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-semibold text-rose-500">陪拍者工作台</p>
          <h1 className="mt-1 text-2xl font-bold">收入</h1>
        </div>
      </header>

      <section className="mt-5 rounded-[10px] bg-zinc-950 p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">可提现金额</p>
            <p className="mt-2 text-4xl font-bold">{formatMoney(withdrawable)}</p>
          </div>
          <WalletCards className="text-rose-300" size={34} />
        </div>
        <button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-zinc-950" type="button">
          <ArrowDownToLine size={17} />
          申请提现
        </button>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard icon={<TrendingUp size={18} />} label="已完成订单收入" value={formatMoney(grossIncome)} />
        <MetricCard icon={<Clock3 size={18} />} label="待结算金额" value={formatMoney(pendingSettlement)} />
        <MetricCard icon={<Banknote size={18} />} label="平台服务费" value={formatMoney(platformFee)} />
        <MetricCard icon={<ReceiptText size={18} />} label="完成订单" value={`${completedOrders.length} 单`} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">收入明细</h2>
          <span className="text-xs font-semibold text-zinc-400">服务费率 10%</span>
        </div>
        <div className="space-y-3">
          {completedOrders.map((order) => (
            <IncomeRow key={order.id} order={order} />
          ))}
          {!completedOrders.length && <EmptyLine text="暂无已完成订单收入" />}
        </div>
      </section>

      <section className="mt-6 pb-6">
        <h2 className="mb-3 text-base font-bold">提现记录</h2>
        <div className="space-y-3">
          {withdrawalRecords.map((record) => (
            <div key={record.id} className="flex items-center justify-between rounded-[10px] border border-zinc-200 bg-white p-4">
              <div>
                <p className="text-sm font-bold">{record.status}</p>
                <p className="mt-1 text-xs text-zinc-500">{record.time}</p>
              </div>
              <p className="text-base font-bold text-zinc-950">{formatMoney(record.amountCents)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-3 text-xl font-bold text-zinc-950">{value}</p>
    </div>
  );
}

function IncomeRow({ order }: { order: AppOrder }) {
  const fee = Math.round(order.amountCents * serviceFeeRate);
  const net = order.amountCents - fee;

  return (
    <article className="rounded-[10px] border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{order.activityName ?? order.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{order.orderNo} · {order.dateLabel ?? order.time}</p>
        </div>
        <p className="shrink-0 text-lg font-bold text-emerald-600">+{formatMoney(net)}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-[10px] bg-zinc-50 p-3 text-center">
        <MiniAmount label="订单金额" value={formatMoney(order.amountCents)} />
        <MiniAmount label="服务费" value={`-${formatMoney(fee)}`} />
        <MiniAmount label="入账" value={formatMoney(net)} />
      </div>
    </article>
  );
}

function MiniAmount({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-[10px] border border-dashed border-zinc-200 bg-white p-5 text-center text-sm font-semibold text-zinc-400">{text}</div>;
}

function sumAmount(orders: AppOrder[]) {
  return orders.reduce((total, order) => total + order.amountCents, 0);
}
