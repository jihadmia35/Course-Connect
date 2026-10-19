import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SourceRow } from './types';
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const meetingSchema = z
  .object({
    day: z.enum(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
    startTime: z.string().regex(time),
    endTime: z.string().regex(time),
    room: z.string().trim().min(1).max(80),
  })
  .refine((x) => x.endTime > x.startTime, { message: 'End time must follow start time' });
const rowSchema = z.object({
  code: z.string().regex(/^[A-Z]+\d+[A-Z]?$/),
  number: z.string().regex(/^[\w-]{1,20}$/),
  title: z.string().min(1).max(250),
  credits: z.number().min(0).max(30),
  faculty: z.array(
    z.object({ initials: z.string().regex(/^[A-Z0-9]{1,20}$/), name: z.string().min(1).max(160) }),
  ),
  availableSeats: z.number().int().min(0).nullable(),
  schedules: z.array(meetingSchema),
  sourceNote: z.string().max(500).nullable(),
});
export function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
type TextNode = { type: string; data?: string; children?: TextNode[] };
function plainText(root: TextNode) {
  const pending = [root],
    parts: string[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === 'text') parts.push(node.data ?? '');
    else if (node.children)
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
export function parseAdvisingHtml(html: string) {
  if (Buffer.byteLength(html) > 5 * 1024 * 1024) throw new Error('HTML must be 5 MB or smaller.');
  const $ = load(html);
  $('script,style,iframe,object,template,svg').remove();
  const rows: SourceRow[] = [];
  const invalid: { row: number; reason: string }[] = [];
  const seen = new Map<string, string>();
  let duplicates = 0;
  $('.ums-grid-offered-section').each((index, element) => {
    const cells = $(element)
      .children('div')
      .map((_, c) => plainText(c))
      .get();
    if (cells[0] === 'Code') return;
    const code = cells[0]?.match(/^([A-Z]+\d+[A-Z]?)\.([\w-]+)$/);
    if (!code || cells.length < 8) {
      invalid.push({ row: index + 1, reason: 'Unrecognized offered-section row' });
      return;
    }
    const schedules = [
      ...(cells[5] ?? '').matchAll(
        /(SUN|MON|TUE|WED|THU|FRI|SAT)\s*#\s*(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})\s*@\s*([^\s]+)/g,
      ),
    ].map((m) => ({ day: m[1]!, startTime: m[2]!, endTime: m[3]!, room: m[4]! }));
    const faculty = [...(cells[3] ?? '').matchAll(/\[([^\]]+)\]\s*([^\[]+)/g)].map((m) => ({
      initials: m[1]!.trim(),
      name: m[2]!.trim(),
    }));
    const candidate = {
      code: code[1],
      number: code[2],
      title: cells[1],
      credits: cells[2]?.trim() ? Number(cells[2]) : NaN,
      faculty,
      availableSeats: /^\d+$/.test(cells[4] ?? '') ? Number(cells[4]) : null,
      schedules,
      sourceNote: cells[7] || null,
    };
    const result = rowSchema.safeParse(candidate);
    const scheduleText = (cells[5] ?? '')
      .replace(/(SUN|MON|TUE|WED|THU|FRI|SAT)\s*#\s*\d{2}:\d{2}\s*~\s*\d{2}:\d{2}\s*@\s*\S+/g, '')
      .trim();
    const facultyText = cells[3] ?? '';
    if (
      !result.success ||
      (scheduleText && !/^(N\/A|TBA|-)$/.test(scheduleText)) ||
      (!faculty.length && facultyText && !/^(N\/A|TBA|-)$/.test(facultyText))
    ) {
      invalid.push({
        row: index + 1,
        reason:
          result.error?.issues[0]?.message ?? 'Unrecognized faculty or schedule; row not imported',
      });
      return;
    }
    const key = `${result.data.code}.${result.data.number}`,
      hash = fingerprint(result.data);
    if (seen.has(key)) {
      if (seen.get(key) !== hash)
        invalid.push({ row: index + 1, reason: `Conflicting duplicate ${key}` });
      else duplicates++;
      return;
    }
    seen.set(key, hash);
    rows.push(result.data);
  });
  if (!rows.length && !invalid.length)
    throw new Error(
      'No offered-section rows found. Save the fully loaded Advising Table page as HTML.',
    );
  // Conflicting duplicates are excluded entirely, never resolved by row order.
  const conflicts = new Set(
    invalid.flatMap((i) =>
      i.reason.startsWith('Conflicting duplicate ')
        ? [i.reason.replace('Conflicting duplicate ', '')]
        : [],
    ),
  );
  return { rows: rows.filter((r) => !conflicts.has(`${r.code}.${r.number}`)), invalid, duplicates };
}
