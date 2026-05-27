import { CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { applyBookingSettingsToCompanion, bookingDurationOptions } from '../../data/bookingSettings';
import type { ActivityPricing, AvailabilitySlot, Companion, CompanionExtra, CreateOrderInput, OrderAddOnInput } from '../../types/api';
import { Chip } from '../Chip';
import { ActivitySelector } from './ActivitySelector';
import { AddOnSelector } from './AddOnSelector';
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

const durationOptions: DurationOption[] = bookingDurationOptions.map((option) => ({ label: option.label, minutes: option.minutes }));

export function BookingModal({ companion, postId, open, onClose }: BookingModalProps) {
  if (!open) return null;

  return <BookingModalContent key={`${companion.id}-${postId}`} companion={companion} postId={postId} onClose={onClose} />;
}

function BookingModalContent({ companion, postId, onClose }: Omit<BookingModalProps, 'open'>) {
  const navigate = useNavigate();
  const { bookingSettings, createOrder } = useAppData();
  const bookableCompanion = useMemo(() => applyBookingSettingsToCompanion(companion, bookingSettings), [bookingSettings, companion]);
  const initialSlot = useMemo(() => getFirstAvailableSlot(bookableCompanion.slots), [bookableCompanion.slots]);
  const initialActivity = bookableCompanion.activities[0];
  const [area, setArea] = useState(bookableCompanion.areas[0] ?? bookableCompanion.baseCity);
  const [selectedActivityId, setSelectedActivityId] = useState(initialActivity.id);
  const [selectedSlotId, setSelectedSlotId] = useState(initialSlot.id);
  const [selectedDate, setSelectedDate] = useState(initialSlot.dateLabel);
  const [durationMinutes, setDurationMinutes] = useState(initialActivity.durationMinutes);
  const [retouchCount, setRetouchCount] = useState(0);
  const [rushSelected, setRushSelected] = useState(false);
  const [shortVideoSelected, setShortVideoSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedActivity = bookableCompanion.activities.find((activity) => activity.id === selectedActivityId) ?? initialActivity;
  const selectedSlot = bookableCompanion.slots.find((slot) => slot.id === selectedSlotId) ?? initialSlot;
  const retouchExtra = findExtra(bookableCompanion.extras, '精修') ?? bookableCompanion.extras[0];
  const rushExtra = findExtra(bookableCompanion.extras, '加急');
  const shortVideoExtra = findExtra(bookableCompanion.extras, '短视频');
  const durationLabel = durationOptions.find((option) => option.minutes === durationMinutes)?.label ?? `${durationMinutes}分钟`;
  const activityAmountCents = calculateActivityAmount(selectedActivity.priceCents, selectedActivity.durationMinutes, durationMinutes);
  const retouchAmountCents = retouchCount * retouchExtra.priceCents;
  const rushAmountCents = rushSelected && rushExtra ? rushExtra.priceCents : 0;
  const shortVideoAmountCents = shortVideoSelected && shortVideoExtra ? shortVideoExtra.priceCents : 0;
  const totalCents = activityAmountCents + retouchAmountCents + rushAmountCents + shortVideoAmountCents;
  const addOns = buildAddOns({ retouchExtra, retouchCount, rushExtra, rushSelected, shortVideoExtra, shortVideoSelected });
  const canSubmit = selectedSlot.status === 'available' && bookableCompanion.serviceEnabled && bookableCompanion.slots.length > 0;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleActivitySelect = (activity: ActivityPricing) => {
    setSelectedActivityId(activity.id);
    setDurationMinutes(activity.durationMinutes);
  };

  const handleDateSelect = (dateLabel: string) => {
    const firstSlotForDate = bookableCompanion.slots.find((slot) => slot.dateLabel === dateLabel && slot.status === 'available');
    setSelectedDate(dateLabel);
    if (firstSlotForDate) setSelectedSlotId(firstSlotForDate.id);
  };

  const handleSlotSelect = (slot: AvailabilitySlot) => {
    setSelectedDate(slot.dateLabel);
    setSelectedSlotId(slot.id);
  };

  const handleCreateOrder = () => {
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    const orderInput: CreateOrderInput = {
      title: `${selectedActivity.name} 陪拍 · ${durationLabel}`,
      time: selectedSlot.label,
      place: area,
      amountCents: totalCents,
      companion: bookableCompanion.name,
      companionId: bookableCompanion.id,
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
    };
    createOrder(orderInput);
    onClose();
    navigate('/consumer/orders');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#3f302c]/38 px-0 sm:items-center sm:px-4" onMouseDown={onClose}>
      <section
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-[#fffaf6] pb-24 shadow-2xl sm:rounded-[26px] sm:pb-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eadfd8]/70 bg-[#fffaf6]/92 p-3 backdrop-blur">
          <h2 className="pl-2 text-base font-bold text-[#3f302c]">预约陪拍</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-[#f2e8e1] text-[#6f625d]" onClick={onClose} aria-label="关闭预约弹窗">
            <X size={19} />
          </button>
        </div>

        <div className="px-5">
          <div className="overflow-hidden rounded-[22px] bg-[#eadfd8]">
            <img className="h-64 w-full object-cover" src={bookableCompanion.photo} alt={`${bookableCompanion.name} 真人照片`} />
          </div>

          <div className="mt-4 flex items-start gap-3">
            <img className="h-12 w-12 rounded-[16px] object-cover" src={bookableCompanion.avatar} alt="" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#3f302c]">{bookableCompanion.name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full pp-safe px-2 py-1 text-xs font-semibold">
                  <ShieldCheck size={13} />
                  安全认证
                </span>
              </div>
              <p className="mt-1 text-sm leading-6 text-[#6f625d]">{bookableCompanion.bio}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {bookableCompanion.tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>

          <div className="mt-4 rounded-[18px] bg-[#eef8f1] p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[#23724a]">
              <CheckCircle2 size={16} />
              平台安全标识
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {bookableCompanion.safetyBadges.map((badge) => (
                <span key={badge} className="rounded-full bg-white/82 px-3 py-1.5 text-xs font-semibold text-[#23724a]">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {!bookableCompanion.serviceEnabled ? <div className="mt-4 rounded-[18px] bg-[#f2e8e1] p-4 text-sm font-bold text-[#8f8078]">陪拍者当前暂停临时接单</div> : null}

          <div className="mt-5 space-y-5">
            <ActivitySelector activities={bookableCompanion.activities} selectedActivityId={selectedActivity.id} onSelect={handleActivitySelect} />
            <LocationSelector areas={bookableCompanion.areas} selectedArea={area} onSelect={setArea} />
            <TimeSlotSelector slots={bookableCompanion.slots} selectedDate={selectedDate} selectedSlotId={selectedSlot.id} onDateSelect={handleDateSelect} onSlotSelect={handleSlotSelect} />
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
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-[#eadfd8] bg-[#fffaf6]/95 p-4 backdrop-blur sm:absolute sm:rounded-b-[26px]">
          <button className="h-13 w-full rounded-full pp-primary text-base font-bold disabled:bg-[#d8d0cb] disabled:shadow-none" disabled={submitting || !canSubmit} onClick={handleCreateOrder}>
            {submitting ? '正在创建订单' : canSubmit ? '预约TA陪拍' : '暂无可约时间'}
          </button>
        </div>
      </section>
    </div>
  );
}

function getFirstAvailableSlot(slots: AvailabilitySlot[]) {
  return (
    slots.find((slot) => slot.status === 'available') ??
    slots[0] ?? {
      id: 'empty-slot',
      label: '暂无可约时间',
      dateLabel: '暂无日期',
      timeLabel: '暂无时间',
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
      status: 'unavailable' as const,
    }
  );
}

function calculateActivityAmount(basePriceCents: number, baseMinutes: number, selectedMinutes: number) {
  return Math.round((basePriceCents / baseMinutes) * selectedMinutes);
}

function findExtra(extras: CompanionExtra[], keyword: string) {
  return extras.find((extra) => extra.name.includes(keyword));
}

function buildAddOns({
  retouchExtra,
  retouchCount,
  rushExtra,
  rushSelected,
  shortVideoExtra,
  shortVideoSelected,
}: {
  retouchExtra: CompanionExtra;
  retouchCount: number;
  rushExtra?: CompanionExtra;
  rushSelected: boolean;
  shortVideoExtra?: CompanionExtra;
  shortVideoSelected: boolean;
}): OrderAddOnInput[] {
  const addOns: OrderAddOnInput[] = [];

  if (retouchCount > 0) addOns.push(toAddOn(retouchExtra, retouchCount));
  if (rushSelected && rushExtra) addOns.push(toAddOn(rushExtra, 1));
  if (shortVideoSelected && shortVideoExtra) addOns.push(toAddOn(shortVideoExtra, 1));

  return addOns;
}

function toAddOn(extra: CompanionExtra, quantity: number): OrderAddOnInput {
  return {
    extraId: extra.id,
    name: extra.name,
    unitLabel: extra.unitLabel,
    quantity,
    unitPriceCents: extra.priceCents,
    amountCents: quantity * extra.priceCents,
  };
}
