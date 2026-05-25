import { MapPin } from 'lucide-react';

type LocationSelectorProps = {
  areas: string[];
  selectedArea: string;
  onSelect: (area: string) => void;
};

export function LocationSelector({ areas, selectedArea, onSelect }: LocationSelectorProps) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
        <MapPin size={16} />
        地点
      </h3>
      <div className="flex flex-wrap gap-2">
        {areas.map((area) => (
          <OptionButton key={area} active={area === selectedArea} onClick={() => onSelect(area)}>
            {area}
          </OptionButton>
        ))}
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
