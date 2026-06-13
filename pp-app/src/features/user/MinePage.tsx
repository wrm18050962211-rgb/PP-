import { Camera, ChevronRight, ImagePlus, ReceiptText, Settings, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RoleSwitchLoading } from '../../components/RoleSwitchLoading';
import { fetchAuthSession, switchMockRole } from '../../services/authService';
import { listFeedPosts } from '../../services/feedService';
import type { AuthSession, FeedPost, UserRole } from '../../types/api';
import { getCollectionSummary } from './UserCollectionPage';

type UserFacingRole = Extract<UserRole, 'consumer' | 'companion'>;

const menuItems = [
  { icon: ReceiptText, label: '我的订单', desc: '预约、支付、售后', to: '/consumer/orders' },
  { icon: ImagePlus, label: '编辑作品', desc: '已完成订单的共同成片', to: '/consumer/orders?tab=completed&work=1' },
  { icon: Settings, label: '设置', desc: '账号、安全与实名认证', to: '/settings' },
];

const roleActions: Array<{ role: UserFacingRole; label: string; desc: string; to: string; icon: typeof UserRound }> = [
  { role: 'consumer', label: '创作者', desc: '作品、点赞、收藏、预约', to: '/consumer/mine', icon: UserRound },
  { role: 'companion', label: '摄影师', desc: '资料、档期、订单、收入', to: '/companion/mine', icon: Camera },
];

export function MinePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loadingRole, setLoadingRole] = useState<UserFacingRole | null>(null);
  const activeRole = getUserFacingRole(session?.role);
  const posts = listFeedPosts();
  const ownProfile = buildOwnProfileSummary(session, posts[0]);
  const collectionSummary = getCollectionSummary(posts);

  useEffect(() => {
    let mounted = true;
    fetchAuthSession().then((nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleRoleSwitch(role: UserFacingRole, to: string) {
    setLoadingRole(role);
    const nextSession = await switchMockRole(role);
    setSession(nextSession);
    setLoadingRole(null);
    navigate(to);
  }

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

      <section className="mt-5 rounded-[10px] border border-zinc-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          {roleActions.map((item) => {
            const Icon = item.icon;
            const active = activeRole === item.role;
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
      {loadingRole ? <RoleSwitchLoading /> : null}
    </div>
  );
}

function buildOwnProfileSummary(session: AuthSession | null, post: FeedPost) {
  const role = getUserFacingRole(session?.role);

  if (role === 'companion') {
    const photographer = post.companion;
    return {
      to: `/consumer/photographer/${photographer.id}`,
      roleLabel: '摄影师主页',
      name: photographer.name,
      handle: `@${photographer.id.replace(/^virtual-companion-/, 'photographer-').replace(/-/g, '')}`,
      avatar: photographer.avatar || photographer.photo,
    };
  }

  const creatorId = `creator-${post.id}`;
  const creatorName = !session || session.role === 'admin' || session.user.nickname === 'Demo Consumer' ? 'Demo Creator' : session.user.nickname;
  return {
    to: `/consumer/creator/${creatorId}`,
    roleLabel: '创作者主页',
    name: creatorName,
    handle: `@${post.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`,
    avatar: post.images[1]?.url || post.images[0]?.url || post.companion.avatar,
  };
}

function getUserFacingRole(role?: UserRole): UserFacingRole {
  return role === 'companion' ? 'companion' : 'consumer';
}
