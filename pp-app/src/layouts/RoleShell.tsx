import { Home, MessageCircle, Sparkles, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const photographerTabs = [
  { to: '/companion', label: '发现', icon: Home },
  { to: '/companion/creators', label: '找创作者', icon: Sparkles },
  { to: '/companion/messages', label: '消息', icon: MessageCircle },
  { to: '/companion/mine', label: '我的', icon: UserRound },
];

export function RoleShell() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh pp-page">
      <main className="mx-auto min-h-dvh w-full max-w-md pb-24 shadow-[0_0_46px_rgba(91,64,49,0.08)]">
        <Outlet context={{ homeChromeCompact: false }} />
      </main>

      <nav
        className="fixed bottom-4 left-1/2 z-40 flex h-14 w-[304px] -translate-x-1/2 items-center justify-around rounded-full border border-white/12 bg-black/82 px-2 text-white shadow-[0_16px_42px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        aria-label="摄影师端导航"
      >
        {photographerTabs.map(({ to, label, icon: Icon }) => {
          const active = to === '/companion' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/companion'}
              className={`grid h-11 w-14 place-items-center rounded-full transition ${
                active ? 'bg-white/18 text-white' : 'text-white/58 hover:bg-white/8 hover:text-white'
              }`}
              aria-label={label}
              title={label}
            >
              <Icon size={23} strokeWidth={active ? 2.7 : 2.2} />
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
