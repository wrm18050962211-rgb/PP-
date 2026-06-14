import { AlertTriangle, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, Save, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import type { AppOrder, BookingTimeRange, CompanionBookingSettings, RepeatWeekday } from '../../types/api';

const weekdayOptions: Array<{ label: string; short: string; value: RepeatWeekday }> = [
  { label: '周一', short: '一', value: 1 },
  { label: '周二', short: '二', value: 2 },
  { label: '周三', short: '三', value: 3 },
  { label: '周四', short: '四', value: 4 },
  { label: '周五', short: '五', value: 5 },
  { label: '周六', short: '六', value: 6 },
  { label: '周日', short: '日', value: 0 },
];

const dayStartMinutes = 6 * 60;
const dayEndMinutes = 24 * 60;
const dayTotalMinutes = dayEndMinutes - dayStartMinutes;
const sliderStepMinutes = 15;
const timelineHours = Array.from({ length: 19 }, (_, index) => dayStartMinutes + index * 60);

export function CompanionBookingSettingsPage() {
  const { bookingSettings, orders, saveBookingSettings } = useAppData();
  const [draft, setDraft] = useState<CompanionBookingSettings>(() => ensureWeeklyRanges(bookingSettings));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDateValue, setSelectedDateValue] = useState(() => toDateValue(new Date()));
  const [savedNotice, setSavedNotice] = useState('');

  const occupiedOrders = useMemo(() => getScheduleOrders(orders), [orders]);
  const routeWarnings = useMemo(() => getRouteWarnings(occupiedOrders), [occupiedOrders]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const selectedDay = weekDays.find((day) => day.dateValue === selectedDateValue) ?? weekDays[0];
  const selectedRanges = selectedDay ? getDayRanges(draft, selectedDay.weekday) : [];
  const selectedOrders = selectedDay ? getOrdersForDate(occupiedOrders, selectedDay.dateValue) : [];

  const updateDraft = (partial: Partial<CompanionBookingSettings>) => {
    setDraft((current) => ensureWeeklyRanges({ ...current, ...partial }));
  };

  const updateDayRanges = (weekday: RepeatWeekday, ranges: BookingTimeRange[]) => {
    const nextWeeklyTimeRanges = { ...(draft.weeklyTimeRanges ?? {}), [weekday]: ranges };
    updateDraft({
      weeklyTimeRanges: nextWeeklyTimeRanges,
      repeatWeekdays: ranges.length
        ? (Array.from(new Set([...draft.repeatWeekdays, weekday])).sort() as RepeatWeekday[])
        : draft.repeatWeekdays.filter((value) => value !== weekday),
    });
  };

  const addRange = (weekday: RepeatWeekday) => {
    const ranges = getDayRanges(draft, weekday);
    updateDayRanges(weekday, [...ranges, { id: `weekday-${weekday}-${Date.now()}`, startTime: '10:00', endTime: '12:00' }]);
  };

  const updateRange = (weekday: RepeatWeekday, rangeId: string, patch: Partial<BookingTimeRange>) => {
    updateDayRanges(
      weekday,
      getDayRanges(draft, weekday).map((range) => {
        if (range.id !== rangeId) return range;
        const nextRange = { ...range, ...patch };
        const start = timeToMinutes(nextRange.startTime);
        const end = timeToMinutes(nextRange.endTime);
        if (end <= start) nextRange.endTime = minutesToTime(Math.min(dayEndMinutes, start + sliderStepMinutes));
        return nextRange;
      }),
    );
  };

  const removeRange = (weekday: RepeatWeekday, rangeId: string) => {
    updateDayRanges(weekday, getDayRanges(draft, weekday).filter((range) => range.id !== rangeId));
  };

  const moveWeek = (days: number) => {
    const nextStart = addDays(weekStart, days);
    setWeekStart(nextStart);
    setSelectedDateValue(toDateValue(nextStart));
  };

  const save = () => {
    saveBookingSettings(normalizeDraftForSave(draft));
    setSavedNotice('档期课表已保存，用户端预约会读取最新可约时间。');
    window.setTimeout(() => setSavedNotice(''), 1800);
  };

  return (
    <div className="min-h-dvh bg-black pb-28 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link className="inline-flex h-11 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-black text-white" to="/companion/mine" aria-label="返回我的">
            <ArrowLeft size={20} />
            档期
          </Link>
          <div className="flex items-center gap-2 rounded-full bg-white/10 p-1">
            <button className="grid h-9 w-9 place-items-center rounded-full text-white" onClick={() => moveWeek(-7)} aria-label="上一周">
              <ChevronLeft size={18} />
            </button>
            <button
              className={`grid h-9 w-9 place-items-center rounded-full ${draft.temporaryAccepting ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/50'}`}
              onClick={() => updateDraft({ temporaryAccepting: !draft.temporaryAccepting })}
              aria-label="临时接单"
              title="临时接单"
            >
              <Zap size={17} />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full text-white" onClick={() => moveWeek(7)} aria-label="下一周">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const isSelected = selectedDateValue === day.dateValue;
            return (
              <button
                key={day.dateValue}
                type="button"
                className="grid justify-items-center gap-1 rounded-[8px] py-1 text-center"
                onClick={() => setSelectedDateValue(day.dateValue)}
              >
                <span className={`text-[11px] font-black ${isSelected ? 'text-white' : 'text-white/55'}`}>{day.short}</span>
                <span className={`grid h-10 w-10 place-items-center rounded-full text-lg font-black ${isSelected ? 'bg-white text-black' : 'text-white/80'}`}>
                  {day.day}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {routeWarnings.length ? (
        <section className="mx-4 mt-4 rounded-[8px] border border-amber-300/30 bg-amber-400/15 p-4 text-amber-100">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <AlertTriangle size={18} />
            路线时间预警
          </h2>
          <div className="mt-3 space-y-2">
            {routeWarnings.map((warning) => (
              <p key={warning} className="text-xs font-semibold leading-5">
                {warning}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <main className="px-4">
        <section className="py-5 text-center">
          <p className="text-lg font-black">{selectedDay ? formatFullDate(selectedDay.date) : formatWeekRange(weekStart)}</p>
          <p className="mt-1 text-sm font-bold text-white/45">{draft.temporaryAccepting ? '正在接单' : '当前暂停接单'}</p>
        </section>

        {selectedDay ? (
          <DayTimeline
            day={selectedDay}
            ranges={selectedRanges}
            orders={selectedOrders}
            onAdd={() => addRange(selectedDay.weekday)}
          />
        ) : null}

        {selectedDay ? (
          <DaySchedule
            day={selectedDay}
            ranges={selectedRanges}
            orders={selectedOrders}
            onAdd={() => addRange(selectedDay.weekday)}
            onChange={(rangeId, patch) => updateRange(selectedDay.weekday, rangeId, patch)}
            onRemove={(rangeId) => removeRange(selectedDay.weekday, rangeId)}
          />
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-white/10 bg-black/90 p-4 backdrop-blur">
        {savedNotice ? <p className="mb-2 text-center text-xs font-bold text-blue-300">{savedNotice}</p> : null}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black" onClick={save}>
          <Save size={18} />
          保存档期
        </button>
      </div>
    </div>
  );
}

function DayTimeline({ day, ranges, orders, onAdd }: { day: WeekDay; ranges: BookingTimeRange[]; orders: AppOrder[]; onAdd: () => void }) {
  return (
    <section className="rounded-[8px] border border-white/10 bg-black">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-black text-white/55">
          <CalendarDays size={16} />
          <span>蓝色可约 · 灰色占用 · 空白不可约</span>
        </div>
        <button className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3 text-xs font-black text-black" type="button" onClick={onAdd}>
          <Plus size={15} />
          添加
        </button>
      </div>

      <div className="relative min-h-[900px]">
        <div className="absolute inset-y-0 left-0 w-[58px] bg-black" />
        <div className="absolute inset-y-0 left-[58px] right-0">
          {timelineHours.map((minute) => (
            <div key={minute} className="absolute left-0 right-0 border-t border-white/10" style={{ top: `${((minute - dayStartMinutes) / dayTotalMinutes) * 100}%` }} />
          ))}
        </div>
        <div className="absolute inset-y-0 left-0 w-[58px]">
          {timelineHours.map((minute) => (
            <span
              key={minute}
              className="absolute right-2 -translate-y-1/2 text-[11px] font-bold text-white/35"
              style={{ top: `${((minute - dayStartMinutes) / dayTotalMinutes) * 100}%` }}
            >
              {formatHourLabel(minute)}
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 left-[64px] right-0">
          {ranges.map((range) => (
            <div
              key={range.id}
              className="absolute left-0 right-2 rounded-[6px] border border-blue-300/35 bg-blue-500/35 px-3 py-2 text-blue-100 shadow-[inset_4px_0_0_rgba(147,197,253,0.95)]"
              style={getTimelineBlockStyle(range.startTime, range.endTime)}
            >
              <p className="text-sm font-black">可预约</p>
              <p className="mt-0.5 text-xs font-bold text-blue-100/75">{range.startTime} - {range.endTime}</p>
            </div>
          ))}
          {orders.map((order) => (
            <div
              key={order.id}
              className="absolute left-0 right-2 rounded-[6px] border border-zinc-300/20 bg-zinc-500/70 px-3 py-2 text-white shadow-[inset_4px_0_0_rgba(212,212,216,0.9)]"
              style={getTimelineBlockStyle(formatOrderTime(order), formatOrderEndTime(order))}
            >
              <p className="truncate text-sm font-black">{order.title || order.orderNo}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-white/75">
                {formatOrderTime(order)} - {formatOrderEndTime(order)} · {order.place}
              </p>
            </div>
          ))}
        </div>
      </div>
      {!ranges.length && !orders.length ? (
        <p className="border-t border-white/10 px-4 py-5 text-center text-xs font-bold text-white/35">
          {day.month}/{day.day} 暂无可预约档期，点击添加创建时间段。
        </p>
      ) : null}
    </section>
  );
}

function DaySchedule({
  day,
  ranges,
  orders,
  onAdd,
  onChange,
  onRemove,
}: {
  day: WeekDay;
  ranges: BookingTimeRange[];
  orders: AppOrder[];
  onAdd: () => void;
  onChange: (rangeId: string, patch: Partial<BookingTimeRange>) => void;
  onRemove: (rangeId: string) => void;
}) {
  return (
    <section className="mt-4 rounded-[8px] bg-white p-4 text-black">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-black">编辑 {day.label}</p>
          <p className="mt-0.5 text-xs font-bold text-zinc-400">{day.month}月{day.day}日 · 调整后记得保存</p>
        </div>
        <button className="flex h-9 items-center gap-1 rounded-full bg-black px-3 text-xs font-black text-white" onClick={onAdd} type="button">
          <Plus size={15} />
          添加
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {ranges.map((range) => (
          <TimeRangeSlider
            key={range.id}
            range={range}
            onChange={(patch) => onChange(range.id, patch)}
            onRemove={() => onRemove(range.id)}
          />
        ))}
        {orders.map((order) => (
          <div key={order.id} className="rounded-[8px] bg-zinc-100 px-3 py-2 text-xs font-bold leading-5 text-zinc-500">
            已占用 {formatOrderTime(order)}-{formatOrderEndTime(order)} · {order.orderNo} · {order.place}
          </div>
        ))}
        {!ranges.length && !orders.length ? <p className="rounded-[8px] bg-zinc-50 px-3 py-4 text-center text-xs font-bold text-zinc-300">当天还没有空闲档期</p> : null}
      </div>
    </section>
  );
}

function TimeRangeSlider({ range, onChange, onRemove }: { range: BookingTimeRange; onChange: (patch: Partial<BookingTimeRange>) => void; onRemove: () => void }) {
  const start = timeToMinutes(range.startTime);
  const end = timeToMinutes(range.endTime);

  return (
    <div className="rounded-[8px] bg-zinc-50 p-3 ring-1 ring-zinc-100">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-zinc-950">{range.startTime} - {range.endTime}</p>
        <button className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-100" onClick={onRemove} aria-label="删除时间段" type="button">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        <label className="grid grid-cols-[42px_1fr_48px] items-center gap-2 text-xs font-bold text-zinc-400">
          起始
          <input
            type="range"
            min={dayStartMinutes}
            max={dayEndMinutes - sliderStepMinutes}
            step={sliderStepMinutes}
            value={start}
            onChange={(event) => {
              const nextStart = Number(event.target.value);
              onChange({ startTime: minutesToTime(nextStart), endTime: minutesToTime(Math.max(end, nextStart + sliderStepMinutes)) });
            }}
          />
          <span className="text-right text-zinc-600">{range.startTime}</span>
        </label>
        <label className="grid grid-cols-[42px_1fr_48px] items-center gap-2 text-xs font-bold text-zinc-400">
          终止
          <input
            type="range"
            min={dayStartMinutes + sliderStepMinutes}
            max={dayEndMinutes}
            step={sliderStepMinutes}
            value={end}
            onChange={(event) => {
              const nextEnd = Number(event.target.value);
              onChange({ startTime: minutesToTime(Math.min(start, nextEnd - sliderStepMinutes)), endTime: minutesToTime(nextEnd) });
            }}
          />
          <span className="text-right text-zinc-600">{range.endTime}</span>
        </label>
      </div>
    </div>
  );
}

type WeekDay = {
  date: Date;
  dateValue: string;
  weekday: RepeatWeekday;
  label: string;
  short: string;
  month: number;
  day: number;
};

function ensureWeeklyRanges(settings: CompanionBookingSettings): CompanionBookingSettings {
  if (settings.weeklyTimeRanges) return settings;
  const weeklyTimeRanges = Object.fromEntries(settings.repeatWeekdays.map((weekday) => [weekday, settings.timeRanges])) as Partial<Record<RepeatWeekday, BookingTimeRange[]>>;
  return { ...settings, weeklyTimeRanges };
}

function normalizeDraftForSave(settings: CompanionBookingSettings): CompanionBookingSettings {
  const weeklyTimeRanges = settings.weeklyTimeRanges ?? {};
  const repeatWeekdays = weekdayOptions.map((item) => item.value).filter((weekday) => (weeklyTimeRanges[weekday]?.length ?? 0) > 0);
  const firstRanges = repeatWeekdays.flatMap((weekday) => weeklyTimeRanges[weekday] ?? []).slice(0, 3);
  return {
    ...settings,
    repeatEnabled: true,
    repeatWeekdays,
    timeRanges: firstRanges.length ? firstRanges : settings.timeRanges,
    weeklyTimeRanges,
  };
}

function getDayRanges(settings: CompanionBookingSettings, weekday: RepeatWeekday) {
  return [...(settings.weeklyTimeRanges?.[weekday] ?? [])].sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
}

function countWeeklyRanges(settings: CompanionBookingSettings) {
  return weekdayOptions.reduce((count, weekday) => count + getDayRanges(settings, weekday.value).length, 0);
}

function getScheduleOrders(orders: AppOrder[]) {
  return orders
    .filter((order) => ['confirmed', 'in_service', 'completed'].includes(order.status) && order.startAt && order.endAt)
    .sort((left, right) => new Date(left.startAt || '').getTime() - new Date(right.startAt || '').getTime());
}

function getOrdersForDate(orders: AppOrder[], dateValue: string) {
  return orders.filter((order) => toDateValue(new Date(order.startAt || order.createdAt)) === dateValue);
}

function getRouteWarnings(orders: AppOrder[]) {
  const activeOrders = orders.filter((order) => order.status === 'confirmed' || order.status === 'in_service');
  const warnings: string[] = [];

  for (let index = 0; index < activeOrders.length - 1; index += 1) {
    const current = activeOrders[index];
    const next = activeOrders[index + 1];
    const currentEnd = new Date(current.endAt || '').getTime();
    const nextStart = new Date(next.startAt || '').getTime();
    if (!Number.isFinite(currentEnd) || !Number.isFinite(nextStart)) continue;
    if (!isSameLocalDate(current.endAt || '', next.startAt || '')) continue;

    const gapMinutes = Math.round((nextStart - currentEnd) / 60000);
    const differentPlace = normalizePlace(current.place) !== normalizePlace(next.place);
    if (differentPlace && gapMinutes >= 0 && gapMinutes < 90) {
      warnings.push(`${formatOrderTime(current)} ${current.place} 到 ${formatOrderTime(next)} ${next.place} 间隔 ${gapMinutes} 分钟，地点相隔较远或换场时间偏短，请提前调整路线或沟通改期。`);
    }
  }

  return warnings;
}

function getTimelineBlockStyle(startTime: string, endTime: string) {
  const start = Math.max(dayStartMinutes, Math.min(dayEndMinutes, timeToMinutes(startTime)));
  const end = Math.max(start + sliderStepMinutes, Math.min(dayEndMinutes, timeToMinutes(endTime)));
  return {
    top: `${((start - dayStartMinutes) / dayTotalMinutes) * 100}%`,
    height: `max(36px, ${((end - start) / dayTotalMinutes) * 100}%)`,
  };
}

function buildWeekDays(start: Date): WeekDay[] {
  return weekdayOptions.map((weekday, index) => {
    const date = addDays(start, index);
    return {
      date,
      dateValue: toDateValue(date),
      weekday: weekday.value,
      label: weekday.label,
      short: weekday.short,
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  });
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + delta);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
}

function formatFullDate(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function timeToMinutes(time: string) {
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

function minutesToTime(totalMinutes: number) {
  const minutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes, totalMinutes));
  if (minutes >= dayEndMinutes) return '24:00';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function formatHourLabel(totalMinutes: number) {
  if (totalMinutes === 12 * 60) return '正午';
  if (totalMinutes === 24 * 60) return '午夜';
  const hour = Math.floor(totalMinutes / 60);
  if (hour < 12) return `上午${hour}时`;
  return `下午${hour - 12}时`;
}

function isSameLocalDate(left: string, right: string) {
  return new Date(left).toLocaleDateString('zh-CN') === new Date(right).toLocaleDateString('zh-CN');
}

function normalizePlace(place: string) {
  return place.replace(/^上海\s*[·\-]\s*/, '').trim();
}

function formatOrderTime(order: AppOrder) {
  return new Date(order.startAt || order.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatOrderEndTime(order: AppOrder) {
  return new Date(order.endAt || order.startAt || order.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
