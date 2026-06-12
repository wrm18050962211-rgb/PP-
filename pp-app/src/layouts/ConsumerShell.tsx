import { NavLink, Outlet, useLocation } from 'react-router-dom';

const tabs = [
  { to: '/consumer', label: '发现' },
  { to: '/consumer/companions', label: '拍摄' },
  { to: '/consumer/messages', label: '消息' },
  { to: '/consumer/mine', label: '我的' },
];

export function ConsumerShell() {
  const { pathname } = useLocation();
  const isImmersivePost = pathname.startsWith('/consumer/post/');

  return (
    <div className="min-h-dvh pp-page">
      <main className={`mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(0,0,0,0.32)] ${isImmersivePost ? '' : 'pb-14'}`}>
        <Outlet />
      </main>
      {isImmersivePost ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid min-h-12 max-w-md grid-cols-4 border-t border-white/10 bg-black/92 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {tabs.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/consumer'}
              className={({ isActive }) =>
                `flex h-12 items-center justify-center text-[13px] font-black tracking-[0.02em] ${isActive ? 'text-white' : 'text-white/42'}`
              }
            >
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
