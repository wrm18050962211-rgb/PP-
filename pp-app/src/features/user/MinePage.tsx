import { Bookmark, Camera, ChevronRight, Heart, ReceiptText, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuthSession, switchMockRole } from '../../services/authService';
import { getPostTitle, listFeedPosts } from '../../services/feedService';
import type { AuthSession, FeedPost, UserRole } from '../../types/api';

const menuItems = [
  { icon: ReceiptText, label: '我的订单', desc: '预约、支付、售后', to: '/consumer/orders' },
  { icon: Heart, label: '点赞的作品', desc: '喜欢过的图片', to: '/consumer' },
  { icon: Bookmark, label: '收藏的作品', desc: '稍后再拍的样板', to: '/consumer' },
  { icon: Settings, label: '设置', desc: '账号、安全与实名认证', to: '/consumer/mine' },
];

const roleActions: Array<{ role: UserRole; label: string; desc: string; to: string; icon: typeof UserRound }> = [
  { role: 'consumer', label: '创作者', desc: '作品、点赞、收藏、预约', to: '/consumer', icon: UserRound },
  { role: 'companion', label: '摄影师', desc: '资料、档期、订单、收入', to: '/companion', icon: Camera },
];

const adminAction = { role: 'admin' as const, label: '管理员', desc: '审核、风控、订单、财务', to: '/admin', icon: ShieldCheck };

const roleLabels: Record<UserRole, string> = {
  consumer: '创作者',
  companion: '摄影师',
  admin: '管理员',
};

export function MinePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingRole, setLoadingRole] = useState<UserRole | null>(null);
  const ownProfile = buildOwnProfileSummary(session, listFeedPosts()[0]);

  useEffect(() => {
    let mounted = true;
    fetchAuthSession().then((nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleRoleSwitch(role: UserRole, to: string) {
    setLoadingRole(role);
    const nextSession = await switchMockRole(role);
    setSession(nextSession);
    setLoadingRole(null);
    navigate(to);
  }

  return (
    <div className="px-4 pb-5 pt-3">
      <Link to={ownProfile.to} className="block rounded-[10px] bg-zinc-950 p-4 text-white active:scale-[0.99]">
        <div className="flex items-center gap-3">
          {ownProfile.avatar ? (
            <img className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-white/20" src={ownProfile.avatar} alt={ownProfile.name} />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15">
              <UserRound size={24} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-white/44">{ownProfile.roleLabel}</p>
            <h2 className="mt-0.5 truncate text-xl font-black">{ownProfile.name}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-white/54">{ownProfile.handle}</p>
          </div>
          <ChevronRight size={22} className="shrink-0 text-white/42" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {ownProfile.stats.map((item) => (
            <div key={item.label} className="rounded-[8px] bg-white/[0.07] px-2 py-2">
              <p className="text-base font-black leading-5">{item.value}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-white/46">{item.label}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 line-clamp-2 text-xs font-semibold leading-5 text-white/58">{ownProfile.bio}</p>
      </Link>

      <section className="mt-5 rounded-[10px] border border-zinc-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          {roleActions.map((item) => {
            const Icon = item.icon;
            const active = session?.role === item.role;
            return (
              <button
                key={item.role}
                className={`min-h-20 rounded-[8px] px-3 py-3 text-left ${
                  active ? 'bg-[#fff1f3] text-[#3f302c] ring-1 ring-[#f4c8d1]' : 'bg-[#fbf7f2] text-[#5f514b]'
                }`}
                onClick={() => handleRoleSwitch(item.role, item.to)}
                disabled={loadingRole !== null}
              >
                <Icon size={18} className="mb-2" />
                <span className="block text-sm font-black">{item.label}</span>
                <span className="mt-1 block text-xs leading-4 opacity-70">{loadingRole === item.role ? '切换中...' : item.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-3">
        <button
          className={`flex min-h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left ${
            session?.role === 'admin' ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-500'
          }`}
          onClick={() => handleRoleSwitch(adminAction.role, adminAction.to)}
          disabled={loadingRole !== null}
        >
          <ShieldCheck size={17} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black">{adminAction.label}</span>
            <span className="mt-0.5 block truncate text-xs opacity-70">{loadingRole === 'admin' ? '切换中...' : adminAction.desc}</span>
          </span>
          <ChevronRight size={17} className="shrink-0 opacity-50" />
        </button>
      </section>

      <section className="mt-5 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200 bg-white">
        {menuItems.map(({ icon: Icon, label, desc, to }) => (
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
    </div>
  );
}

function buildOwnProfileSummary(session: AuthSession | null, post: FeedPost) {
  const role = session?.role ?? 'consumer';

  if (role === 'companion') {
    const photographer = post.companion;
    return {
      to: `/consumer/photographer/${photographer.id}`,
      roleLabel: '摄影师主页',
      name: photographer.name,
      handle: `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`,
      avatar: photographer.avatar || photographer.photo,
      bio: photographer.bio,
      stats: [
        { label: '点赞', value: '1.6k' },
        { label: '关注', value: 128 },
        { label: '评价', value: photographer.ratingCount },
      ],
    };
  }

  if (role === 'admin') {
    return {
      to: '/admin',
      roleLabel: '管理员工作台',
      name: session?.user.nickname ?? 'Demo Admin',
      handle: '@pp-admin',
      avatar: session?.user.avatarUrl || '',
      bio: '审核、风控、订单和财务的 MVP 管理入口。',
      stats: [
        { label: '审核', value: 12 },
        { label: '风控', value: 4 },
        { label: '订单', value: 23 },
      ],
    };
  }

  const creatorId = `creator-${post.id}`;
  return {
    to: `/consumer/creator/${creatorId}`,
    roleLabel: '创作者主页',
    name: session?.user.nickname === 'Demo Consumer' ? 'Demo Creator' : session?.user.nickname ?? 'Demo Creator',
    handle: `@${post.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`,
    avatar: post.images[1]?.url || post.images[0]?.url || post.companion.avatar,
    bio: `${getPostTitle(post)} · 我的作品、点赞、收藏和订单成片会沉淀在这里。`,
    stats: [
      { label: '点赞', value: '1.3k' },
      { label: '关注', value: 128 },
      { label: '合作', value: 1 },
    ],
  };
}
