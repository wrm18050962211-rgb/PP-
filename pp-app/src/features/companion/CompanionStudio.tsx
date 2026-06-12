import {
  Banknote,
  Bookmark,
  Calendar,
  Camera,
  ChevronRight,
  ClipboardList,
  Heart,
  MapPinned,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserRound,
  UserRoundPen,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { switchMockRole } from '../../services/authService';
import { fetchCompanionDashboard, getCompanionDashboard } from '../../services/companionService';
import { listFeedPosts } from '../../services/feedService';
import type { CompanionDashboard, FeedPost, UserRole } from '../../types/api';
import { formatMoney } from '../../utils/money';

const photographerMenuItems = [
  { icon: ClipboardList, label: '我的订单', desc: '待确认、已确认、已完成', to: '/companion/orders' },
  { icon: Heart, label: '点赞的作品', desc: '喜欢过的拍摄参考', to: '/consumer/likes' },
  { icon: Bookmark, label: '收藏的作品', desc: '准备复拍的样板', to: '/consumer/favorites' },
  { icon: UserRound, label: '我的关注', desc: '我关注的创作者和摄影师', to: '/consumer/following' },
];

const creatorBusinessItems = [
  { icon: Sparkles, label: '寻找高质量创作者', desc: '审核通过的创作者与报价', to: '/companion/creators' },
  { icon: Camera, label: '作品发布', desc: '上传地点、时间、风格和样片', to: '/companion/publish' },
  { icon: Search, label: '拍摄灵感', desc: '查看发现页作品流', to: '/companion' },
];

const setupItems = [
  { icon: UserRoundPen, label: '资料编辑', desc: '昵称、照片、介绍与互动标签', to: '/companion/profile' },
  { icon: UserCheck, label: '入驻审核', desc: '实名、人脸、视频、生活照', to: '/companion/onboarding' },
  { icon: MapPinned, label: '服务范围', desc: '城市、商圈、街区和地铁站', to: '/companion/service-range' },
  { icon: Calendar, label: '时间价格', desc: '档期、活动类型、时长和价格', to: '/companion/booking-settings' },
  { icon: Banknote, label: '收入与提现', desc: '本周收入、待结算和提现', to: '/companion/income' },
  { icon: Settings, label: '设置', desc: '账号、安全与实名认证', to: '/consumer/mine' },
];

export function CompanionStudio() {
  const navigate = useNavigate();
  const { application, workDraft } = useAppData();
  const [dashboard, setDashboard] = useState<CompanionDashboard>(() => getCompanionDashboard());
  const ownProfile = buildPhotographerProfileSummary(listFeedPosts()[0]);
  const reviewText = application.reviewStatus === '已通过' ? '已认证' : application.reviewStatus;
  const draftText = workDraft.reviewStatus === '草稿' ? '待发布' : workDraft.reviewStatus;

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
    <div className="min-h-dvh bg-[#f7f7f5] px-4 pb-24 pt-3 text-zinc-950">
      <section className="rounded-[10px] bg-zinc-950 p-4 text-white">
        <Link to={ownProfile.to} className="flex items-center gap-3 active:scale-[0.99]">
          <img className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-white/20" src={ownProfile.avatar} alt={ownProfile.name} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black text-white/44">摄影师主页</span>
            <span className="mt-0.5 block truncate text-xl font-black">{ownProfile.name}</span>
            <span className="mt-1 block truncate text-xs font-semibold text-white/54">{ownProfile.handle}</span>
          </span>
          <ChevronRight size={22} className="shrink-0 text-white/42" />
        </Link>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <SummaryPill label="本周收入" value={formatMoney(dashboard.weeklyEstimatedCents)} />
          <SummaryPill label="待结算" value={formatMoney(dashboard.pendingCents)} />
          <SummaryPill label="审核" value={reviewText} />
        </div>

        <p className="mt-4 line-clamp-2 text-xs font-semibold leading-5 text-white/58">
          {ownProfile.bio}
        </p>
      </section>

      <MenuSection className="mt-5" items={photographerMenuItems} />

      <MenuSection className="mt-4" items={creatorBusinessItems} />

      <section className="mt-4 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
        <Link to="/companion/onboarding" className="flex min-h-14 items-center gap-3 px-4">
          <span className={`grid h-9 w-9 place-items-center rounded-full ${application.reviewStatus === '已通过' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <ShieldCheck size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">入驻状态</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-400">{reviewText}</span>
          </span>
          <ChevronRight className="text-zinc-300" size={18} />
        </Link>
        <Link to="/companion/publish" className="flex min-h-14 items-center gap-3 px-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">
            <Camera size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">作品审核</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-400">{draftText}</span>
          </span>
          <ChevronRight className="text-zinc-300" size={18} />
        </Link>
        {dashboard.orderStats.map((item) => (
          <Link key={item} to="/companion/orders" className="flex min-h-14 items-center gap-3 px-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700">
              <ClipboardList size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">{item}</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-400">订单状态</span>
            </span>
            <ChevronRight className="text-zinc-300" size={18} />
          </Link>
        ))}
      </section>

      <MenuSection className="mt-4" items={setupItems} />

      <section className="mt-4 rounded-[10px] border border-zinc-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-[#f4f4f5] text-sm font-black text-zinc-700"
            onClick={() => void handleRoleSwitch('consumer', '/consumer/mine')}
            type="button"
          >
            <UserRound size={16} />
            创作者
          </button>
          <button
            className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-zinc-950 text-sm font-black text-white"
            onClick={() => void handleRoleSwitch('companion', '/companion/mine')}
            type="button"
          >
            <Camera size={16} />
            摄影师
          </button>
        </div>
      </section>
    </div>
  );
}

function MenuSection({ items, className = '' }: { items: typeof photographerMenuItems; className?: string }) {
  return (
    <section className={`${className} divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white`}>
      {items.map(({ icon: Icon, label, desc, to }) => (
        <Link key={label} to={to} className="flex min-h-16 w-full items-center gap-3 px-4 text-left">
          <Icon size={19} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-0.5 block truncate text-xs text-zinc-400">{desc}</span>
          </span>
          <ChevronRight className="text-zinc-300" size={18} />
        </Link>
      ))}
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white/[0.07] px-2 py-3 text-center">
      <p className="truncate text-sm font-black leading-5">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-white/42">{label}</p>
    </div>
  );
}

function buildPhotographerProfileSummary(post: FeedPost) {
  const photographer = post.companion;
  return {
    to: `/consumer/photographer/${photographer.id}`,
    name: photographer.name,
    handle: `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`,
    avatar: photographer.avatar || photographer.photo || post.images[0]?.url,
    bio: photographer.bio || `${photographer.areas.slice(0, 2).join(' / ')} · ${photographer.activities[0]?.name || '摄影服务'}`,
  };
}
