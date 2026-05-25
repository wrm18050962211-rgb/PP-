import { MapPin, Search, ShieldCheck } from 'lucide-react';

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-100 bg-white/92 px-4 py-3 backdrop-blur">
      <button className="flex min-w-0 items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900">
        <MapPin size={16} />
        <span className="truncate">上海</span>
      </button>
      <button className="flex flex-1 items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-sm text-zinc-500 ml-2">
        <Search size={16} />
        <span className="truncate">搜索商圈、街道、咖啡店</span>
      </button>
      <ShieldCheck className="ml-3 text-emerald-600" size={22} />
    </header>
  );
}
