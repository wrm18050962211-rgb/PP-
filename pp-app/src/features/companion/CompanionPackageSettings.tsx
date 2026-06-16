import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { createDefaultPackageSettings, formatCents, readCompanionPackageSettings, saveCompanionPackageSettings } from '../../services/companionPackageService';
import { listFeedPosts } from '../../services/feedService';
import type { CompanionPackage } from '../../services/companionPackageService';

export function CompanionPackageSettings() {
  const navigate = useNavigate();
  const { session } = useAppData();
  const posts = useMemo(() => listFeedPosts(), []);
  const companion = posts.find((post) => post.companion.id === session?.companionId)?.companion ?? (session?.companionId && posts[0]?.companion
    ? {
      ...posts[0].companion,
      id: session.companionId,
      name: session.user.nickname || posts[0].companion.name,
      avatar: session.user.avatarUrl || posts[0].companion.avatar,
    }
    : posts[0]?.companion);
  const [settings, setSettings] = useState(() => readCompanionPackageSettings(companion) ?? createDefaultPackageSettings(companion));
  const primaryPackage = settings.packages[0];

  function updatePackage(packageId: string, patch: Partial<CompanionPackage>) {
    setSettings((current) => ({
      ...current,
      packages: current.packages.map((pkg) => (pkg.id === packageId ? { ...pkg, ...patch } : pkg)),
    }));
  }

  function addPackage() {
    const index = settings.packages.length + 1;
    const basePackage = primaryPackage ?? createDefaultPackageSettings(companion).packages[0];
    setSettings((current) => ({
      ...current,
      packages: [
        ...current.packages,
        {
          ...basePackage,
          id: `package-custom-${Date.now()}`,
          name: `自定义套餐 ${index}`,
          durationMinutes: 120,
          basePriceCents: 39900,
          depositCents: 10000,
          includedRetouchedCount: 4,
          includedOriginals: 60,
          description: '适合常规拍摄，可根据需求卡再微调报价。',
        },
      ],
    }));
  }

  function removePackage(packageId: string) {
    setSettings((current) => {
      if (current.packages.length <= 1) return current;
      return { ...current, packages: current.packages.filter((pkg) => pkg.id !== packageId) };
    });
  }

  function save() {
    saveCompanionPackageSettings(settings, companion?.id ?? session?.companionId);
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">套餐列表</h2>
            <p className="mt-1 text-xs font-semibold text-zinc-400">每个套餐可独立设置时长、价格、定金和交付内容。</p>
          </div>
          <button className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-zinc-950 px-3 text-xs font-black text-white" type="button" onClick={addPackage}>
            <Plus size={16} />
            添加套餐
          </button>
        </div>

        {settings.packages.map((pkg, index) => (
          <section key={pkg.id} className="rounded-[12px] bg-white p-4 ring-1 ring-zinc-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-rose-500">套餐 {index + 1}</p>
                <h3 className="mt-1 text-lg font-black">{pkg.name}</h3>
              </div>
              <button
                className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-400 disabled:opacity-30"
                type="button"
                disabled={settings.packages.length <= 1}
                onClick={() => removePackage(pkg.id)}
                aria-label="删除套餐"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <Field label="套餐名称">
                <input className="field" value={pkg.name} onChange={(event) => updatePackage(pkg.id, { name: event.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="时长（分钟）">
                  <input className="field" type="number" value={pkg.durationMinutes} onChange={(event) => updatePackage(pkg.id, { durationMinutes: Number(event.target.value) })} />
                </Field>
                <Field label="起拍价（元）">
                  <input className="field" type="number" value={Math.round(pkg.basePriceCents / 100)} onChange={(event) => updatePackage(pkg.id, { basePriceCents: Number(event.target.value) * 100 })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="定金（元）">
                  <input className="field" type="number" value={Math.round(pkg.depositCents / 100)} onChange={(event) => updatePackage(pkg.id, { depositCents: Number(event.target.value) * 100 })} />
                </Field>
                <Field label="免费修图张数">
                  <input className="field" type="number" value={pkg.includedRetouchedCount} onChange={(event) => updatePackage(pkg.id, { includedRetouchedCount: Number(event.target.value) })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="包含原图数">
                  <input className="field" type="number" value={pkg.includedOriginals} onChange={(event) => updatePackage(pkg.id, { includedOriginals: Number(event.target.value) })} />
                </Field>
                <Field label="尾款节点">
                  <select className="field" value={pkg.balanceDueTiming} onChange={() => updatePackage(pkg.id, { balanceDueTiming: 'before_shoot' })}>
                    <option value="before_shoot">拍摄前托管</option>
                  </select>
                </Field>
              </div>
              <Field label="套餐说明">
                <textarea className="field min-h-24 resize-none rounded-[10px] py-3" value={pkg.description} onChange={(event) => updatePackage(pkg.id, { description: event.target.value })} />
              </Field>
            </div>
          </section>
        ))}
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
