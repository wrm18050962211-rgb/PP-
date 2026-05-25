export function formatMoney(amountCents: number) {
  const yuan = amountCents / 100;
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(2)}`;
}

export function yuanToCents(yuan: number) {
  return Math.round(yuan * 100);
}
