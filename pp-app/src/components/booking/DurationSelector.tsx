export type DurationOption = {
  label: string;
  minutes: number;
};

type DurationSelectorProps = {
  options: DurationOption[];
  selectedMinutes: number;
  onSelect: (minutes: number) => void;
};

export function DurationSelector({ options, selectedMinutes, onSelect }: DurationSelectorProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-bold text-zinc-900">时长</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.minutes}
            className={`rounded-full px-3 py-2 text-xs font-semibold ${
              selectedMinutes === option.minutes ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'
            }`}
            onClick={() => onSelect(option.minutes)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
