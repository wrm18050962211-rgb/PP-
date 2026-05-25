/* eslint-disable react-hooks/set-state-in-effect */
import { AlertTriangle, ClipboardCheck, CreditCard, FileSearch, Flag, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';
import { fetchAdminDashboardData, getAdminDashboardData } from '../../services/adminService';
import type { AdminDashboardData } from '../../types/api';

const moduleIcons = [Shield, Flag, CreditCard, AlertTriangle];

export function AdminDashboard() {
  const { application, workDraft, orders, reviewApplication, reviewWork } = useAppData();
  const [dashboard, setDashboard] = useState<AdminDashboardData>(() => getAdminDashboardData(application, workDraft, orders));

  useEffect(() => {
    let mounted = true;
    const fallback = getAdminDashboardData(application, workDraft, orders);
    setDashboard(fallback);
    fetchAdminDashboardData(application, workDraft, orders).then((nextDashboard) => {
      if (mounted) setDashboard(nextDashboard);
    });

    return () => {
      mounted = false;
    };
  }, [application, workDraft, orders]);

  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-bold">运营后台</h1>
      <p className="mt-1 text-sm text-zinc-500">MVP 基础审核、风控、订单和结算</p>

      <section className="mt-5 grid grid-cols-2 gap-3">
        {dashboard.metrics.map((metric) => (
          <div key={metric.label} className="rounded-[10px] bg-zinc-950 p-4 text-white">
            <p className="text-2xl font-bold">{metric.value}</p>
            <p className="mt-1 text-xs text-white/70">{metric.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-bold">审核队列</h2>
        <ReviewCard
          icon={<ClipboardCheck size={19} />}
          title="陪拍者审核"
          status={application.reviewStatus}
          body={`${application.nickname} · ${application.city} · ${application.bio}`}
          chips={[...application.areas.slice(0, 3), ...application.services.slice(0, 2)]}
          onApprove={() => reviewApplication('已通过')}
          onReject={() => reviewApplication('需修改')}
        />
        <ReviewCard
          icon={<FileSearch size={19} />}
          title="作品审核"
          status={workDraft.reviewStatus}
          body={`${workDraft.location} · ${workDraft.timeLabel} · ${workDraft.caption}`}
          chips={workDraft.tags}
          onApprove={() => reviewWork('已通过')}
          onReject={() => reviewWork('需修改')}
        />
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-bold">订单管理</h2>
        {orders.slice(0, 3).map((order) => (
          <article key={order.id} className="rounded-[10px] border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-rose-500">{order.statusText}</p>
                <h3 className="mt-1 text-sm font-bold">{order.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {order.place} · {order.time} · {order.companion}
                </p>
              </div>
              <p className="text-sm font-bold">{order.amountText}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 space-y-3 pb-4">
        <h2 className="text-base font-bold">后台模块</h2>
        {dashboard.moduleCards.map(({ title, desc }, index) => {
          const Icon = moduleIcons[index] ?? Shield;
          return (
          <button key={title} className="flex w-full items-center gap-3 rounded-[10px] border border-zinc-200 p-4 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100">
              <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{title}</span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">{desc}</span>
            </span>
          </button>
          );
        })}
      </section>
    </div>
  );
}

function ReviewCard({
  icon,
  title,
  status,
  body,
  chips,
  onApprove,
  onReject,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  body: string;
  chips: string[];
  onApprove: () => void;
  onReject: () => void;
}) {
  const actionable = status === '待审核';

  return (
    <article className="rounded-[10px] border border-zinc-200 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-100">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold">{title}</h3>
            <StatusPill status={status} />
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="h-10 rounded-full bg-zinc-950 text-sm font-bold text-white disabled:bg-zinc-200"
              disabled={!actionable}
              onClick={onApprove}
            >
              通过
            </button>
            <button className="h-10 rounded-full bg-zinc-100 text-sm font-bold text-zinc-900 disabled:text-zinc-400" disabled={!actionable} onClick={onReject}>
              要求修改
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    草稿: 'bg-zinc-100 text-zinc-500',
    待审核: 'bg-amber-100 text-amber-700',
    已通过: 'bg-emerald-100 text-emerald-700',
    需修改: 'bg-rose-100 text-rose-700',
  };

  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[status] ?? styles.草稿}`}>{status}</span>;
}
