import { BadgeCheck, Banknote, Calendar, Camera, ClipboardList, MapPinned, UserCheck, UserRound, UserRoundPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { switchMockRole } from '../../services/authService';
import { fetchCompanionDashboard, getCompanionDashboard } from '../../services/companionService';
import type { CompanionDashboard, UserRole } from '../../types/api';
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
    desc: 'Base 城市、商圈、街区、景点和地铁站',
    to: '/companion/service-range',
  },
  {
    icon: Calendar,
    title: '时间价格',
    desc: '日期、时段、活动形式、时长和加购项',
    to: '/companion/booking-settings',
  },
  {
    icon: Camera,
    title: '作品发布',
    desc: '上传地点、时间、风格和样片',
    to: '/companion/publish',
  },
  {
    icon: ClipboardList,
    title: '订单管理',
    desc: '待确认、今日行程、完成确认和取消申请',
    to: '/companion/orders',
  },
];

export function CompanionStudio() {
  const navigate = useNavigate();
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

  const handleRoleSwitch = async (role: UserRole, to: string) => {
    await switchMockRole(role);
    navigate(to);
  };

  return (
    <div className="min-h-dvh bg-[#f7f5f2] px-4 py-5 text-[#3f302c]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">摄影师端</h1>
          <p className="mt-1 text-sm font-semibold text-[#7a6b64]">创作、接单和协作工具</p>
        </div>
        <BadgeCheck className="text-emerald-600" size={28} />
      </div>

      <section className="mt-5 rounded-[24px] bg-[#e85d75] p-5 text-white shadow-[0_18px_40px_rgba(232,93,117,0.2)]">
        <p className="text-sm text-white/80">本周预估收入</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-4xl font-black">{formatMoney(dashboard.weeklyEstimatedCents)}</span>
          <span className="pb-1 text-sm font-semibold text-white/80">待结算 {formatMoney(dashboard.pendingCents)}</span>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <StatusCard label="入驻资料" value={application.reviewStatus} active={application.reviewStatus === '已通过'} />
        <StatusCard label="作品审核" value={workDraft.reviewStatus === '草稿' ? '待发布' : workDraft.reviewStatus} active={workDraft.reviewStatus === '已通过'} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        {dashboard.orderStats.map((item) => (
          <div key={item} className="rounded-[18px] bg-white p-4 shadow-[0_10px_28px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <p className="text-sm font-black">{item}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-black">接单配置</h2>
        {setup.map(({ icon: Icon, title, desc, to }) => (
          <Link key={title} to={to} className="flex w-full items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-[0_12px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f4ebe6] text-[#6f625d]">
              <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">{title}</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-[#8f8078]">{desc}</span>
            </span>
          </Link>
        ))}
      </section>

      <Link to="/companion/income" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-black text-white">
        <Banknote size={18} />
        查看收入与提现
      </Link>

      <section className="mt-4 rounded-[20px] bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
        <p className="px-1 text-xs font-black text-[#8f8078]">切换身份</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#f2efec] text-sm font-black text-[#4a403c]"
            onClick={() => void handleRoleSwitch('consumer', '/consumer/mine')}
          >
            <UserRound size={16} />
            创作者
          </button>
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-black text-sm font-black text-white"
            onClick={() => void handleRoleSwitch('companion', '/companion/mine')}
          >
            <Camera size={16} />
            摄影师
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusCard({ label, value, active }: { label: string; value: string; active: boolean }) {
  const needsWork = value === '需修改';
  return (
    <div className={`rounded-[18px] p-4 ${active ? 'bg-[#eef8f1] text-[#23724a]' : needsWork ? 'bg-[#fff1f2] text-[#be3450]' : 'bg-[#f2e8e1] text-[#6f625d]'}`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
