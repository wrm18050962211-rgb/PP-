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
  const isImmersivePost = pathname.startsWith('/consumer/post/');
  const isHome = pathname === '/consumer';
  const [homeChromeCompact, setHomeChromeCompact] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    if (!isHome) {
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
  }, [isHome]);

  return (
    <div className="min-h-dvh pp-page">
      <main className={`mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(0,0,0,0.32)] ${isImmersivePost ? '' : 'pb-24'}`}>
        <Outlet context={{ homeChromeCompact: isHome && homeChromeCompact }} />
      </main>
      {isImmersivePost ? null : (
        <nav className="pointer-events-none fixed inset-x-0 bottom-3 z-30 mx-auto flex max-w-md justify-center px-4 pb-[env(safe-area-inset-bottom)]">
          <div
            className={`pointer-events-auto grid grid-cols-4 items-center border border-white/10 bg-black/[0.82] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all duration-300 ${
              isHome && homeChromeCompact ? 'h-11 w-[248px] rounded-full px-2' : 'h-[60px] w-full rounded-full px-3'
            }`}
          >
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/consumer'}
                className={({ isActive }) =>
                  `flex min-w-0 items-center justify-center rounded-full font-black transition-all duration-300 ${
                    isHome && homeChromeCompact ? 'h-9 gap-0' : 'h-11 gap-1.5'
                  } ${isActive ? 'bg-white/[0.14] text-white' : 'text-white/[0.54]'}`
                }
                aria-label={label}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={isHome && homeChromeCompact ? 20 : 19} strokeWidth={isActive ? 2.6 : 2.2} />
                    <span className={`text-[11px] transition-all duration-300 ${isHome && homeChromeCompact ? 'sr-only' : 'max-w-12 opacity-100'}`}>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
