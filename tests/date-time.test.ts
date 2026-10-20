import { describe, expect, it } from 'vitest';
import { formatBangladeshDateTime } from '@/lib/date-time';

describe('Bangladesh submission timestamps', () => {
  it.each([
    ['2026-10-19T19:05:00Z', '20 Oct 2026', '01:05 AM'],
    ['2026-10-19T18:00:00Z', '20 Oct 2026', '12:00 AM'],
    ['2026-10-20T06:00:00Z', '20 Oct 2026', '12:00 PM'],
    ['2026-10-20T17:59:00Z', '20 Oct 2026', '11:59 PM'],
  ])('converts %s independently of the viewer’s timezone', (value, date, time) => {
    expect(formatBangladeshDateTime(value)).toEqual({
      iso: new Date(value).toISOString(),
      date,
      time,
    });
  });
  it('does not invent a submission date for missing or invalid timestamps', () => {
    for (const value of [null, undefined, '', 'not-a-date', 123])
      expect(formatBangladeshDateTime(value)).toBeNull();
  });
});
