import { Minus, Plus } from 'lucide-react';
import type { CompanionExtra } from '../../types/api';
import { formatMoney } from '../../utils/money';

type AddOnSelectorProps = {
  retouchExtra: CompanionExtra;
  rushExtra?: CompanionExtra;
  shortVideoExtra?: CompanionExtra;
  retouchCount: number;
  rushSelected: boolean;
  shortVideoSelected: boolean;
  onRetouchCountChange: (count: number) => void;
  onRushChange: (selected: boolean) => void;
  onShortVideoChange: (selected: boolean) => void;
};

export function AddOnSelector({
  retouchExtra,
  rushExtra,
  shortVideoExtra,
  retouchCount,
  rushSelected,
  shortVideoSelected,
  onRetouchCountChange,
  onRushChange,
  onShortVideoChange,
}: AddOnSelectorProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-900">加价项</h3>
        <span className="text-xs font-semibold text-zinc-500">
          {formatMoney(retouchExtra.priceCents)}/{retouchExtra.unitLabel}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-[10px] border border-zinc-200 p-3">
        <div>
          <p className="text-sm font-bold text-zinc-900">{retouchExtra.name}照片</p>
          <p className="mt-1 text-xs text-zinc-500">适合头像、朋友圈封面和发布成片</p>
        </div>
        <div className="flex items-center gap-3">
          <CounterButton ariaLabel="减少精修数量" onClick={() => onRetouchCountChange(Math.max(0, retouchCount - 1))}>
            <Minus size={15} />
          </CounterButton>
          <span className="w-5 text-center text-sm font-bold">{retouchCount}</span>
          <CounterButton ariaLabel="增加精修数量" onClick={() => onRetouchCountChange(Math.min(9, retouchCount + 1))}>
            <Plus size={15} />
          </CounterButton>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        {rushExtra ? <ToggleExtra extra={rushExtra} selected={rushSelected} onChange={onRushChange} desc="更快交付精选成片" /> : null}
        {shortVideoExtra ? (
          <ToggleExtra extra={shortVideoExtra} selected={shortVideoSelected} onChange={onShortVideoChange} desc="生成一条可发布短视频" />
        ) : null}
      </div>
    </section>
  );
}

function ToggleExtra({
  extra,
  selected,
  desc,
  onChange,
}: {
  extra: CompanionExtra;
  selected: boolean;
  desc: string;
  onChange: (selected: boolean) => void;
}) {
  return (
    <button
      className={`flex items-center justify-between rounded-[10px] border p-3 text-left ${
        selected ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-900'
      }`}
      onClick={() => onChange(!selected)}
    >
      <span>
        <span className="block text-sm font-bold">{extra.name}</span>
        <span className={`mt-1 block text-xs ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>{desc}</span>
      </span>
      <span className="text-sm font-bold">{formatMoney(extra.priceCents)}</span>
    </button>
  );
}

function CounterButton({ ariaLabel, onClick, children }: { ariaLabel: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-700" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
