import { readFile, writeFile } from 'node:fs/promises';
import { parseAdvisingHtml } from '../src/lib/parser';
import { uniqueMeetings } from '../src/lib/meetings';
const path = process.argv[2];
if (!path) throw new Error('Usage: npm run data:analyze -- /path/to/advising.html [output.json]');
const parsed = parseAdvisingHtml(await readFile(path, 'utf8'));
const summary = {
  sections: parsed.rows.length,
  courses: new Set(parsed.rows.map((r) => r.code)).size,
  faculty: new Set(parsed.rows.flatMap((r) => r.faculty.map((f) => f.initials))).size,
  meetings: parsed.rows.reduce((n, r) => n + r.schedules.length, 0),
  distinctMeetings: parsed.rows.reduce((n, r) => n + uniqueMeetings(r.schedules).length, 0),
  missingFaculty: parsed.rows.filter((r) => !r.faculty.length).map((r) => `${r.code}.${r.number}`),
  duplicates: parsed.duplicates,
  invalid: parsed.invalid,
};
console.log(JSON.stringify(summary, null, 2));
if (process.argv[3])
  await writeFile(
    process.argv[3],
    JSON.stringify(
      {
        source: path.split('/').pop(),
        semester: process.env.IMPORT_SEMESTER || null,
        rows: parsed.rows,
      },
      null,
      2,
    ) + '\n',
  );
