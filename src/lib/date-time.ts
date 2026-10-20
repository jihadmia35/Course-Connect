const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

export function formatBangladeshDateTime(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    date: dateFormat.format(date),
    time: timeFormat.format(date).replace(/\s+/g, ' '),
  };
}
