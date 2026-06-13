import { ArrowLeft, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { createDefaultPackageSettings, formatCents, readCompanionPackageSettings, saveCompanionPackageSettings } from '../../services/companionPackageService';
import { listFeedPosts } from '../../services/feedService';

export function CompanionPackageSettings() {
  const navigate = useNavigate();
  const { session } = useAppData();
  const posts = useMemo(() => listFeedPosts(), []);
  const companion = posts.find((post) => post.companion.id === session?.companionId)?.companion ?? posts[0]?.companion;
  const [settings, setSettings] = useState(() => readCompanionPackageSettings(companion) ?? createDefaultPackageSettings(companion));
  const primaryPackage = settings.packages[0];

  function updatePrimaryPackage(patch: Partial<typeof primaryPackage>) {
    setSettings((current) => ({
      ...current,
      packages: [{ ...current.packages[0], ...patch }, ...current.packages.slice(1)],
    }));
  }

  function save() {
    saveCompanionPackageSettings(settings);
    navigate('/companion/mine');
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 py-5 text-zinc-950">
      <header className="flex items-center gap-3">
        <Link to="/companion/mine" className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-zinc-200" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-black text-rose-500">服务设置</p>
          <h1 className="text-2xl font-black">套餐与报价规则</h1>
        </div>
      </header>

      <section className="mt-5 rounded-[12px] bg-zinc-950 p-4 text-white">
        <p className="text-xs font-black text-white/48">主页价格预期</p>
        <h2 className="mt-1 text-xl font-black">{primaryPackage.name}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
          <PreviewMetric label="起拍价" value={`${formatCents(primaryPackage.basePriceCents)} / ${Math.round(primaryPackage.durationMinutes / 60)}小时`} />
          <PreviewMetric label="定金" value={`${formatCents(primaryPackage.depositCents)} 锁档期`} />
          <PreviewMetric label="修图" value={`免费 ${primaryPackage.includedRetouchedCount} 张`} />
          <PreviewMetric label="尾款" value="拍摄前托管" />
        </div>
      </section>

      <section className="mt-5 space-y-4">
        <Field label="套餐名称">
          <input className="field" value={primaryPackage.name} onChange={(event) => updatePrimaryPackage({ name: event.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="时长（分钟）">
            <input className="field" type="number" value={primaryPackage.durationMinutes} onChange={(event) => updatePrimaryPackage({ durationMinutes: Number(event.target.value) })} />
          </Field>
          <Field label="起拍价（元）">
            <input className="field" type="number" value={Math.round(primaryPackage.basePriceCents / 100)} onChange={(event) => updatePrimaryPackage({ basePriceCents: Number(event.target.value) * 100 })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="定金（元）">
            <input className="field" type="number" value={Math.round(primaryPackage.depositCents / 100)} onChange={(event) => updatePrimaryPackage({ depositCents: Number(event.target.value) * 100 })} />
          </Field>
          <Field label="免费修图张数">
            <input className="field" type="number" value={primaryPackage.includedRetouchedCount} onChange={(event) => updatePrimaryPackage({ includedRetouchedCount: Number(event.target.value) })} />
          </Field>
        </div>
        <Field label="套餐说明">
          <textarea className="field min-h-24 resize-none rounded-[10px] py-3" value={primaryPackage.description} onChange={(event) => updatePrimaryPackage({ description: event.target.value })} />
        </Field>
      </section>

      <section className="mt-5 space-y-3 rounded-[12px] bg-white p-4 ring-1 ring-zinc-200">
        <h2 className="text-sm font-black">加价与规则</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="多人/小时（元）">
            <input className="field" type="number" value={Math.round(settings.addOns.extraPersonPerHourCents / 100)} onChange={(event) => setSettings((current) => ({ ...current, addOns: { ...current.addOns, extraPersonPerHourCents: Number(event.target.value) * 100 } }))} />
          </Field>
          <Field label="额外修图/张（元）">
            <input className="field" type="number" value={Math.round(settings.addOns.retouchPerImageCents / 100)} onChange={(event) => setSettings((current) => ({ ...current, addOns: { ...current.addOns, retouchPerImageCents: Number(event.target.value) * 100 } }))} />
          </Field>
        </div>
        <Field label="取消规则">
          <textarea className="field min-h-20 resize-none rounded-[10px] py-3" value={settings.rules.cancellationPolicy} onChange={(event) => setSettings((current) => ({ ...current, rules: { ...current.rules, cancellationPolicy: event.target.value } }))} />
        </Field>
        <Field label="交通/门票规则">
          <textarea className="field min-h-20 resize-none rounded-[10px] py-3" value={`${settings.rules.travelFeePolicy}\n${settings.rules.ticketFeePolicy}`} onChange={(event) => {
            const [travelFeePolicy = '', ticketFeePolicy = ''] = event.target.value.split('\n');
            setSettings((current) => ({ ...current, rules: { ...current.rules, travelFeePolicy, ticketFeePolicy } }));
          }} />
        </Field>
      </section>

      <button className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-black text-white" onClick={save} type="button">
        <Save size={18} />
        保存套餐规则
      </button>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white/10 p-3">
      <p className="text-white/46">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black">{label}</span>
      {children}
    </label>
  );
}
