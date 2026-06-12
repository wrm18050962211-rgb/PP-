import { Home, MessageCircle, Search, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/consumer', label: '发现', icon: Home },
  { to: '/consumer/companions', label: '找陪拍', icon: Search },
  { to: '/consumer/messages', label: '消息', icon: MessageCircle },
  { to: '/consumer/mine', label: '我的', icon: UserRound },
];

export function ConsumerShell() {
  const { pathname } = useLocation();
  const isImmersivePost = pathname.startsWith('/consumer/post/');

  return (
    <div className="min-h-dvh pp-page">
      <main className={`mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(91,64,49,0.08)] ${isImmersivePost ? '' : 'pb-20'}`}>
        <Outlet />
      </main>
      {isImmersivePost ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid h-16 max-w-md grid-cols-4 border-t border-[#eadfd8] bg-white/92 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_rgba(91,64,49,0.07)] backdrop-blur">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/consumer'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? 'text-[#3f302c]' : 'text-[#b0a29b]'}`
              }
            >
              <Icon size={21} strokeWidth={2.2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
