import { ArrowLeft, CalendarDays, Clock3, Plus, Save, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import {
  bookingDurationOptions,
  companionBookingActivityNames,
  formatDateLabel,
  getDurationLabel,
} from '../../data/bookingSettings';
import type { BookingDurationMinutes, BookingTimeRange, CompanionBookingSettings, RepeatWeekday } from '../../types/api';
import { formatMoney, yuanToCents } from '../../utils/money';

const weekdayOptions: Array<{ label: string; value: RepeatWeekday }> = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
];

export function CompanionBookingSettingsPage() {
  const { bookingSettings, saveBookingSettings } = useAppData();
  const [draft, setDraft] = useState<CompanionBookingSettings>(bookingSettings);
  const [dateInput, setDateInput] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  const enabledActivities = useMemo(() => draft.activities.filter((activity) => activity.enabled), [draft.activities]);

  const updateDraft = (partial: Partial<CompanionBookingSettings>) => {
    setDraft((current) => ({ ...current, ...partial }));
  };

  const addDate = () => {
    if (!dateInput || draft.availableDates.includes(dateInput)) return;
    updateDraft({ availableDates: [...draft.availableDates, dateInput].sort() });
    setDateInput('');
  };

  const addTimeRange = () => {
    updateDraft({
      timeRanges: [
        ...draft.timeRanges,
        { id: `range-${Date.now()}`, startTime: '10:00', endTime: '12:00' },
      ],
    });
  };

  const save = () => {
    saveBookingSettings(draft);
    setSavedNotice('设置已保存，用户端预约弹窗会读取最新时间和价格。');
    window.setTimeout(() => setSavedNotice(''), 1800);
  };

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-5 pb-24">
      <header className="flex items-start gap-3">
        <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" to="/companion/mine" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-zinc-950">时间和价格设置</h1>
          <p className="mt-1 text-sm leading-6 text-zinc-500">按活动形式和陪伴时长配置，保存后会同步到用户预约弹窗。</p>
        </div>
        <button
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${draft.temporaryAccepting ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-500'}`}
          onClick={() => updateDraft({ temporaryAccepting: !draft.temporaryAccepting })}
          aria-label="切换临时接单"
          title="临时接单"
        >
          <Zap size={19} />
        </button>
      </header>

      <section className="mt-5 rounded-[8px] border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-950">临时接单</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">关闭后用户端暂不展示可预约时间。</p>
          </div>
          <button
            className={`h-8 w-14 rounded-full p-1 transition ${draft.temporaryAccepting ? 'bg-emerald-500' : 'bg-zinc-200'}`}
            onClick={() => updateDraft({ temporaryAccepting: !draft.temporaryAccepting })}
            aria-label="临时接单开关"
          >
            <span className={`block h-6 w-6 rounded-full bg-white transition ${draft.temporaryAccepting ? 'translate-x-6' : ''}`} />
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-[8px] border border-zinc-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-950">
          <CalendarDays size={18} />
          可预约日期
        </h2>
        <div className="mt-3 flex gap-2">
          <input className="h-11 min-w-0 flex-1 rounded-[8px] border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950" type="date" value={dateInput} onChange={(event) => setDateInput(event.target.value)} />
          <button className="grid h-11 w-11 place-items-center rounded-[8px] bg-zinc-950 text-white" onClick={addDate} aria-label="添加日期">
            <Plus size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft.availableDates.map((date) => (
            <button
              key={date}
              className="rounded-full bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-700"
              onClick={() => updateDraft({ availableDates: draft.availableDates.filter((item) => item !== date) })}
              title="点击移除"
            >
              {formatDateLabel(date)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[8px] border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-950">
            <Clock3 size={18} />
            可预约时间段
          </h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={addTimeRange} aria-label="添加时间段">
            <Plus size={17} />
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {draft.timeRanges.map((range) => (
            <TimeRangeRow
              key={range.id}
              range={range}
              onChange={(nextRange) =>
                updateDraft({ timeRanges: draft.timeRanges.map((item) => (item.id === range.id ? nextRange : item)) })
              }
              onRemove={() => updateDraft({ timeRanges: draft.timeRanges.filter((item) => item.id !== range.id) })}
            />
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[8px] border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-950">重复时间规则</h2>
            <p className="mt-1 text-xs text-zinc-500">按星期自动生成未来两周可约档期。</p>
          </div>
          <button
            className={`h-8 w-14 rounded-full p-1 transition ${draft.repeatEnabled ? 'bg-rose-500' : 'bg-zinc-200'}`}
            onClick={() => updateDraft({ repeatEnabled: !draft.repeatEnabled })}
            aria-label="重复时间规则开关"
          >
            <span className={`block h-6 w-6 rounded-full bg-white transition ${draft.repeatEnabled ? 'translate-x-6' : ''}`} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {weekdayOptions.map((weekday) => {
            const active = draft.repeatWeekdays.includes(weekday.value);
            return (
              <button
                key={weekday.value}
                className={`rounded-full px-3 py-2 text-xs font-bold ${active ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`}
                onClick={() => {
                  const nextWeekdays = active
                    ? draft.repeatWeekdays.filter((value) => value !== weekday.value)
                    : [...draft.repeatWeekdays, weekday.value].sort();
                  updateDraft({ repeatWeekdays: nextWeekdays });
                }}
              >
                {weekday.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-[8px] border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-950">活动形式和基础价格</h2>
          <span className="text-xs font-bold text-zinc-500">{enabledActivities.length}/{companionBookingActivityNames.length}</span>
        </div>
        <div className="mt-3 space-y-3">
          {draft.activities.map((activity) => (
            <div key={activity.id} className="rounded-[8px] border border-zinc-100 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  className={`h-7 w-12 rounded-full p-1 transition ${activity.enabled ? 'bg-rose-500' : 'bg-zinc-200'}`}
                  onClick={() =>
                    updateDraft({
                      activities: draft.activities.map((item) => (item.id === activity.id ? { ...item, enabled: !item.enabled } : item)),
                    })
                  }
                  aria-label={`启用${activity.name}`}
                >
                  <span className={`block h-5 w-5 rounded-full bg-white transition ${activity.enabled ? 'translate-x-5' : ''}`} />
                </button>
                <p className="min-w-0 flex-1 text-sm font-black text-zinc-950">{activity.name}</p>
                <p className="text-xs font-bold text-rose-500">{formatMoney(activity.basePriceCents)}</p>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_112px] gap-2">
                <select
                  className="h-10 rounded-[8px] border border-zinc-200 bg-white px-2 text-sm font-semibold outline-none"
                  value={activity.durationMinutes}
                  onChange={(event) =>
                    updateDraft({
                      activities: draft.activities.map((item) =>
                        item.id === activity.id ? { ...item, durationMinutes: Number(event.target.value) as BookingDurationMinutes } : item,
                      ),
                    })
                  }
                >
                  {bookingDurationOptions.map((option) => (
                    <option key={option.minutes} value={option.minutes}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <MoneyInput
                  valueCents={activity.basePriceCents}
                  ariaLabel={`${activity.name}基础价格`}
                  onChange={(basePriceCents) =>
                    updateDraft({
                      activities: draft.activities.map((item) => (item.id === activity.id ? { ...item, basePriceCents } : item)),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[8px] border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">加价项</h2>
        <div className="mt-3 grid gap-3">
          <AddonPrice label="精修每张加价" unit="张" valueCents={draft.retouchPriceCents} onChange={(retouchPriceCents) => updateDraft({ retouchPriceCents })} />
          <AddonPrice label="加急出图价格" unit="单" valueCents={draft.rushPriceCents} onChange={(rushPriceCents) => updateDraft({ rushPriceCents })} />
          <AddonPrice label="短视频价格" unit="条" valueCents={draft.shortVideoPriceCents} onChange={(shortVideoPriceCents) => updateDraft({ shortVideoPriceCents })} />
        </div>
      </section>

      <section className="mt-4 rounded-[8px] bg-zinc-950 p-4 text-white">
        <p className="text-xs font-semibold text-white/60">预约弹窗预览</p>
        <p className="mt-2 text-sm font-bold">
          {draft.temporaryAccepting ? `${draft.availableDates.length} 个指定日期，${draft.timeRanges.length} 个时间段` : '当前暂停接单'}
        </p>
        <p className="mt-1 text-xs text-white/58">
          默认展示 {enabledActivities[0]?.name ?? '暂无活动'} · {getDurationLabel(enabledActivities[0]?.durationMinutes ?? 120)}
        </p>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-zinc-200 bg-white/95 p-4 backdrop-blur">
        {savedNotice ? <p className="mb-2 text-center text-xs font-bold text-emerald-600">{savedNotice}</p> : null}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-black text-white shadow-lg shadow-rose-200" onClick={save}>
          <Save size={18} />
          保存设置
        </button>
      </div>
    </div>
  );
}

function TimeRangeRow({
  range,
  onChange,
  onRemove,
}: {
  range: BookingTimeRange;
  onChange: (range: BookingTimeRange) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_36px] gap-2">
      <input className="h-10 rounded-[8px] border border-zinc-200 px-2 text-sm font-semibold outline-none" type="time" value={range.startTime} onChange={(event) => onChange({ ...range, startTime: event.target.value })} aria-label="开始时间" />
      <input className="h-10 rounded-[8px] border border-zinc-200 px-2 text-sm font-semibold outline-none" type="time" value={range.endTime} onChange={(event) => onChange({ ...range, endTime: event.target.value })} aria-label="结束时间" />
      <button className="grid h-10 w-9 place-items-center rounded-[8px] bg-zinc-100 text-zinc-500" onClick={onRemove} aria-label="删除时间段">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function AddonPrice({ label, unit, valueCents, onChange }: { label: string; unit: string; valueCents: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-[8px] bg-zinc-50 p-3">
      <span>
        <span className="block text-sm font-bold text-zinc-900">{label}</span>
        <span className="mt-1 block text-xs text-zinc-500">按{unit}计费</span>
      </span>
      <MoneyInput valueCents={valueCents} onChange={onChange} ariaLabel={label} />
    </label>
  );
}

function MoneyInput({ valueCents, onChange, ariaLabel }: { valueCents: number; onChange: (value: number) => void; ariaLabel: string }) {
  return (
    <div className="flex h-10 items-center rounded-[8px] border border-zinc-200 bg-white px-2">
      <span className="text-sm font-bold text-zinc-400">¥</span>
      <input
        className="min-w-0 flex-1 bg-transparent pl-1 text-right text-sm font-bold text-zinc-950 outline-none"
        type="number"
        min="0"
        value={Math.round(valueCents / 100)}
        onChange={(event) => onChange(yuanToCents(Number(event.target.value)))}
        aria-label={ariaLabel}
      />
    </div>
  );
}
