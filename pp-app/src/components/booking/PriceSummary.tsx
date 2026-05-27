import { formatMoney } from '../../utils/money';

type PriceSummaryProps = {
  activityName: string;
  durationLabel: string;
  activityAmountCents: number;
  retouchCount: number;
  retouchAmountCents: number;
  rushAmountCents: number;
  shortVideoAmountCents: number;
  totalCents: number;
};

export function PriceSummary({
  activityName,
  durationLabel,
  activityAmountCents,
  retouchCount,
  retouchAmountCents,
  rushAmountCents,
  shortVideoAmountCents,
  totalCents,
}: PriceSummaryProps) {
  return (
    <section className="rounded-[18px] bg-white/72 p-4 ring-1 ring-[#eadfd8]">
      <PriceLine label={`${activityName} · ${durationLabel}`} value={formatMoney(activityAmountCents)} />
      <PriceLine label={`精修加购 x ${retouchCount}`} value={formatMoney(retouchAmountCents)} muted={retouchCount === 0} />
      <PriceLine label="加急出图" value={formatMoney(rushAmountCents)} muted={rushAmountCents === 0} />
      <PriceLine label="短视频" value={formatMoney(shortVideoAmountCents)} muted={shortVideoAmountCents === 0} />
      <div className="mt-3 border-t border-zinc-200 pt-3">
        <PriceLine label="实时合计" value={formatMoney(totalCents)} strong />
      </div>
    </section>
  );
}

function PriceLine({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={`${strong ? 'text-base font-bold' : 'text-sm'} ${muted ? 'text-[#c4b7af]' : 'text-[#6f625d]'}`}>{label}</span>
      <span className={`${strong ? 'text-2xl font-bold text-[#e85d75]' : 'text-sm font-bold'} ${muted ? 'text-[#c4b7af]' : 'text-[#3f302c]'}`}>
        {value}
      </span>
    </div>
  );
}
