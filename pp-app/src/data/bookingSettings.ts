import type {
  ActivityPricing,
  AvailabilitySlot,
  Companion,
  CompanionBookingSettings,
  CompanionExtra,
} from '../types/api';
import { formatMoney } from '../utils/money';

export const companionBookingActivityNames = [
  'Citywalk',
  '逛街拍照',
  '探店吃饭',
  '咖啡店出片',
  '看展拍照',
  '夜景散步',
  '旅行跟拍',
  '闺蜜陪拍',
  '情侣陪拍',
];

export const bookingDurationOptions = [
  { label: '1小时', minutes: 60 },
  { label: '1.5小时', minutes: 90 },
  { label: '2小时', minutes: 120 },
  { label: '半天', minutes: 240 },
] as const;

const defaultCompanionId = '00000000-0000-0000-0000-000000000301';

export const defaultBookingSettings: CompanionBookingSettings = {
  companionId: defaultCompanionId,
  availableDates: ['2026-06-14', '2026-06-15', '2026-06-16'],
  timeRanges: [
    { id: 'range-morning', startTime: '10:00', endTime: '12:00' },
    { id: 'range-afternoon', startTime: '14:00', endTime: '16:00' },
    { id: 'range-evening', startTime: '19:00', endTime: '21:00' },
  ],
  repeatEnabled: true,
  repeatWeekdays: [5, 6],
  temporaryAccepting: true,
  activities: companionBookingActivityNames.map((name, index) => ({
    id: `activity-setting-${index + 1}`,
    name,
    enabled: true,
    durationMinutes: name === '旅行跟拍' ? 240 : name === '探店吃饭' || name === '咖啡店出片' ? 90 : 120,
    basePriceCents: [39900, 36900, 29900, 26900, 32900, 23900, 69900, 39900, 45900][index],
  })),
  retouchPriceCents: 3000,
  rushPriceCents: 8000,
  shortVideoPriceCents: 12000,
  updatedAt: new Date().toISOString(),
};

export function applyBookingSettingsToCompanion(companion: Companion, settings?: CompanionBookingSettings): Companion {
  if (!settings) return companion;

  const activities = buildActivityPricing(settings);
  return {
    ...companion,
    serviceEnabled: settings.temporaryAccepting,
    slots: buildAvailabilitySlots(settings),
    activities: activities.length ? activities : companion.activities,
    extras: buildExtras(settings, companion.extras),
  };
}

export function buildAvailabilitySlots(settings: CompanionBookingSettings): AvailabilitySlot[] {
  if (!settings.temporaryAccepting) return [];

  const dateSet = new Set(settings.availableDates);

  if (settings.repeatEnabled) {
    getNextDates(14)
      .filter((date) => settings.repeatWeekdays.includes(date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6))
      .forEach((date) => dateSet.add(toDateInputValue(date)));
  }

  return Array.from(dateSet)
    .sort()
    .flatMap((date) =>
      settings.timeRanges.map((range) => {
        const startAt = new Date(`${date}T${range.startTime}:00+08:00`).toISOString();
        const endAt = new Date(`${date}T${range.endTime}:00+08:00`).toISOString();
        const dateLabel = formatDateLabel(date);
        return {
          id: `settings-${date}-${range.id}`,
          label: `${dateLabel} ${range.startTime}`,
          dateLabel,
          timeLabel: `${range.startTime}-${range.endTime}`,
          startAt,
          endAt,
          status: 'available' as const,
        };
      }),
    );
}

export function buildActivityPricing(settings: CompanionBookingSettings): ActivityPricing[] {
  return settings.activities
    .filter((activity) => activity.enabled)
    .map((activity) => ({
      id: activity.id,
      name: activity.name,
      durationMinutes: activity.durationMinutes,
      durationLabel: getDurationLabel(activity.durationMinutes),
      priceCents: activity.basePriceCents,
      priceText: formatMoney(activity.basePriceCents),
    }));
}

function buildExtras(settings: CompanionBookingSettings, fallback: CompanionExtra[]): CompanionExtra[] {
  return [
    {
      id: 'settings-retouch',
      name: '精修',
      unit: 'per_photo',
      unitLabel: '张',
      priceCents: settings.retouchPriceCents,
      priceText: `${formatMoney(settings.retouchPriceCents)}/张`,
    },
    {
      id: 'settings-rush',
      name: '加急出图',
      unit: 'per_order',
      unitLabel: '单',
      priceCents: settings.rushPriceCents,
      priceText: formatMoney(settings.rushPriceCents),
    },
    {
      id: 'settings-short-video',
      name: '短视频',
      unit: 'per_order',
      unitLabel: '条',
      priceCents: settings.shortVideoPriceCents,
      priceText: formatMoney(settings.shortVideoPriceCents),
    },
  ].filter((extra) => extra.priceCents > 0 || fallback.length);
}

export function getDurationLabel(minutes: number) {
  return bookingDurationOptions.find((option) => option.minutes === minutes)?.label ?? `${minutes}分钟`;
}

export function formatDateLabel(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00+08:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  return `${month}月${day}日 ${weekday}`;
}

function getNextDates(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
