import { load } from 'cheerio';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAdvisingHtml } from '@/lib/parser';
import snapshot from '../data/advising-snapshot.json';
const html = readFileSync('tests/fixtures/advising.html', 'utf8');
describe('UMS parser', () => {
  it('preserves all source courses, sections, faculty and meetings', () => {
    const result = parseAdvisingHtml(html);
    expect(result.rows).toHaveLength(496);
    expect(result.rows).toEqual(snapshot.rows);
    expect(new Set(result.rows.map((r) => r.code)).size).toBe(69);
    expect(new Set(result.rows.flatMap((r) => r.faculty.map((f) => f.initials))).size).toBe(122);
    expect(result.rows.reduce((n, r) => n + r.schedules.length, 0)).toBe(805);
    expect(result.invalid).toEqual([]);
    expect(result.rows.filter((r) => !r.faculty.length)).toHaveLength(13);
    expect(result.rows[0]).toMatchObject({
      code: 'ACT141',
      number: '1',
      title: 'Introduction to Accounting',
      faculty: [{ initials: 'FZC', name: 'Dr. Faieza Chowdhury' }],
    });
  });
  it('splits course codes from one- and two-digit section suffixes', () => {
    const rows = parseAdvisingHtml(html).rows;
    expect(rows.find((r) => r.code === 'CSE361' && r.number === '9')).toBeDefined();
    expect(rows.find((r) => r.code === 'CSE264' && r.number === '12')).toBeDefined();
    expect(rows.some((r) => r.code.includes('.'))).toBe(false);
  });
  it('never executes scripts or reads personal advised rows', () => {
    (globalThis as Record<string, unknown>).pwned = false;
    const r = parseAdvisingHtml(
      html +
        '<script>globalThis.pwned=true</script><div class="ums-grid-advised-section"><div>PRIVATE101.1</div></div>',
    );
    expect((globalThis as Record<string, unknown>).pwned).toBe(false);
    expect(r.rows).toHaveLength(496);
  });
  it('skips exact duplicates and flags conflicting records', () => {
    const row = load(html)('.ums-grid-offered-section').first().toString();
    const duplicate = parseAdvisingHtml(row + row);
    expect(duplicate.rows).toHaveLength(1);
    expect(duplicate.duplicates).toBe(1);
    const conflict = parseAdvisingHtml(row + row.replace('Accounting', 'Accounting changed'));
    expect(conflict.rows).toHaveLength(0);
    expect(conflict.invalid[0]?.reason).toContain('Conflicting duplicate');
  });
  it('rejects malformed meetings instead of silently losing source data', () => {
    const r = parseAdvisingHtml(html.replace('08:30 ~ 09:50', '25:30 ~ 29:50'));
    expect(r.invalid).toHaveLength(1);
    expect(r.rows).toHaveLength(495);
  });
  it('rejects an unloaded page and oversized documents', () => {
    expect(() => parseAdvisingHtml('<app-root></app-root>')).toThrow('No offered-section');
    expect(() => parseAdvisingHtml('x'.repeat(5 * 1024 * 1024 + 1))).toThrow('5 MB');
  });
});
