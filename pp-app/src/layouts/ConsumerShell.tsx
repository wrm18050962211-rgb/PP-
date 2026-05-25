import { ClipboardList, Home, MessageCircle, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/consumer', label: '发现', icon: Home },
  { to: '/consumer/orders', label: '订单', icon: ClipboardList },
  { to: '/consumer/messages', label: '消息', icon: MessageCircle },
  { to: '/consumer/mine', label: '我的', icon: UserRound },
];

export function ConsumerShell() {
  const { pathname } = useLocation();
  const isHome = pathname === '/consumer';

  return (
    <div className={`min-h-dvh ${isHome ? 'bg-[#111116] text-white' : 'bg-stone-50 text-zinc-950'}`}>
      <main
        className={`mx-auto min-h-dvh w-full max-w-md pb-20 ${
          isHome ? 'bg-[#111116]' : 'bg-white shadow-[0_0_40px_rgba(24,24,27,0.08)]'
        }`}
      >
        <Outlet />
      </main>
      <nav
        className={`fixed inset-x-0 bottom-0 z-30 mx-auto grid h-16 max-w-md grid-cols-4 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur ${
          isHome ? 'border-t border-white/8 bg-[#111116]/94' : 'border-t border-zinc-200 bg-white/95'
        }`}
      >
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/consumer'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                isActive ? (isHome ? 'text-white' : 'text-zinc-950') : isHome ? 'text-white/42' : 'text-zinc-400'
              }`
            }
          >
            <Icon size={21} strokeWidth={2.2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
