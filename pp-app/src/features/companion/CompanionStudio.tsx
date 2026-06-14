import {
  Banknote,
  Calendar,
  ChevronRight,
  ClipboardList,
  ImagePlus,
  MapPinned,
  Settings,
  UserRound,
  UserRoundPen,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { listConsultations } from '../../services/consultationService';
import { listFeedPosts } from '../../services/feedService';
import type { FeedPost, UserRole } from '../../types/api';
import { getCollectionSummary } from '../user/UserCollectionPage';

type MenuItem = { icon: typeof ClipboardList; label: string; desc: string; to: string; badge?: string };

const photographerMenuItems: MenuItem[] = [
  { icon: Banknote, label: '咨询报价', desc: '查看需求卡并调整报价', to: '/companion/consultations' },
  { icon: ClipboardList, label: '我的订单', desc: '待确认、已确认、已完成', to: '/companion/orders' },
  { icon: ImagePlus, label: '编辑作品', desc: '已完成订单的共同成片', to: '/consumer/orders?tab=completed&work=1&from=companion' },
];

const setupItems: MenuItem[] = [
  { icon: UserRoundPen, label: '资料编辑', desc: '昵称、照片、介绍与互动标签', to: '/companion/profile' },
  { icon: Banknote, label: '套餐与报价', desc: '定金、尾款、加价项和取消规则', to: '/companion/packages' },
  { icon: Calendar, label: '档期设置', desc: '空闲时间、订单占用和路线提醒', to: '/companion/booking-settings' },
  { icon: MapPinned, label: '服务范围', desc: '城市、可接地点和最大公里数', to: '/companion/service-range' },
  { icon: Banknote, label: '收入与提现', desc: '本周收入、待结算和提现', to: '/companion/income' },
  { icon: Settings, label: '设置', desc: '账号、安全与实名认证', to: '/settings' },
];

export function CompanionStudio() {
  const navigate = useNavigate();
  const { session } = useAppData();
  const posts = listFeedPosts();
  const ownProfile = buildPhotographerProfileSummary(posts.find((post) => post.companion.id === session?.companionId), session, posts[0]);
  const collectionSummary = getCollectionSummary(posts);
  const newConsultationCount = session ? listConsultations(session).filter((item) => item.status === 'consulting').length : 0;
  const visiblePhotographerMenuItems = photographerMenuItems.map((item) => {
    if (item.label !== '咨询报价' || newConsultationCount <= 0) return item;
    return {
      ...item,
      desc: `${item.desc} · ${newConsultationCount} 个新询价`,
      badge: `${newConsultationCount}`,
    };
  });

  useEffect(() => {
    if (!session) return;
    if (session.role !== 'companion') navigate('/consumer/mine', { replace: true });
  }, [navigate, session]);

  if (!session || session.role !== 'companion') {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f7f7f5] px-6 text-center text-sm font-bold text-zinc-500">
        正在确认摄影师身份...
      </div>
    );
  }

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
          {collectionSummary.map(({ icon: Icon, label, value, to }) => (
            <Link key={label} to={to} className="rounded-[8px] bg-white/[0.07] px-2 py-3 text-center active:bg-white/[0.11]">
              <Icon size={16} className="mx-auto text-white/58" />
              <p className="mt-1 text-sm font-black leading-5">{label}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-white/42">{value} 项</p>
            </Link>
          ))}
        </div>
      </section>

      <MenuSection className="mt-5" items={visiblePhotographerMenuItems} />

      <MenuSection className="mt-4" items={setupItems} />
    </div>
  );
}

function MenuSection({ items, className = '' }: { items: MenuItem[]; className?: string }) {
  return (
    <section className={`${className} divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white`}>
      {items.map(({ icon: Icon, label, desc, to, badge }) => (
        <Link key={label} to={to} className="flex min-h-16 w-full items-center gap-3 px-4 text-left">
          <Icon size={19} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span>{label}</span>
              {badge ? <span className="rounded-full bg-[#e85d75] px-2 py-0.5 text-[10px] font-black leading-4 text-white">{badge}</span> : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-zinc-400">{desc}</span>
          </span>
          <ChevronRight className="text-zinc-300" size={18} />
        </Link>
      ))}
    </section>
  );
}

function buildPhotographerProfileSummary(post: FeedPost | undefined, session: ReturnType<typeof useAppData>['session'], fallbackPost: FeedPost) {
  const phoneHandle = formatPhoneHandle(session?.user.phone);

  if (!post && session?.companionId) {
    return {
      to: `/consumer/photographer/${session.companionId}`,
      name: session.user.nickname || '本地摄影师',
      handle: phoneHandle || `@${session.companionId.replace(/^companion-/, '').replace(/-/g, '')}`,
      avatar: session.user.avatarUrl || fallbackPost.companion.avatar || fallbackPost.images[0]?.url,
      bio: '本地注册的摄影师身份',
    };
  }

  const profilePost = post ?? fallbackPost;
  const photographer = profilePost.companion;
  return {
    to: `/consumer/photographer/${photographer.id}`,
    name: photographer.name,
    handle: phoneHandle || `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`,
    avatar: photographer.avatar || photographer.photo || profilePost.images[0]?.url,
    bio: photographer.bio || `${photographer.areas.slice(0, 2).join(' / ')} · ${photographer.activities[0]?.name || '摄影服务'}`,
  };
}

function formatPhoneHandle(phone?: string) {
  const normalizedPhone = phone?.replace(/\D/g, '');
  return normalizedPhone ? `@${normalizedPhone}` : '';
}
