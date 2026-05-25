import { CalendarDays, Clock3 } from 'lucide-react';
import type { AvailabilitySlot } from '../../types/api';

type TimeSlotSelectorProps = {
  slots: AvailabilitySlot[];
  selectedDate: string;
  selectedSlotId: string;
  onDateSelect: (dateLabel: string) => void;
  onSlotSelect: (slot: AvailabilitySlot) => void;
};

export function TimeSlotSelector({ slots, selectedDate, selectedSlotId, onDateSelect, onSlotSelect }: TimeSlotSelectorProps) {
  const dateOptions = unique(slots.map((slot) => slot.dateLabel));
  const slotsForDate = slots.filter((slot) => slot.dateLabel === selectedDate);
  const availableCount = slotsForDate.filter((slot) => slot.status === 'available').length;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <CalendarDays size={16} />
          日期
        </h3>
        <div className="flex flex-wrap gap-2">
          {dateOptions.map((date) => (
            <OptionButton key={date} active={date === selectedDate} onClick={() => onDateSelect(date)}>
              {date}
            </OptionButton>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <Clock3 size={16} />
          时间
        </h3>
        <div className="flex flex-wrap gap-2">
          {slotsForDate.map((slot) => {
            const disabled = slot.status !== 'available';
            const statusText = slot.status === 'booked' ? '已约' : slot.status === 'locked' ? '锁定' : slot.status === 'unavailable' ? '不可约' : '';
            return (
              <button
                key={slot.id}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${
                  slot.id === selectedSlotId
                    ? 'bg-zinc-950 text-white'
                    : disabled
                      ? 'bg-zinc-100 text-zinc-300'
                      : 'bg-zinc-100 text-zinc-700'
                }`}
                disabled={disabled}
                onClick={() => onSlotSelect(slot)}
                title={statusText}
              >
                {slot.timeLabel}
                {statusText ? <span className="ml-1">{statusText}</span> : null}
              </button>
            );
          })}
        </div>
        {availableCount === 0 ? <p className="mt-2 text-xs font-medium text-rose-500">这一天暂时没有可预约时间</p> : null}
      </div>
    </section>
  );
}

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`rounded-full px-3 py-2 text-xs font-semibold ${active ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`} onClick={onClick}>
      {children}
    </button>
  );
}

function unique(items: string[]) {
  return Array.from(new Set(items));
}
