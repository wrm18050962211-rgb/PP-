import type { ActivityPricing } from '../../types/api';

type ActivitySelectorProps = {
  activities: ActivityPricing[];
  selectedActivityId: string;
  onSelect: (activity: ActivityPricing) => void;
};

export function ActivitySelector({ activities, selectedActivityId, onSelect }: ActivitySelectorProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-bold text-[#3f302c]">活动形式</h3>
      <div className="grid gap-2">
        {activities.map((activity) => {
          const active = activity.id === selectedActivityId;
          return (
            <button
              key={activity.id}
              onClick={() => onSelect(activity)}
              className={`flex w-full items-center justify-between rounded-[10px] border p-3 text-left ${
                active ? 'border-[#3f302c] bg-[#3f302c] text-white' : 'border-[#eadfd8] bg-white/78 text-[#3f302c]'
              }`}
            >
              <span>
                <span className="block text-sm font-bold">{activity.name}</span>
                <span className={`mt-1 block text-xs ${active ? 'text-white/70' : 'text-[#8f8078]'}`}>推荐 {activity.durationLabel}</span>
              </span>
              <span className="text-sm font-bold">{activity.priceText}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
