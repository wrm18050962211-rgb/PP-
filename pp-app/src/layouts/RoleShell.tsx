import { Outlet } from 'react-router-dom';

export function RoleShell() {
  return (
    <div className="min-h-dvh pp-page">
      <main className="mx-auto min-h-dvh w-full max-w-md shadow-[0_0_46px_rgba(91,64,49,0.08)]">
        <Outlet />
      </main>
    </div>
  );
}
