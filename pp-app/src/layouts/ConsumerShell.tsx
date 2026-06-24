import { Camera, Home, MessageCircle, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/consumer', label: '发现', icon: Home },
  { to: '/consumer/companions', label: '拍摄', icon: Camera },
  { to: '/consumer/messages', label: '消息', icon: MessageCircle },
  { to: '/consumer/mine', label: '我的', icon: UserRound },
];

export function ConsumerShell() {
  const { pathname } = useLocation();
  const showBottomNav = tabs.some((tab) => tab.to === pathname);
  const chromeCanCompact = showBottomNav;
  const [homeChromeCompact, setHomeChromeCompact] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!chromeCanCompact) {
      setHomeChromeCompact(false);
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
          setHomeChromeCompact(false);
        } else if (Math.abs(delta) > 8) {
          setHomeChromeCompact(delta > 0);
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

  const compactChrome = showBottomNav && homeChromeCompact;

  return (
    <div className="min-h-dvh pp-page">
      <main className={`mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(0,0,0,0.32)] ${showBottomNav ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : ''}`}>
        <Outlet context={{ homeChromeCompact: compactChrome }} />
      </main>
      {showBottomNav ? (
        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div
            className={`pointer-events-auto grid grid-cols-4 items-center border border-white/10 bg-black/[0.82] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all duration-300 ${
              compactChrome ? 'h-12 w-[272px] rounded-full px-2' : 'h-14 w-[304px] max-w-full rounded-full px-3'
            }`}
          >
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/consumer'}
                className={({ isActive }) =>
                  `flex min-w-0 items-center justify-center rounded-full font-black transition-all duration-300 ${
                    compactChrome ? 'h-10 w-11' : 'h-11 w-12'
                  } ${isActive ? 'bg-white/[0.14] text-white' : 'text-white/[0.54]'}`
                }
                aria-label={label}
                title={label}
              >
                {({ isActive }) => (
                  <Icon size={compactChrome ? 21 : 22} strokeWidth={isActive ? 2.6 : 2.2} />
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
