export function RoleSwitchLoading({ label = '正在切换身份' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/42 text-white backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-full bg-black/82 px-5 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <span className="text-sm font-black">{label}</span>
      </div>
    </div>
  );
}
