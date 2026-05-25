import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppData } from '../../app/useAppData';
import type { ActivityPricing, AvailabilitySlot, Companion, OrderAddOnInput } from '../../types/api';
import { AddOnSelector } from './AddOnSelector';
import { ActivitySelector } from './ActivitySelector';
import { DurationSelector, type DurationOption } from './DurationSelector';
import { LocationSelector } from './LocationSelector';
import { PriceSummary } from './PriceSummary';
import { TimeSlotSelector } from './TimeSlotSelector';

type BookingModalProps = {
  companion: Companion;
  postId: string;
  open: boolean;
  onClose: () => void;
};

export function BookingModal({ companion, postId, open, onClose }: BookingModalProps) {
  if (!open) return null;
  return <BookingModalContent key={`${companion.id}-${postId}`} companion={companion} postId={postId} onClose={onClose} />;
}

function BookingModalContent({ companion, postId, onClose }: Omit<BookingModalProps, 'open'>) {
  const { createOrder } = useAppData();
  const initialSlot = useMemo(() => getFirstAvailableSlot(companion.slots), [companion.slots]);
  const [area, setArea] = useState(companion.areas[0] ?? companion.baseCity);
  const [selectedActivityId, setSelectedActivityId] = useState(companion.activities[0]?.id ?? '');
  const [selectedDate, setSelectedDate] = useState(initialSlot.dateLabel);
  const [selectedSlotId, setSelectedSlotId] = useState(initialSlot.id);
  const [durationMinutes, setDurationMinutes] = useState(companion.activities[0]?.durationMinutes ?? 120);
  const [retouchCount, setRetouchCount] = useState(0);
  const [rushSelected, setRushSelected] = useState(false);
  const [shortVideoSelected, setShortVideoSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedActivity = companion.activities.find((activity) => activity.id === selectedActivityId) ?? companion.activities[0];
  const selectedSlot = companion.slots.find((slot) => slot.id === selectedSlotId) ?? initialSlot;
  const retouchExtra = companion.extras.find((extra) => extra.name.includes('精修')) ?? companion.extras[0];
  const rushExtra = companion.extras.find((extra) => extra.name.includes('加急'));
  const shortVideoExtra = companion.extras.find((extra) => extra.name.includes('短视频'));
  const durationOptions = getDurationOptions(selectedActivity);
  const durationLabel = getDurationLabel(durationMinutes);
  const activityAmountCents = Math.round((selectedActivity.priceCents * durationMinutes) / selectedActivity.durationMinutes);
  const retouchAmountCents = retouchCount * retouchExtra.priceCents;
  const rushAmountCents = rushSelected && rushExtra ? rushExtra.priceCents : 0;
  const shortVideoAmountCents = shortVideoSelected && shortVideoExtra ? shortVideoExtra.priceCents : 0;
  const totalCents = activityAmountCents + retouchAmountCents + rushAmountCents + shortVideoAmountCents;

  function handleActivitySelect(activity: ActivityPricing) {
    setSelectedActivityId(activity.id);
    setDurationMinutes(activity.durationMinutes);
  }

  function handleDateSelect(dateLabel: string) {
    setSelectedDate(dateLabel);
    const firstSlotForDate = companion.slots.find((slot) => slot.dateLabel === dateLabel && slot.status === 'available');
    if (firstSlotForDate) setSelectedSlotId(firstSlotForDate.id);
  }

  function submitBooking() {
    setSubmitting(true);
    const addOns = buildAddOns({
      retouchExtra,
      retouchCount,
      rushExtra,
      rushSelected,
      shortVideoExtra,
      shortVideoSelected,
    });

    createOrder({
      title: `${selectedActivity.name}陪拍 · ${durationLabel}`,
      time: `${selectedSlot.dateLabel} ${selectedSlot.timeLabel}`,
      place: area,
      amountCents: totalCents,
      companion: companion.name,
      companionId: companion.id,
      postId,
      activityId: selectedActivity.id,
      activityName: selectedActivity.name,
      slotId: selectedSlot.id,
      startAt: selectedSlot.startAt,
      endAt: selectedSlot.endAt,
      dateLabel: selectedSlot.dateLabel,
      timeLabel: selectedSlot.timeLabel,
      durationMinutes,
      durationLabel,
      addOns,
    });

    window.setTimeout(() => {
      setSubmitting(false);
      onClose();
    }, 250);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/45">
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-[18px] bg-white pb-6 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur">
          <h2 className="pl-2 text-base font-bold text-zinc-950">预约陪拍</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={onClose} aria-label="关闭预约弹窗">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-4 pt-4">
          <section className="overflow-hidden rounded-[10px] border border-zinc-200">
            <img className="h-56 w-full object-cover" src={companion.photo} alt={`${companion.name} 真人照片`} />
            <div className="p-4">
              <div className="flex items-center gap-3">
                <img className="h-12 w-12 rounded-full object-cover" src={companion.avatar} alt="" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold">{companion.name}</h2>
                  <p className="mt-0.5 truncate text-xs font-medium text-zinc-500">{companion.tags.join(' · ')}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-500">{companion.bio}</p>
            </div>
          </section>

          <ActivitySelector activities={companion.activities} selectedActivityId={selectedActivity.id} onSelect={handleActivitySelect} />
          <LocationSelector areas={companion.areas} selectedArea={area} onSelect={setArea} />
          <TimeSlotSelector slots={companion.slots} selectedDate={selectedDate} selectedSlotId={selectedSlot.id} onDateSelect={handleDateSelect} onSlotSelect={(slot) => setSelectedSlotId(slot.id)} />
          <DurationSelector options={durationOptions} selectedMinutes={durationMinutes} onSelect={setDurationMinutes} />
          <AddOnSelector
            retouchExtra={retouchExtra}
            rushExtra={rushExtra}
            shortVideoExtra={shortVideoExtra}
            retouchCount={retouchCount}
            rushSelected={rushSelected}
            shortVideoSelected={shortVideoSelected}
            onRetouchCountChange={setRetouchCount}
            onRushChange={setRushSelected}
            onShortVideoChange={setShortVideoSelected}
          />
          <PriceSummary
            activityName={selectedActivity.name}
            durationLabel={durationLabel}
            activityAmountCents={activityAmountCents}
            retouchCount={retouchCount}
            retouchAmountCents={retouchAmountCents}
            rushAmountCents={rushAmountCents}
            shortVideoAmountCents={shortVideoAmountCents}
            totalCents={totalCents}
          />

          <button className="h-12 w-full rounded-full bg-rose-500 text-sm font-bold text-white disabled:bg-zinc-300" disabled={submitting} onClick={submitBooking}>
            {submitting ? '正在创建订单' : '约TA陪拍'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getFirstAvailableSlot(slots: AvailabilitySlot[]) {
  return slots.find((slot) => slot.status === 'available') ?? slots[0];
}

function getDurationOptions(activity: ActivityPricing): DurationOption[] {
  const base = activity.durationMinutes;
  return [
    { label: getDurationLabel(base), minutes: base },
    { label: getDurationLabel(base + 60), minutes: base + 60 },
    { label: getDurationLabel(base + 120), minutes: base + 120 },
  ];
}

function getDurationLabel(minutes: number) {
  return minutes % 60 === 0 ? `${minutes / 60}小时` : `${Math.floor(minutes / 60)}.5小时`;
}

function buildAddOns({
  retouchExtra,
  retouchCount,
  rushExtra,
  rushSelected,
  shortVideoExtra,
  shortVideoSelected,
}: {
  retouchExtra: Companion['extras'][number];
  retouchCount: number;
  rushExtra?: Companion['extras'][number];
  rushSelected: boolean;
  shortVideoExtra?: Companion['extras'][number];
  shortVideoSelected: boolean;
}) {
  const addOns: OrderAddOnInput[] = [];
  if (retouchCount > 0) {
    addOns.push({
      extraId: retouchExtra.id,
      name: retouchExtra.name,
      unitLabel: retouchExtra.unitLabel,
      quantity: retouchCount,
      unitPriceCents: retouchExtra.priceCents,
      amountCents: retouchCount * retouchExtra.priceCents,
    });
  }
  if (rushSelected && rushExtra) addOns.push(singleOrderExtra(rushExtra));
  if (shortVideoSelected && shortVideoExtra) addOns.push(singleOrderExtra(shortVideoExtra));
  return addOns;
}

function singleOrderExtra(extra: Companion['extras'][number]): OrderAddOnInput {
  return {
    extraId: extra.id,
    name: extra.name,
    unitLabel: extra.unitLabel,
    quantity: 1,
    unitPriceCents: extra.priceCents,
    amountCents: extra.priceCents,
  };
}
