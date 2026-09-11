const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PICKUP_WINDOWS = [
  { start_time: '09:00:00', end_time: '11:00:00' },
  { start_time: '14:00:00', end_time: '16:00:00' },
  { start_time: '16:00:00', end_time: '18:00:00' },
] as const;

export function bangkokDate(offset = 0, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const midnight = Date.UTC(value('year'), value('month') - 1, value('day'));
  return new Date(midnight + offset * DAY_IN_MS).toISOString().slice(0, 10);
}

export function defaultPickupSlotRows(days = 14, now = new Date()) {
  return Array.from({ length: days }, (_, offset) => bangkokDate(offset, now)).flatMap((slot_date) =>
    DEFAULT_PICKUP_WINDOWS.map((window) => ({
      slot_date,
      ...window,
      capacity: 8,
      enabled: true,
    })),
  );
}
