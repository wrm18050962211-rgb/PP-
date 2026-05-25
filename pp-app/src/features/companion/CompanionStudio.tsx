import { BadgeCheck, Banknote, Calendar, Camera, MapPinned, UserCheck, UserRoundPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { fetchCompanionDashboard, getCompanionDashboard } from '../../services/companionService';
import type { CompanionDashboard } from '../../types/api';
import { formatMoney } from '../../utils/money';

const setup = [
  {
    icon: UserRoundPen,
    title: '资料编辑',
    desc: '昵称、真人照片、介绍、性格与互动标签',
    to: '/companion/profile',
  },
  {
    icon: UserCheck,
    title: '入驻审核',
    desc: '实名、人脸、视频、生活照、紧急联系人',
    to: '/companion/onboarding',
  },
  {
    icon: MapPinned,
    title: '服务范围',
    desc: 'Base 城市 + 商圈/街区/景点/地铁站',
    to: '/companion/service-range',
  },
  {
    icon: Calendar,
    title: '时间价格',
    desc: '日期、时间段、活动形式、时长和加购项',
    to: '/companion/booking-settings',
  },
  {
    icon: Camera,
    title: '作品发布',
    desc: '像发图片帖一样上传地点、时间和风格',
    to: '/companion/publish',
  },
];

export function CompanionStudio() {
  const { application, workDraft } = useAppData();
  const [dashboard, setDashboard] = useState<CompanionDashboard>(() => getCompanionDashboard());

  useEffect(() => {
    let mounted = true;
    fetchCompanionDashboard().then((nextDashboard) => {
      if (mounted) setDashboard(nextDashboard);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="px-4 py-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">陪拍者端</h1>
          <p className="mt-1 text-sm text-zinc-500">轻量创作者工具</p>
        </div>
        <BadgeCheck className="text-emerald-600" size={28} />
      </div>

      <section className="mt-5 rounded-[10px] bg-rose-500 p-5 text-white">
        <p className="text-sm text-white/80">本周预估收入</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-4xl font-bold">{formatMoney(dashboard.weeklyEstimatedCents)}</span>
          <span className="pb-1 text-sm text-white/80">待结算 {formatMoney(dashboard.pendingCents)}</span>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <StatusCard label="入驻资料" value={application.reviewStatus} active={application.reviewStatus === '已通过'} />
        <StatusCard label="作品审核" value={workDraft.reviewStatus === '草稿' ? '待发布' : workDraft.reviewStatus} active={workDraft.reviewStatus === '已通过'} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        {dashboard.orderStats.map((item) => (
          <div key={item} className="rounded-[10px] border border-zinc-200 p-4">
            <p className="text-sm font-bold">{item}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-bold">接单配置</h2>
        {setup.map(({ icon: Icon, title, desc, to }) => (
          <Link key={title} to={to} className="flex w-full items-center gap-3 rounded-[10px] border border-zinc-200 p-4 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100">
              <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{title}</span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">{desc}</span>
            </span>
          </Link>
        ))}
      </section>

      <button className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-bold text-white">
        <Banknote size={18} />
        查看收入与提现
      </button>
    </div>
  );
}

function StatusCard({ label, value, active }: { label: string; value: string; active: boolean }) {
  const needsWork = value === '需修改';
  return (
    <div className={`rounded-[10px] p-4 ${active ? 'bg-emerald-50 text-emerald-800' : needsWork ? 'bg-rose-50 text-rose-700' : 'bg-zinc-100 text-zinc-700'}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}
