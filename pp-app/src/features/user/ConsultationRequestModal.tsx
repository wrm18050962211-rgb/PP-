import { ImagePlus, LocateFixed, MapPin, Send, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AuthSession, FeedPost } from '../../types/api';
import { createConsultation, type ConsultationRequestCard } from '../../services/consultationService';
import { createDefaultPackageSettings } from '../../services/companionPackageService';
import { requestConsumerLocation } from '../../services/locationService';

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
  const dateOptions = useMemo(() => buildDateOptions(45), []);
  const timeOptions = useMemo(() => buildTimeOptions(), []);
  const placeOptions = useMemo(() => buildPlaceOptions(post), [post]);
  const [card, setCard] = useState<ConsultationRequestCard>({
    date: dateOptions[0]?.value ?? '',
    timeRange: '14:00-18:00',
    place: post.locationName || post.location,
    placeLat: post.lat,
    placeLng: post.lng,
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
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('18:00');
  const [mapOpen, setMapOpen] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const canSubmit = card.date.trim() && card.timeRange.trim() && card.place.trim();

  function updateTimeRange(nextStart: string, nextEnd: string) {
    const safeEnd = timeToMinutes(nextEnd) > timeToMinutes(nextStart) ? nextEnd : getNextTimeOption(nextStart, timeOptions);
    setStartTime(nextStart);
    setEndTime(safeEnd);
    setCard((current) => ({ ...current, timeRange: `${nextStart}-${safeEnd}` }));
  }

  async function useCurrentLocation() {
    setLocationStatus('正在获取定位...');
    try {
      const location = await requestConsumerLocation();
      setCard((current) => ({
        ...current,
        place: `当前位置 ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        placeLat: location.lat,
        placeLng: location.lng,
      }));
      setLocationStatus(`已定位，精度约 ${Math.round(location.accuracy ?? 0)}m`);
    } catch {
      setLocationStatus('定位失败，请在地图候选点中选择或检查浏览器定位权限');
    }
  }

  function selectPlace(place: PlaceOption) {
    setCard((current) => ({ ...current, place: place.label, placeLat: place.lat, placeLng: place.lng }));
    setMapOpen(false);
    setLocationStatus(place.lat && place.lng ? `已选择地图点：${place.label}` : '');
  }

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/62 px-0 sm:px-3" role="dialog" aria-modal="true">
      <section className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[22px] border border-zinc-200 bg-[#f7f7f5] px-3 pb-6 pt-3 text-zinc-950 shadow-[0_-22px_70px_rgba(0,0,0,0.28)] sm:rounded-[22px]">
        <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between bg-[#f7f7f5]/95 px-3 pb-3 pt-1 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs font-black text-rose-500">咨询档期/报价</p>
            <h2 className="truncate text-xl font-black tracking-normal text-zinc-950">提交轻量需求卡</h2>
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-200 backdrop-blur" onClick={onClose} type="button" aria-label="关闭">
            <XCircle size={18} />
          </button>
        </div>

        <div className="grid gap-3 pt-3">
          <Field label="日期">
            <select className="field" value={card.date} onChange={(event) => setCard((current) => ({ ...current, date: event.target.value }))}>
              {dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始时间">
              <select className="field" value={startTime} onChange={(event) => updateTimeRange(event.target.value, endTime)}>
                {timeOptions.slice(0, -1).map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </Field>
            <Field label="结束时间">
              <select className="field" value={endTime} onChange={(event) => updateTimeRange(startTime, event.target.value)}>
                {timeOptions.filter((time) => timeToMinutes(time) > timeToMinutes(startTime)).map((time) => <option key={time} value={time}>{time}</option>)}
              </select>
            </Field>
          </div>
          <Field label="地点">
            <select className="field" value={card.place} onChange={(event) => selectPlace(placeOptions.find((place) => place.label === event.target.value) ?? { label: event.target.value })}>
              {placeOptions.map((place) => <option key={place.label} value={place.label}>{place.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-white text-xs font-black text-zinc-800 ring-1 ring-zinc-200 backdrop-blur" onClick={() => void useCurrentLocation()} type="button">
              <LocateFixed size={15} />
              使用当前位置
            </button>
            <button className="flex h-10 items-center justify-center gap-2 rounded-full bg-white text-xs font-black text-zinc-800 ring-1 ring-zinc-200 backdrop-blur" onClick={() => setMapOpen((value) => !value)} type="button">
              <MapPin size={15} />
              地图选择
            </button>
          </div>
          {locationStatus ? <p className="rounded-[8px] bg-white px-3 py-2 text-xs font-bold leading-5 text-zinc-400 ring-1 ring-zinc-100">{locationStatus}</p> : null}
          {mapOpen ? (
            <div className="rounded-[14px] bg-white p-3 ring-1 ring-zinc-200">
              <p className="text-xs font-black text-zinc-500">地图候选点</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {placeOptions.map((place) => (
                  <button key={place.label} className="min-h-10 rounded-[10px] bg-zinc-100 px-3 py-2 text-left text-xs font-bold leading-4 text-zinc-700 ring-1 ring-zinc-100" onClick={() => selectPlace(place)} type="button">
                    {place.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="人数">
              <select className="field" value={card.peopleCount} onChange={(event) => setCard((current) => ({ ...current, peopleCount: Number(event.target.value) }))}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}人</option>)}
              </select>
            </Field>
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

        <button className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white ${canSubmit ? 'bg-zinc-950' : 'bg-zinc-300'}`} disabled={!canSubmit} onClick={submit} type="button">
          <Send size={17} />
          提交并进入咨询
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-zinc-950">{label}</span>
      <span className="block [&_.field]:min-h-11 [&_.field]:w-full [&_.field]:rounded-[10px] [&_.field]:border [&_.field]:border-zinc-100 [&_.field]:bg-white [&_.field]:px-3 [&_.field]:text-sm [&_.field]:font-black [&_.field]:text-zinc-950 [&_.field]:outline-none [&_.field]:placeholder:text-zinc-300 [&_option]:bg-white [&_option]:text-zinc-950">
        {children}
      </span>
    </label>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button className={`h-10 rounded-full text-sm font-black ${active ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'}`} onClick={onClick} type="button">{label}</button>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-10 items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-xs font-bold text-zinc-950 ring-1 ring-zinc-200"><input className="h-4 w-4 accent-zinc-950" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

type PlaceOption = {
  label: string;
  lat?: number;
  lng?: number;
};

function buildDateOptions(days: number) {
  const formatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const value = date.toISOString().slice(0, 10);
    const prefix = index === 0 ? '今天' : index === 1 ? '明天' : index === 2 ? '后天' : '';
    return {
      value,
      label: [prefix, formatter.format(date)].filter(Boolean).join(' · '),
    };
  });
}

function buildTimeOptions() {
  const options: string[] = [];
  for (let minutes = 6 * 60; minutes <= 24 * 60; minutes += 15) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  return options;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function getNextTimeOption(startTime: string, options: string[]) {
  return options.find((time) => timeToMinutes(time) > timeToMinutes(startTime)) ?? options.at(-1) ?? startTime;
}

function buildPlaceOptions(post: FeedPost): PlaceOption[] {
  const basePlaces: PlaceOption[] = [
    { label: post.locationName || post.location, lat: post.lat, lng: post.lng },
    { label: post.location, lat: post.lat, lng: post.lng },
    ...post.companion.areas.map((area) => ({ label: `${post.companion.baseCity} · ${area}` })),
    { label: '上海 · 武康路', lat: 31.2104, lng: 121.4386 },
    { label: '上海 · 安福路', lat: 31.2172, lng: 121.4472 },
    { label: '上海 · 静安寺', lat: 31.2231, lng: 121.4451 },
    { label: '上海 · 外滩', lat: 31.2397, lng: 121.4903 },
    { label: '上海 · 新天地', lat: 31.2197, lng: 121.4752 },
  ];
  const seen = new Set<string>();
  return basePlaces.filter((place) => {
    if (!place.label || seen.has(place.label)) return false;
    seen.add(place.label);
    return true;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
