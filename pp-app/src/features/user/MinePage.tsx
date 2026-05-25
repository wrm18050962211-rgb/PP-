import { ChevronRight, Heart, Settings, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const items = [
  { icon: Heart, label: '收藏的作品', to: '/consumer' },
  { icon: ShieldCheck, label: '安全与实名认证', to: '/consumer/mine' },
  { icon: Settings, label: '设置', to: '/consumer/mine' },
];

export function MinePage() {
  return (
    <div className="px-4 py-5">
      <h1 className="text-2xl font-bold">我的</h1>
      <section className="mt-5 rounded-[10px] bg-zinc-950 p-5 text-white">
        <p className="text-sm text-white/70">Hi，欢迎来到 PP</p>
        <h2 className="mt-2 text-2xl font-bold">找到懂你的拍照搭子</h2>
      </section>
      <section className="mt-5 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200">
        {items.map(({ icon: Icon, label, to }) => (
          <Link key={label} to={to} className="flex h-14 w-full items-center gap-3 px-4 text-left">
            <Icon size={19} />
            <span className="flex-1 text-sm font-semibold">{label}</span>
            <ChevronRight className="text-zinc-300" size={18} />
          </Link>
        ))}
      </section>
    </div>
  );
}
