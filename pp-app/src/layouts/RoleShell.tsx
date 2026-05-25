import { Outlet } from 'react-router-dom';

export function RoleShell() {
  return (
    <div className="min-h-dvh bg-stone-50 text-zinc-950">
      <main className="mx-auto min-h-dvh w-full max-w-md bg-white shadow-[0_0_40px_rgba(24,24,27,0.08)]">
        <Outlet />
      </main>
    </div>
  );
}
