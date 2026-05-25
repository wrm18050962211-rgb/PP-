type ChipProps = {
  children: React.ReactNode;
  active?: boolean;
};

export function Chip({ children, active = false }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'
      }`}
    >
      {children}
    </span>
  );
}
