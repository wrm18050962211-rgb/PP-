export function splitSlotLabel(label: string) {
  const [dateLabel, timeLabel] = label.split(' ');
  return {
    dateLabel: dateLabel || label,
    timeLabel: timeLabel || label,
  };
}

export function uniqueItems<T>(items: T[]) {
  return Array.from(new Set(items));
}
