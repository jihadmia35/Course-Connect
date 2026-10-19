import type { Meeting } from './types';
export function uniqueMeetings(meetings: Meeting[]): Meeting[] {
  const seen = new Set<string>();
  return meetings.filter((m) => {
    const key = JSON.stringify([m.day, m.startTime, m.endTime, m.room]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
