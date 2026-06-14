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

export function CompanionBookingSettingsPage() {
  const { bookingSettings, orders, saveBookingSettings } = useAppData();
  const [draft, setDraft] = useState<CompanionBookingSettings>(() => ensureWeeklyRanges(bookingSettings));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [savedNotice, setSavedNotice] = useState('');

  const occupiedOrders = useMemo(() => getScheduleOrders(orders), [orders]);
  const routeWarnings = useMemo(() => getRouteWarnings(occupiedOrders), [occupiedOrders]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);

  const updateDraft = (partial: Partial<CompanionBookingSettings>) => {
    setDraft((current) => ensureWeeklyRanges({ ...current, ...partial }));
  };

  const updateDayRanges = (weekday: RepeatWeekday, ranges: BookingTimeRange[]) => {
    const nextWeeklyTimeRanges = { ...(draft.weeklyTimeRanges ?? {}), [weekday]: ranges };
    updateDraft({
      weeklyTimeRanges: nextWeeklyTimeRanges,
      repeatWeekdays: ranges.length
        ? Array.from(new Set([...draft.repeatWeekdays, weekday])).sort() as RepeatWeekday[]
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

  const save = () => {
    saveBookingSettings(normalizeDraftForSave(draft));
    setSavedNotice('档期课表已保存，用户端预约会读取最新可约时间。');
    window.setTimeout(() => setSavedNotice(''), 1800);
  };

  return (
    <div className="min-h-dvh bg-zinc-50 px-4 py-5 pb-24">
      <header className="flex items-start gap-3">
        <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-zinc-700 ring-1 ring-zinc-200" to="/companion/mine" aria-label="返回我的">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-zinc-950">档期设置</h1>
          <p className="mt-1 text-sm leading-6 text-zinc-500">按周课表维护空闲档期，订单占用会自动变灰不可选择。</p>
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
            <p className="mt-1 text-xs leading-5 text-zinc-500">关闭后用户端暂不展示可预约档期。</p>
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

      {routeWarnings.length ? (
        <section className="mt-4 rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <h2 className="flex items-center gap-2 text-base font-black">
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

      <section className="mt-4 rounded-[8px] border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-zinc-950">
              <CalendarDays size={18} />
              周课表
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{formatWeekRange(weekStart)} · 右侧切换周次</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="上一周">
              <ChevronLeft size={18} />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="下一周">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 rounded-[8px] bg-zinc-100 p-1 text-center text-[11px] font-black text-zinc-500">
          {weekDays.map((day) => (
            <span key={day.dateValue} className="rounded-[6px] bg-white py-1.5">
              {day.short}
              <span className="mt-0.5 block text-[10px] text-zinc-400">{day.month}/{day.day}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {weekDays.map((day) => (
            <DaySchedule
              key={day.dateValue}
              day={day}
              ranges={getDayRanges(draft, day.weekday)}
              orders={getOrdersForDate(occupiedOrders, day.dateValue)}
              onAdd={() => addRange(day.weekday)}
              onChange={(rangeId, patch) => updateRange(day.weekday, rangeId, patch)}
              onRemove={(rangeId) => removeRange(day.weekday, rangeId)}
            />
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[8px] bg-zinc-950 p-4 text-white">
        <p className="text-xs font-semibold text-white/60">预约弹窗预览</p>
        <p className="mt-2 text-sm font-bold">
          {draft.temporaryAccepting ? `${countWeeklyRanges(draft)} 条周课表档期，${occupiedOrders.length} 个订单占用` : '当前暂停接单'}
        </p>
        <p className="mt-1 text-xs text-white/58">价格、套餐、定金和加价规则统一在“套餐与报价”里维护。</p>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-zinc-200 bg-white/95 p-4 backdrop-blur">
        {savedNotice ? <p className="mb-2 text-center text-xs font-bold text-emerald-600">{savedNotice}</p> : null}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-black text-white shadow-lg shadow-rose-200" onClick={save}>
          <Save size={18} />
          保存课表
        </button>
      </div>
    </div>
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
    <div className="rounded-[8px] border border-zinc-100 bg-zinc-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-zinc-950">{day.label}</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-400">{day.month}月{day.day}日</p>
        </div>
        <button className="flex h-9 items-center gap-1 rounded-full bg-zinc-950 px-3 text-xs font-black text-white" onClick={onAdd} type="button">
          <Plus size={15} />
          添加
        </button>
      </div>

      <div className="relative mt-3 h-8 rounded-full bg-white ring-1 ring-zinc-200">
        <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-zinc-100" />
        {ranges.map((range) => (
          <div key={range.id} className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-emerald-400" style={getSegmentStyle(range.startTime, range.endTime)} />
        ))}
        {orders.map((order) => (
          <div
            key={order.id}
            className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full bg-zinc-400/75"
            style={getSegmentStyle(formatOrderTime(order), formatOrderEndTime(order))}
            title={`${order.orderNo} ${order.place}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-zinc-300">
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>

      <div className="mt-3 space-y-3">
        {ranges.map((range) => (
          <TimeRangeSlider
            key={range.id}
            range={range}
            onChange={(patch) => onChange(range.id, patch)}
            onRemove={() => onRemove(range.id)}
          />
        ))}
        {orders.map((order) => (
          <div key={order.id} className="rounded-[8px] bg-zinc-200 px-3 py-2 text-xs font-bold leading-5 text-zinc-500">
            已占用 {formatOrderTime(order)}-{formatOrderEndTime(order)} · {order.orderNo} · {order.place}
          </div>
        ))}
        {!ranges.length && !orders.length ? <p className="rounded-[8px] bg-white px-3 py-4 text-center text-xs font-bold text-zinc-300">当天还没有空闲档期</p> : null}
      </div>
    </div>
  );
}

function TimeRangeSlider({ range, onChange, onRemove }: { range: BookingTimeRange; onChange: (patch: Partial<BookingTimeRange>) => void; onRemove: () => void }) {
  const start = timeToMinutes(range.startTime);
  const end = timeToMinutes(range.endTime);

  return (
    <div className="rounded-[8px] bg-white p-3 ring-1 ring-zinc-100">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-zinc-950">{range.startTime} - {range.endTime}</p>
        <button className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-500" onClick={onRemove} aria-label="删除时间段" type="button">
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
      warnings.push(
        `${formatOrderTime(current)} ${current.place} 到 ${formatOrderTime(next)} ${next.place} 间隔 ${gapMinutes} 分钟，地点相隔较远或换场时间偏短，请提前调整路线或沟通改期。`,
      );
    }
  }

  return warnings;
}

function getSegmentStyle(startTime: string, endTime: string) {
  const start = Math.max(dayStartMinutes, Math.min(dayEndMinutes, timeToMinutes(startTime)));
  const end = Math.max(start + sliderStepMinutes, Math.min(dayEndMinutes, timeToMinutes(endTime)));
  return {
    left: `${((start - dayStartMinutes) / dayTotalMinutes) * 100}%`,
    width: `${((end - start) / dayTotalMinutes) * 100}%`,
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

function timeToMinutes(time: string) {
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

function minutesToTime(totalMinutes: number) {
  const minutes = Math.max(dayStartMinutes, Math.min(dayEndMinutes, totalMinutes));
  if (minutes >= dayEndMinutes) return '24:00';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
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
