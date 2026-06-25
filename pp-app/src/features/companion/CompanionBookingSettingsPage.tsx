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

type ScheduleApplyMode = NonNullable<CompanionBookingSettings['scheduleApplyMode']>;

const dayStartMinutes = 6 * 60;
const dayEndMinutes = 24 * 60;
const dayTotalMinutes = dayEndMinutes - dayStartMinutes;
const sliderStepMinutes = 15;
const defaultRangeMinutes = 2 * 60;
const timelineHours = Array.from({ length: 19 }, (_, index) => dayStartMinutes + index * 60);

export function CompanionBookingSettingsPage() {
  const { bookingSettings, orders, saveBookingSettings } = useAppData();
  const [draft, setDraft] = useState<CompanionBookingSettings>(() => ensureBookingSettings(bookingSettings));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDateValue, setSelectedDateValue] = useState(() => toDateValue(new Date()));
  const [expandedDateValue, setExpandedDateValue] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  const today = new Date();
  const todayValue = toDateValue(today);
  const nowMinutes = getCurrentMinutes(today);
  const occupiedOrders = useMemo(() => getScheduleOrders(orders), [orders]);
  const routeWarnings = useMemo(() => getRouteWarnings(occupiedOrders), [occupiedOrders]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const weekKey = toDateValue(weekStart);
  const applyMode = draft.scheduleApplyMode ?? 'weekly';
  const expandedDay = weekDays.find((day) => day.dateValue === expandedDateValue) ?? null;
  const selectedDay = expandedDay ?? weekDays.find((day) => day.dateValue === selectedDateValue) ?? weekDays[0];
  const selectedRanges = selectedDay ? getDayRanges(draft, selectedDay.weekday, weekKey) : [];
  const selectedOrders = selectedDay ? getOrdersForDate(occupiedOrders, selectedDay.dateValue) : [];

  const showNotice = (message: string) => {
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(''), 1800);
  };

  const updateDraft = (partial: Partial<CompanionBookingSettings>) => {
    setDraft((current) => ensureBookingSettings({ ...current, ...partial }));
  };

  const setApplyMode = (mode: ScheduleApplyMode) => {
    setDraft((current) => {
      const ensuredSettings = ensureBookingSettings(current);
      if (mode === 'single_week') {
        const currentWeekRanges = getWeekOverrideWithFallback(ensuredSettings, weekKey);
        return ensureBookingSettings({
          ...ensuredSettings,
          scheduleApplyMode: mode,
          repeatEnabled: false,
          weekOverrides: {
            ...(ensuredSettings.weekOverrides ?? {}),
            [weekKey]: currentWeekRanges,
          },
          availableDates: buildAvailableDatesForWeek(weekStart, currentWeekRanges),
        });
      }

      return ensureBookingSettings({
        ...ensuredSettings,
        scheduleApplyMode: mode,
        repeatEnabled: true,
      });
    });
    setExpandedDateValue('');
  };

  const updateDayRanges = (weekday: RepeatWeekday, ranges: BookingTimeRange[]) => {
    const nextRanges = [...ranges].sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
    if (applyMode === 'single_week') {
      const currentWeek = getWeekOverrideWithFallback(draft, weekKey);
      updateDraft({
        weekOverrides: {
          ...(draft.weekOverrides ?? {}),
          [weekKey]: { ...currentWeek, [weekday]: nextRanges },
        },
        availableDates: buildAvailableDatesForWeek(weekStart, {
          ...currentWeek,
          [weekday]: nextRanges,
        }),
      });
      return;
    }

    const nextWeeklyTimeRanges = { ...(draft.weeklyTimeRanges ?? {}), [weekday]: nextRanges };
    updateDraft({
      weeklyTimeRanges: nextWeeklyTimeRanges,
      repeatEnabled: true,
      repeatWeekdays: nextRanges.length
        ? (Array.from(new Set([...draft.repeatWeekdays, weekday])).sort() as RepeatWeekday[])
        : draft.repeatWeekdays.filter((value) => value !== weekday),
    });
  };

  const assertEditableDay = () => {
    if (!selectedDay || selectedDay.dateValue < todayValue) {
      showNotice('过去日期只能查看，不能编辑档期。');
      return false;
    }
    return true;
  };

  const addRange = (weekday: RepeatWeekday) => {
    if (!assertEditableDay() || !selectedDay) return;

    const ranges = getDayRanges(draft, weekday, weekKey);
    const nextRange = findAvailableRange(ranges, selectedDay.dateValue, todayValue, nowMinutes);
    if (!nextRange) {
      showNotice('当天没有可添加的空闲时间段。');
      return;
    }

    updateDayRanges(weekday, [{ id: `${applyMode}-${weekday}-${Date.now()}`, ...nextRange }, ...ranges]);
  };

  const updateRange = (weekday: RepeatWeekday, rangeId: string, patch: Partial<BookingTimeRange>) => {
    if (!assertEditableDay() || !selectedDay) return;

    const ranges = getDayRanges(draft, weekday, weekKey);
    const currentRange = ranges.find((range) => range.id === rangeId);
    if (currentRange && isPastRange(selectedDay.dateValue, currentRange, todayValue, nowMinutes)) {
      showNotice('过去时间只能查看，不能编辑。');
      return;
    }

    const nextRanges = ranges.map((range) => (range.id === rangeId ? normalizeRange({ ...range, ...patch }) : range));
    if (hasOverlappingRanges(nextRanges)) {
      showNotice('时间段不能重叠，请调整到空闲位置。');
      return;
    }

    updateDayRanges(weekday, nextRanges);
  };

  const removeRange = (weekday: RepeatWeekday, rangeId: string) => {
    if (!assertEditableDay() || !selectedDay) return;

    const targetRange = getDayRanges(draft, weekday, weekKey).find((range) => range.id === rangeId);
    if (targetRange && isPastRange(selectedDay.dateValue, targetRange, todayValue, nowMinutes)) {
      showNotice('过去时间只能查看，不能编辑。');
      return;
    }

    updateDayRanges(weekday, getDayRanges(draft, weekday, weekKey).filter((range) => range.id !== rangeId));
  };

  const moveWeek = (days: number) => {
    const nextStart = addDays(weekStart, days);
    setWeekStart(nextStart);
    setSelectedDateValue(toDateValue(nextStart));
    setExpandedDateValue('');
  };

  const toggleExpandedDay = (day: WeekDay) => {
    setSelectedDateValue(day.dateValue);
    setExpandedDateValue((current) => (current === day.dateValue ? '' : day.dateValue));
  };

  const save = () => {
    saveBookingSettings(normalizeDraftForSave(draft, weekStart));
    showNotice(applyMode === 'weekly' ? '已保存为每周重复档期。' : '已保存为本周专用档期。');
  };

  return (
    <div className="min-h-dvh bg-black pb-28 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link className="inline-flex h-11 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-black text-white" to="/companion/mine" aria-label="返回我的">
            <ArrowLeft size={20} />
            档期
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid min-w-[168px] grid-cols-2 rounded-full bg-white/10 p-1">
              <button
                type="button"
                className={`h-9 rounded-full px-2 text-[11px] font-black transition ${applyMode === 'weekly' ? 'bg-white text-black' : 'text-white/55'}`}
                onClick={() => setApplyMode('weekly')}
              >
                每周
              </button>
              <button
                type="button"
                className={`h-9 rounded-full px-2 text-[11px] font-black transition ${applyMode === 'single_week' ? 'bg-white text-black' : 'text-white/55'}`}
                onClick={() => setApplyMode('single_week')}
              >
                本周
              </button>
            </div>
            <button
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${draft.temporaryAccepting ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/50'}`}
              onClick={() => updateDraft({ temporaryAccepting: !draft.temporaryAccepting })}
              aria-label="临时接单"
              title="临时接单"
            >
              <Zap size={17} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const isSelected = selectedDateValue === day.dateValue;
            const isExpanded = expandedDateValue === day.dateValue;
            const isPast = day.dateValue < todayValue;
            return (
              <button
                key={day.dateValue}
                type="button"
                className={`grid justify-items-center gap-1 rounded-[8px] py-1 text-center transition-opacity ${isPast ? 'opacity-35' : 'opacity-100'}`}
                onClick={() => toggleExpandedDay(day)}
              >
                <span className={`text-[11px] font-black ${isExpanded || isSelected ? 'text-white' : 'text-white/55'}`}>{day.short}</span>
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full text-lg font-black transition-all duration-300 ease-out ${
                    isExpanded ? 'bg-blue-500 text-white' : isSelected ? 'bg-white text-black' : 'text-white/80'
                  }`}
                >
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

      <main className="px-3">
        <section className="py-4">
          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
            <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" onClick={() => moveWeek(-7)} aria-label="上一周">
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0 text-center">
              <p className="text-lg font-black">{expandedDay ? `${formatFullDate(expandedDay.date)} · ${expandedDay.label}` : formatWeekRange(weekStart)}</p>
              <p className="mt-1 text-xs font-bold text-white/45">
                {expandedDay ? '再点一次当前档期列会原地收起' : '默认显示手机当前日期所在周，过去日期已压暗'}
              </p>
            </div>
            <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white" onClick={() => moveWeek(7)} aria-label="下一周">
              <ChevronRight size={18} />
            </button>
          </div>
        </section>

        <WeekTimeline
          days={weekDays}
          draft={draft}
          orders={occupiedOrders}
          selectedDateValue={selectedDateValue}
          expandedDateValue={expandedDateValue}
          weekKey={weekKey}
          todayValue={todayValue}
          onToggleDay={toggleExpandedDay}
        />

        <div className={`grid transition-all duration-300 ease-out ${expandedDay ? 'mt-4 max-h-[900px] opacity-100' : 'max-h-0 overflow-hidden opacity-0'}`}>
          {expandedDay ? (
            <DaySchedule
              day={expandedDay}
              ranges={selectedRanges}
              orders={selectedOrders}
              mode={applyMode}
              todayValue={todayValue}
              nowMinutes={nowMinutes}
              onAdd={() => addRange(expandedDay.weekday)}
              onChange={(rangeId, patch) => updateRange(expandedDay.weekday, rangeId, patch)}
              onRemove={(rangeId) => removeRange(expandedDay.weekday, rangeId)}
            />
          ) : null}
        </div>
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

function WeekTimeline({
  days,
  draft,
  orders,
  selectedDateValue,
  expandedDateValue,
  weekKey,
  todayValue,
  onToggleDay,
}: {
  days: WeekDay[];
  draft: CompanionBookingSettings;
  orders: AppOrder[];
  selectedDateValue: string;
  expandedDateValue: string;
  weekKey: string;
  todayValue: string;
  onToggleDay: (day: WeekDay) => void;
}) {
  const expandedDay = days.find((day) => day.dateValue === expandedDateValue) ?? null;
  const gridTemplateColumns = expandedDay
    ? days.map((day) => (day.dateValue === expandedDateValue ? 'minmax(0,1fr)' : 'minmax(0,0fr)')).join(' ')
    : 'repeat(7, minmax(0, 1fr))';

  return (
    <section className="overflow-hidden rounded-[8px] border border-white/10 bg-black transition-all duration-300 ease-out">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-black text-white/55">
          <CalendarDays size={16} />
          <span className="truncate">{expandedDay ? `${formatFullDate(expandedDay.date)} · 再点一次收起` : '蓝色可约 · 灰色占用 · 过去日期加深'}</span>
        </div>
      </div>
      <div className={`relative overflow-hidden transition-[height] duration-300 ease-out ${expandedDay ? 'h-[860px]' : 'h-[640px]'}`}>
        <div className="absolute inset-y-0 left-0 w-[44px] bg-black" />
        <div className="absolute inset-y-0 left-[44px] right-0">
          {timelineHours.map((minute) => (
            <div key={minute} className="absolute left-0 right-0 border-t border-white/10" style={{ top: `${((minute - dayStartMinutes) / dayTotalMinutes) * 100}%` }} />
          ))}
        </div>
        <div className="absolute inset-y-0 left-0 w-[44px]">
          {timelineHours.map((minute) => (
            <span
              key={minute}
              className="absolute right-1 -translate-y-1/2 text-[10px] font-bold text-white/30"
              style={{ top: `${((minute - dayStartMinutes) / dayTotalMinutes) * 100}%` }}
            >
              {expandedDay ? formatHourLabel(minute) : formatCompactHourLabel(minute)}
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0 left-[48px] right-0 grid gap-1 pr-1 transition-[grid-template-columns] duration-300 ease-out" style={{ gridTemplateColumns }}>
          {days.map((day) => {
            const ranges = getDayRanges(draft, day.weekday, weekKey);
            const dayOrders = getOrdersForDate(orders, day.dateValue);
            const isSelected = selectedDateValue === day.dateValue;
            const isExpanded = expandedDateValue === day.dateValue;
            const isPast = day.dateValue < todayValue;
            const isCollapsedByOtherDay = Boolean(expandedDateValue) && !isExpanded;
            return (
              <button
                key={day.dateValue}
                type="button"
                className={`relative h-full min-w-0 overflow-hidden border-x text-left transition-all duration-300 ease-out ${
                  isSelected || isExpanded ? 'border-white/30 bg-white/[0.03]' : 'border-white/10'
                } ${isCollapsedByOtherDay ? 'pointer-events-none opacity-0' : 'opacity-100'} ${isPast ? 'brightness-[0.35]' : ''}`}
                onClick={() => onToggleDay(day)}
                aria-label={`${day.label} ${day.month}/${day.day}`}
              >
                {isPast ? <span className="absolute inset-0 z-10 bg-black/45" /> : null}
                {ranges.map((range) => (
                  <span
                    key={range.id}
                    className={`absolute rounded-[4px] bg-blue-500/70 shadow-[inset_2px_0_0_rgba(191,219,254,0.95)] transition-all duration-300 ease-out ${
                      isExpanded ? 'left-0 right-2 px-3 py-2' : 'left-1 right-1'
                    }`}
                    style={getTimelineBlockStyle(range.startTime, range.endTime)}
                  >
                    <span className={`block text-sm font-black text-blue-100 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>可预约</span>
                    <span className={`mt-0.5 block text-xs font-bold text-blue-100/75 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                      {range.startTime} - {range.endTime}
                    </span>
                  </span>
                ))}
                {dayOrders.map((order) => (
                  <span
                    key={order.id}
                    className={`absolute rounded-[4px] bg-zinc-500/80 shadow-[inset_2px_0_0_rgba(228,228,231,0.9)] transition-all duration-300 ease-out ${
                      isExpanded ? 'left-0 right-2 px-3 py-2' : 'left-1 right-1'
                    }`}
                    style={getTimelineBlockStyle(formatOrderTime(order), formatOrderEndTime(order))}
                    title={`${order.orderNo} ${order.place}`}
                  >
                    <span className={`block truncate text-sm font-black text-white transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                      {order.title || order.orderNo}
                    </span>
                    <span className={`mt-0.5 block truncate text-xs font-bold text-white/75 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                      {formatOrderTime(order)} - {formatOrderEndTime(order)} · {order.place}
                    </span>
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DaySchedule({
  day,
  ranges,
  orders,
  mode,
  todayValue,
  nowMinutes,
  onAdd,
  onChange,
  onRemove,
}: {
  day: WeekDay;
  ranges: BookingTimeRange[];
  orders: AppOrder[];
  mode: ScheduleApplyMode;
  todayValue: string;
  nowMinutes: number;
  onAdd: () => void;
  onChange: (rangeId: string, patch: Partial<BookingTimeRange>) => void;
  onRemove: (rangeId: string) => void;
}) {
  const isPastDay = day.dateValue < todayValue;

  return (
    <section className="mt-4 rounded-[8px] bg-white p-4 text-black">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-black">编辑 {day.label}</p>
          <p className="mt-0.5 text-xs font-bold text-zinc-400">{mode === 'weekly' ? '会同步到每一周' : `${day.month}月${day.day}日所在周专用`}</p>
        </div>
        <button
          className={`flex h-9 items-center gap-1 rounded-full px-3 text-xs font-black ${isPastDay ? 'bg-zinc-200 text-zinc-400' : 'bg-black text-white'}`}
          onClick={onAdd}
          type="button"
          disabled={isPastDay}
        >
          <Plus size={15} />
          添加
        </button>
      </div>

      {isPastDay ? <p className="mt-3 rounded-[8px] bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-400">过去日期只能查看，不能编辑档期。</p> : null}

      <div className="mt-4 space-y-3">
        {ranges.map((range) => {
          const disabled = isPastDay || isPastRange(day.dateValue, range, todayValue, nowMinutes);
          return (
            <TimeRangeSlider
              key={range.id}
              range={range}
              disabled={disabled}
              onChange={(patch) => onChange(range.id, patch)}
              onRemove={() => onRemove(range.id)}
            />
          );
        })}
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

function TimeRangeSlider({
  range,
  disabled = false,
  onChange,
  onRemove,
}: {
  range: BookingTimeRange;
  disabled?: boolean;
  onChange: (patch: Partial<BookingTimeRange>) => void;
  onRemove: () => void;
}) {
  const start = timeToMinutes(range.startTime);
  const end = timeToMinutes(range.endTime);

  return (
    <div className={`rounded-[8px] bg-zinc-50 p-3 ring-1 ring-zinc-100 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-zinc-950">{range.startTime} - {range.endTime}</p>
        <button
          className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-100 disabled:text-zinc-300"
          onClick={onRemove}
          aria-label="删除时间段"
          type="button"
          disabled={disabled}
        >
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
            disabled={disabled}
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
            disabled={disabled}
            onChange={(event) => {
              const nextEnd = Number(event.target.value);
              onChange({ startTime: minutesToTime(Math.min(start, nextEnd - sliderStepMinutes)), endTime: minutesToTime(nextEnd) });
            }}
          />
          <span className="text-right text-zinc-600">{range.endTime}</span>
        </label>
      </div>
      {disabled ? <p className="mt-2 text-xs font-bold text-zinc-400">过去时间只能查看</p> : null}
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

function ensureBookingSettings(settings: CompanionBookingSettings): CompanionBookingSettings {
  if (settings.weeklyTimeRanges && settings.scheduleApplyMode) return settings;
  const weeklyTimeRanges = (settings.weeklyTimeRanges ??
    Object.fromEntries(settings.repeatWeekdays.map((weekday) => [weekday, settings.timeRanges]))) as Partial<Record<RepeatWeekday, BookingTimeRange[]>>;
  return { ...settings, weeklyTimeRanges, scheduleApplyMode: settings.scheduleApplyMode ?? 'weekly', weekOverrides: settings.weekOverrides ?? {} };
}

function normalizeDraftForSave(settings: CompanionBookingSettings, currentWeekStart: Date): CompanionBookingSettings {
  const nextSettings = ensureBookingSettings(settings);
  const weeklyTimeRanges = nextSettings.weeklyTimeRanges ?? {};
  const repeatWeekdays = weekdayOptions.map((item) => item.value).filter((weekday) => (weeklyTimeRanges[weekday]?.length ?? 0) > 0);
  const firstRanges = repeatWeekdays.flatMap((weekday) => weeklyTimeRanges[weekday] ?? []).slice(0, 3);
  const currentWeekRanges = getWeekOverrideWithFallback(nextSettings, toDateValue(currentWeekStart));
  return {
    ...nextSettings,
    repeatEnabled: nextSettings.scheduleApplyMode !== 'single_week',
    repeatWeekdays,
    timeRanges: firstRanges.length ? firstRanges : nextSettings.timeRanges,
    weeklyTimeRanges,
    availableDates: nextSettings.scheduleApplyMode === 'single_week' ? buildAvailableDatesForWeek(currentWeekStart, currentWeekRanges) : nextSettings.availableDates,
  };
}

function getDayRanges(settings: CompanionBookingSettings, weekday: RepeatWeekday, weekKey: string) {
  const ensuredSettings = ensureBookingSettings(settings);
  if (ensuredSettings.scheduleApplyMode === 'single_week') {
    return [...(getWeekOverrideWithFallback(ensuredSettings, weekKey)[weekday] ?? [])].sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
  }
  return [...(ensuredSettings.weeklyTimeRanges?.[weekday] ?? [])].sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
}

function getWeekOverrideWithFallback(settings: CompanionBookingSettings, weekKey: string): Partial<Record<RepeatWeekday, BookingTimeRange[]>> {
  const ensuredSettings = ensureBookingSettings(settings);
  const existingWeek = ensuredSettings.weekOverrides?.[weekKey];
  if (existingWeek && Object.keys(existingWeek).length > 0) {
    return cloneRangesByWeekday(existingWeek);
  }
  return cloneRangesByWeekday(ensuredSettings.weeklyTimeRanges ?? {});
}

function cloneRangesByWeekday(rangesByWeekday: Partial<Record<RepeatWeekday, BookingTimeRange[]>>) {
  return weekdayOptions.reduce<Partial<Record<RepeatWeekday, BookingTimeRange[]>>>((nextRanges, option) => {
    const ranges = rangesByWeekday[option.value] ?? [];
    if (ranges.length) nextRanges[option.value] = ranges.map((range) => ({ ...range }));
    return nextRanges;
  }, {});
}

function buildAvailableDatesForWeek(weekStart: Date, rangesByWeekday: Partial<Record<RepeatWeekday, BookingTimeRange[]>>) {
  return weekdayOptions
    .filter((item) => (rangesByWeekday[item.value]?.length ?? 0) > 0)
    .map((item) => {
      const offset = item.value === 0 ? 6 : item.value - 1;
      return toDateValue(addDays(weekStart, offset));
    });
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

function findAvailableRange(ranges: BookingTimeRange[], dateValue: string, todayValue: string, nowMinutes: number) {
  let cursor = dateValue === todayValue ? roundUpToStep(Math.max(nowMinutes, dayStartMinutes), sliderStepMinutes) : 10 * 60;
  cursor = Math.max(dayStartMinutes, Math.min(cursor, dayEndMinutes - sliderStepMinutes));
  const sortedRanges = ranges.map(normalizeRange).sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));

  for (const range of sortedRanges) {
    const rangeStart = timeToMinutes(range.startTime);
    if (cursor + defaultRangeMinutes <= rangeStart) return createRange(cursor, cursor + defaultRangeMinutes);
    cursor = Math.max(cursor, timeToMinutes(range.endTime));
  }

  if (cursor + defaultRangeMinutes <= dayEndMinutes) return createRange(cursor, cursor + defaultRangeMinutes);
  if (cursor + sliderStepMinutes <= dayEndMinutes) return createRange(cursor, dayEndMinutes);
  return null;
}

function hasOverlappingRanges(ranges: BookingTimeRange[]) {
  const sortedRanges = ranges.map(normalizeRange).sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
  return sortedRanges.some((range, index) => {
    const previous = sortedRanges[index - 1];
    return previous ? timeToMinutes(range.startTime) < timeToMinutes(previous.endTime) : false;
  });
}

function normalizeRange(range: BookingTimeRange): BookingTimeRange {
  let start = Math.max(dayStartMinutes, Math.min(dayEndMinutes - sliderStepMinutes, timeToMinutes(range.startTime)));
  let end = Math.max(dayStartMinutes + sliderStepMinutes, Math.min(dayEndMinutes, timeToMinutes(range.endTime)));
  if (end <= start) {
    end = Math.min(dayEndMinutes, start + sliderStepMinutes);
    if (end <= start) start = Math.max(dayStartMinutes, end - sliderStepMinutes);
  }
  return { ...range, startTime: minutesToTime(start), endTime: minutesToTime(end) };
}

function isPastRange(dateValue: string, range: BookingTimeRange, todayValue: string, nowMinutes: number) {
  if (dateValue < todayValue) return true;
  if (dateValue > todayValue) return false;
  return timeToMinutes(range.endTime) <= nowMinutes;
}

function createRange(start: number, end: number) {
  return { startTime: minutesToTime(start), endTime: minutesToTime(end) };
}

function roundUpToStep(totalMinutes: number, step: number) {
  return Math.ceil(totalMinutes / step) * step;
}

function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function getTimelineBlockStyle(startTime: string, endTime: string) {
  const start = Math.max(dayStartMinutes, Math.min(dayEndMinutes, timeToMinutes(startTime)));
  const end = Math.max(start + sliderStepMinutes, Math.min(dayEndMinutes, timeToMinutes(endTime)));
  return {
    top: `${((start - dayStartMinutes) / dayTotalMinutes) * 100}%`,
    height: `max(26px, ${((end - start) / dayTotalMinutes) * 100}%)`,
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

function formatCompactHourLabel(totalMinutes: number) {
  if (totalMinutes === 12 * 60) return '12';
  if (totalMinutes === 24 * 60) return '24';
  return String(Math.floor(totalMinutes / 60));
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
