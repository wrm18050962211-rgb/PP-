import { MapPin } from 'lucide-react';

type LocationSelectorProps = {
  areas: string[];
  selectedArea: string;
  onSelect: (area: string) => void;
};

export function LocationSelector({ areas, selectedArea, onSelect }: LocationSelectorProps) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#3f302c]">
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
    <button className={`rounded-full px-3 py-2 text-xs font-semibold ${active ? 'bg-[#3f302c] text-white' : 'bg-white/78 text-[#6f625d] ring-1 ring-[#eadfd8]'}`} onClick={onClick}>
      {children}
    </button>
  );
}
