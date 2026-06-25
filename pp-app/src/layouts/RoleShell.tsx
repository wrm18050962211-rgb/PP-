import { Home, MessageCircle, Sparkles, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const photographerTabs = [
  { to: '/companion', label: '发现', icon: Home },
  { to: '/companion/creators', label: '创作者', icon: Sparkles },
  { to: '/companion/messages', label: '消息', icon: MessageCircle },
  { to: '/companion/mine', label: '我的', icon: UserRound },
];

export function RoleShell() {
  const { pathname } = useLocation();
  const showBottomNav = photographerTabs.some((tab) => tab.to === pathname);
  const chromeCanCompact = showBottomNav;
  const [roleChromeCompact, setRoleChromeCompact] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!chromeCanCompact) {
      setRoleChromeCompact(false);
      return undefined;
    }

    lastScrollYRef.current = window.scrollY;
    let frame = 0;

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const nextScrollY = Math.max(window.scrollY, 0);
        const delta = nextScrollY - lastScrollYRef.current;

        if (nextScrollY < 24) {
          setRoleChromeCompact(false);
        } else if (Math.abs(delta) > 8) {
          setRoleChromeCompact(delta > 0);
        }

        lastScrollYRef.current = nextScrollY;
        frame = 0;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [chromeCanCompact]);

  const compactChrome = showBottomNav && roleChromeCompact;

  return (
    <div className="min-h-dvh pp-page">
      <main className={`mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(91,64,49,0.08)] ${showBottomNav ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : ''}`}>
        <Outlet context={{ homeChromeCompact: compactChrome }} />
      </main>

      {showBottomNav ? (
        <nav
          className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center justify-around rounded-full border border-white/12 bg-black/82 text-white shadow-[0_16px_42px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 ${
            compactChrome ? 'bottom-[max(0.75rem,env(safe-area-inset-bottom))] h-12 w-[272px] px-2' : 'bottom-[max(1rem,env(safe-area-inset-bottom))] h-14 w-[304px] px-2'
          }`}
          aria-label="摄影师端导航"
        >
          {photographerTabs.map(({ to, label, icon: Icon }) => {
            const active = to === '/companion' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/companion'}
                className={`grid place-items-center rounded-full transition-all duration-300 ${
                  compactChrome ? 'h-10 w-11' : 'h-11 w-14'
                } ${active ? 'bg-white/18 text-white' : 'text-white/58 hover:bg-white/8 hover:text-white'}`}
                aria-label={label}
                title={label}
              >
                <Icon size={compactChrome ? 21 : 23} strokeWidth={active ? 2.7 : 2.2} />
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
