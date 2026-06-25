import { ChevronRight, FileQuestion, ImagePlus, ReceiptText, Settings, UserRound, UserRoundPen, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAuthSession } from '../../services/authService';
import { listConsultations } from '../../services/consultationService';
import { getCreatorIdentity, readCreatorProfile } from '../../services/creatorProfileService';
import { listFeedPosts } from '../../services/feedService';
import type { AuthSession, FeedPost, UserRole } from '../../types/api';
import { getCollectionSummary } from './UserCollectionPage';

type UserFacingRole = Extract<UserRole, 'consumer' | 'companion'>;
type CreatorMenuItem = { icon: LucideIcon; label: string; desc: string; to: string; badge?: string };

const creatorMenuItems: CreatorMenuItem[] = [
  { icon: UserRoundPen, label: '编辑主页', desc: '头像、ID 名称、文字简介', to: '/consumer/profile' },
  { icon: FileQuestion, label: '我的询价', desc: '已提交的咨询需求卡', to: '/consumer/inquiries' },
  { icon: ReceiptText, label: '我的订单', desc: '预约、支付、售后', to: '/consumer/orders' },
  { icon: ImagePlus, label: '编辑作品', desc: '已完成订单的共同成片', to: '/consumer/orders?tab=completed&work=1' },
  { icon: Settings, label: '设置', desc: '账号、安全与实名认证', to: '/settings' },
];

export function MinePage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const posts = listFeedPosts();
  const ownProfile = buildOwnProfileSummary(session, posts[0]);
  const collectionSummary = getCollectionSummary(posts);
  const activeInquiryCount = session ? listConsultations(session).filter((item) => item.status !== 'closed').length : 0;
  const quotedConsultationCount = session ? listConsultations(session).filter((item) => item.status === 'quoted' && item.quote).length : 0;
  const visibleCreatorMenuItems = creatorMenuItems.map((item) => {
    if (item.label === '我的询价' && activeInquiryCount > 0) {
      return {
        ...item,
        desc: `${item.desc} · ${activeInquiryCount} 个进行中`,
        badge: `${activeInquiryCount}`,
      };
    }
    if (item.label !== '我的订单' || quotedConsultationCount <= 0) return item;
    return {
      ...item,
      to: '/consumer/orders?tab=paid_pending_confirm',
      desc: `${item.desc} · ${quotedConsultationCount} 个报价待确认`,
      badge: `${quotedConsultationCount}`,
    };
  });

  useEffect(() => {
    let mounted = true;
    fetchAuthSession().then((nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="px-4 pb-5 pt-3">
      <section className="rounded-[10px] bg-zinc-950 p-4 text-white">
        <Link to={ownProfile.to} className="flex items-center gap-3 active:scale-[0.99]">
          <div className="shrink-0">
            {ownProfile.avatar ? (
              <img className="h-14 w-14 rounded-full object-cover ring-1 ring-white/20" src={ownProfile.avatar} alt={ownProfile.name} />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white/15">
                <UserRound size={24} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-white/44">{ownProfile.roleLabel}</p>
            <h2 className="mt-0.5 truncate text-xl font-black">{ownProfile.name}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-white/54">{ownProfile.handle}</p>
          </div>
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

      <section className="mt-5 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
        {visibleCreatorMenuItems.map(({ icon: Icon, label, desc, to, badge }) => (
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
    </div>
  );
}

function buildOwnProfileSummary(session: AuthSession | null, post: FeedPost) {
  const role = getUserFacingRole(session?.role);
  const posts = listFeedPosts();
  const phoneHandle = formatPhoneHandle(session?.user.phone);

  if (role === 'companion') {
    const profilePost = posts.find((item) => item.companion.id === session?.companionId) ?? post;
    const photographer = profilePost.companion;
    return {
      to: `/consumer/photographer/${photographer.id}`,
      roleLabel: '摄影师主页',
      name: photographer.name,
      handle: phoneHandle || `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`,
      avatar: photographer.avatar || photographer.photo,
    };
  }

  const profilePost = posts.find((item) => getCreatorIdentity(item).id === session?.user.id) ?? post;
  const creator = getCreatorIdentity(profilePost);
  const profile = readCreatorProfile('consumer');
  const creatorName = !session || session.role === 'admin' || session.user.nickname === 'Demo Consumer' ? creator.name : session.user.nickname;
  return {
    to: `/consumer/creator/${creator.id}`,
    roleLabel: '创作者主页',
    name: profile?.displayName || creatorName,
    handle: phoneHandle || `@${profilePost.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`,
    avatar: profile?.avatarUrl || creator.avatar,
  };
}

function formatPhoneHandle(phone?: string) {
  const normalizedPhone = phone?.replace(/\D/g, '');
  return normalizedPhone ? `@${normalizedPhone}` : '';
}

function getUserFacingRole(role?: UserRole): UserFacingRole {
  return role === 'companion' ? 'companion' : 'consumer';
}
