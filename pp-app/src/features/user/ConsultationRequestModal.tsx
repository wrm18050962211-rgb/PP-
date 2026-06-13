import { ImagePlus, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { AuthSession, FeedPost } from '../../types/api';
import { createConsultation, type ConsultationRequestCard } from '../../services/consultationService';
import { createDefaultPackageSettings } from '../../services/companionPackageService';

export function ConsultationRequestModal({
  post,
  session,
  onClose,
  onSubmitted,
}: {
  post: FeedPost;
  session: AuthSession | null;
  onClose: () => void;
  onSubmitted: (id: string) => void;
}) {
  const settings = createDefaultPackageSettings(post.companion);
  const [card, setCard] = useState<ConsultationRequestCard>({
    date: '本周末',
    timeRange: '14:00-18:00',
    place: post.locationName || post.location,
    peopleCount: 1,
    packageId: settings.packages[0].id,
    packageName: settings.packages[0].name,
    sceneType: 'outdoor',
    needsRetouch: true,
    needsVideo: false,
    needsPolaroid: false,
    acceptsPublication: false,
    needsRoutePlanning: true,
    needsCompanionQueueing: false,
    hasTicketOrEntry: false,
    note: '',
    referenceImages: [],
  });
  const canSubmit = card.date.trim() && card.timeRange.trim() && card.place.trim();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const images = await Promise.all(Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 6).map(readFileAsDataUrl));
    setCard((current) => ({ ...current, referenceImages: images }));
  }

  function submit() {
    if (!canSubmit) return;
    const selectedPackage = settings.packages.find((item) => item.id === card.packageId) ?? settings.packages[0];
    const record = createConsultation(post, { ...card, packageName: selectedPackage.name }, session);
    onSubmitted(record.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/62" role="dialog" aria-modal="true">
      <section className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[18px] bg-[#f7f7f5] px-4 pb-6 pt-4 text-zinc-950">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-rose-500">咨询档期/报价</p>
            <h2 className="text-xl font-black">提交轻量需求卡</h2>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-200" onClick={onClose} type="button" aria-label="关闭">
            <XCircle size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="日期"><input className="field" value={card.date} onChange={(event) => setCard((current) => ({ ...current, date: event.target.value }))} /></Field>
          <Field label="时间段"><input className="field" value={card.timeRange} onChange={(event) => setCard((current) => ({ ...current, timeRange: event.target.value }))} /></Field>
          <Field label="地点"><input className="field" value={card.place} onChange={(event) => setCard((current) => ({ ...current, place: event.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="人数"><input className="field" type="number" min={1} value={card.peopleCount} onChange={(event) => setCard((current) => ({ ...current, peopleCount: Number(event.target.value) }))} /></Field>
            <Field label="套餐/时长">
              <select className="field" value={card.packageId} onChange={(event) => setCard((current) => ({ ...current, packageId: event.target.value }))}>
                {settings.packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="室外" active={card.sceneType === 'outdoor'} onClick={() => setCard((current) => ({ ...current, sceneType: 'outdoor' }))} />
            <Toggle label="室内" active={card.sceneType === 'indoor'} onClick={() => setCard((current) => ({ ...current, sceneType: 'indoor' }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Check label="需要修图" checked={card.needsRetouch} onChange={(value) => setCard((current) => ({ ...current, needsRetouch: value }))} />
            <Check label="需要视频" checked={card.needsVideo} onChange={(value) => setCard((current) => ({ ...current, needsVideo: value }))} />
            <Check label="拍立得/胶片" checked={card.needsPolaroid} onChange={(value) => setCard((current) => ({ ...current, needsPolaroid: value }))} />
            <Check label="接受客片发布" checked={card.acceptsPublication} onChange={(value) => setCard((current) => ({ ...current, acceptsPublication: value }))} />
            <Check label="需要路线规划" checked={card.needsRoutePlanning} onChange={(value) => setCard((current) => ({ ...current, needsRoutePlanning: value }))} />
            <Check label="包含陪逛/排队" checked={card.needsCompanionQueueing} onChange={(value) => setCard((current) => ({ ...current, needsCompanionQueueing: value }))} />
            <Check label="涉及门票/入园" checked={card.hasTicketOrEntry} onChange={(value) => setCard((current) => ({ ...current, hasTicketOrEntry: value }))} />
          </div>
          <Field label="文字备注">
            <textarea
              className="field min-h-28 resize-none rounded-[10px] py-3"
              placeholder="风格、参考图、穿搭妆造、是否边逛边拍、门票交通如何承担等"
              value={card.note}
              onChange={(event) => setCard((current) => ({ ...current, note: event.target.value }))}
            />
          </Field>
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white">
            <ImagePlus size={17} />
            上传参考图（最多 6 张）
            <input className="hidden" type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event.target.files)} />
          </label>
          {card.referenceImages.length ? <p className="text-xs font-bold text-zinc-400">已选择 {card.referenceImages.length} 张参考图</p> : null}
        </div>

        <button className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white ${canSubmit ? 'bg-rose-500' : 'bg-zinc-300'}`} disabled={!canSubmit} onClick={submit} type="button">
          <Send size={17} />
          提交并进入咨询
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-black">{label}</span>{children}</label>;
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={`h-10 rounded-full text-sm font-black ${active ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'}`} onClick={onClick} type="button">{label}</button>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-xs font-bold ring-1 ring-zinc-200"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
