'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type InputHTMLAttributes } from 'react';
import { Plus, Pencil, Trash2, Upload, LoaderCircle, Search, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecord, deleteRecord, uploadPhoto, runImport } from '@/app/admin/actions';
import type { Catalog } from '@/lib/types';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
const labels: Record<string, string> = {
  faculty: 'Faculty',
  courses: 'Courses',
  sections: 'Sections & schedules',
  semesters: 'Semesters',
  departments: 'Departments',
  groups: 'Messenger groups',
  reports: 'Student reports',
  imports: 'HTML importer',
  settings: 'Settings',
};
export function AdminNav() {
  const path = usePathname();
  const router = useRouter();
  return (
    <>
      <label className="admin-mobile-picker">
        Manage
        <select
          aria-label="Manage directory"
          value={path}
          onChange={(event) => router.push(event.target.value)}
        >
          <option value="/admin">Overview</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={`/admin/${key}`}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <nav className="admin-nav" aria-label="Administration">
        <Link href="/admin" className={path === '/admin' ? 'active' : ''}>
          Overview
        </Link>
        {Object.entries(labels).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/${key}`}
            className={path === `/admin/${key}` ? 'active' : ''}
          >
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
const columns: Record<string, [string, string][]> = {
  faculty: [
    ['name', 'Name'],
    ['initials', 'Initials'],
    ['department', 'Department'],
    ['courseCount', 'Courses'],
    ['sectionCount', 'Sections'],
  ],
  courses: [
    ['code', 'Code'],
    ['title', 'Course title'],
    ['credits', 'Credits'],
  ],
  sections: [
    ['course', 'Course'],
    ['number', 'Section'],
    ['semester', 'Semester'],
  ],
  semesters: [
    ['name', 'Semester'],
    ['startsAt', 'Starts'],
    ['isActive', 'Active'],
  ],
  departments: [
    ['code', 'Code'],
    ['name', 'Department'],
  ],
  groups: [
    ['section', 'Section'],
    ['semester', 'Semester'],
    ['url', 'Invite URL'],
  ],
  reports: [
    ['section', 'Section'],
    ['semester', 'Semester'],
    ['reason', 'Reason'],
    ['details', 'Details'],
    ['resolved', 'Resolved'],
  ],
  settings: [
    ['notice', 'Public notice'],
    ['submissionsEnabled', 'Submissions enabled'],
  ],
};
export function AdminManager({
  entity,
  records,
  catalog,
}: {
  entity: string;
  records: Record<string, unknown>[];
  catalog: Catalog;
}) {
  const [query, setQuery] = useState(''),
    [record, setRecord] = useState<Record<string, unknown> | null>(null),
    [edit, setEdit] = useState(false),
    [remove, setRemove] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [page, setPage] = useState(1);
  const router = useRouter();
  const filtered = records.filter((r) =>
      (columns[entity] ?? []).some(([key]) =>
        String(r[key] ?? '')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 30)),
    current = Math.min(page, pages),
    visible = filtered.slice((current - 1) * 30, current * 30);
  const canCreate = !['groups', 'reports', 'settings'].includes(entity);
  const displayValue = (value: unknown) =>
    typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '—');
  function recordActions(r: Record<string, unknown>, mobile = false) {
    const name = String(r.name ?? r.code ?? r.section ?? r.id);
    return (
      <div className="row-actions">
        <Button
          aria-label={`Edit ${name}`}
          variant="outline"
          size={mobile ? 'sm' : 'icon'}
          onClick={() => {
            setRecord(r);
            setError('');
            setEdit(true);
          }}
        >
          <Pencil size={15} />
          {mobile && 'Edit'}
        </Button>
        {entity !== 'settings' && (
          <Button
            aria-label={`Remove ${name}`}
            variant="ghost"
            size={mobile ? 'sm' : 'icon'}
            onClick={() => {
              setRemove(r);
              setError('');
            }}
          >
            <Trash2 size={15} />
            {mobile && 'Remove'}
          </Button>
        )}
      </div>
    );
  }
  async function save(form: FormData) {
    setBusy(true);
    setError('');
    try {
      const result = await saveRecord(entity, String(record?.id ?? ''), form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(result.message);
      setEdit(false);
      router.refresh();
    } catch {
      setError('Unable to save. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function destroy() {
    if (!remove) return;
    setBusy(true);
    setError('');
    try {
      const result = await deleteRecord(entity, String(remove.id));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(result.message);
      setRemove(null);
      router.refresh();
    } catch {
      setError('Unable to remove this record.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel admin-panel">
      <div className="admin-title">
        <div>
          <h2>{labels[entity]}</h2>
          <p>
            {entity === 'sections'
              ? 'Manage section faculty, classrooms, and multiple class meetings.'
              : entity === 'groups'
                ? 'Review student shared invites. Edit a URL or remove an invalid group.'
                : entity === 'reports'
                  ? 'Review reports and resolve them after taking action.'
                  : 'Create, update, and maintain directory records.'}
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => {
              setRecord(null);
              setError('');
              setEdit(true);
            }}
          >
            <Plus size={15} /> Add{' '}
            {entity === 'faculty'
              ? 'faculty'
              : entity === 'sections'
                ? 'section'
                : entity.slice(0, -1)}
          </Button>
        )}
      </div>
      <div className="search-input admin-search">
        <Search size={17} />
        <input
          aria-label="Search admin records"
          placeholder="Search records…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="admin-record-count">{filtered.length} records</div>
      <div className="admin-table-wrap admin-desktop-records">
        <table className="admin-table">
          <thead>
            <tr>
              {columns[entity]?.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={String(r.id)}>
                {columns[entity]?.map(([key]) => (
                  <td key={key}>{displayValue(r[key])}</td>
                ))}
                <td>{recordActions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-mobile-records" aria-label={`${labels[entity]} records`}>
        {visible.map((r) => (
          <article className="admin-record-card" key={String(r.id)}>
            <h3>{displayValue(r[columns[entity]?.[0]?.[0] ?? 'id'])}</h3>
            <dl>
              {columns[entity]?.slice(1).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{displayValue(r[key])}</dd>
                </div>
              ))}
            </dl>
            {recordActions(r, true)}
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="admin-empty">
          No records found. {canCreate ? 'Add a record to get started.' : ''}
        </div>
      )}
      {pages > 1 && (
        <div className="pagination">
          <span>
            Page {current} of {pages}
          </span>
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <Modal
        open={edit}
        onOpenChange={(v) => {
          if (!busy) setEdit(v);
        }}
        title={`${record ? 'Edit' : 'Add'} ${entity === 'faculty' ? 'faculty' : entity === 'sections' ? 'section' : labels[entity]?.toLowerCase()}`}
        description="Changes update the public directory immediately."
      >
        <form className="stack-form" action={save}>
          <RecordFields entity={entity} record={record} catalog={catalog} />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} />} Save changes
          </Button>
        </form>
        {entity === 'faculty' && record && (
          <PhotoForm facultyId={String(record.id)} photoUrl={record.photoUrl as string | null} />
        )}
      </Modal>
      <Modal
        open={!!remove}
        onOpenChange={(v) => {
          if (!v && !busy) setRemove(null);
        }}
        title="Remove this record?"
        description="Confirm removal from the course directory."
      >
        <p className="delete-description">
          This removes{' '}
          {String(remove?.name ?? remove?.code ?? remove?.section ?? 'the selected record')}.{' '}
          {entity === 'groups'
            ? 'Associated student reports will also be removed.'
            : entity === 'departments'
              ? 'Faculty and courses will remain, with no department assigned.'
              : 'Records with protected references cannot be removed until those references are resolved.'}
        </p>
        {error && (
          <p role="alert" className="form-error" style={{ marginTop: 15 }}>
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="outline" disabled={busy} onClick={() => setRemove(null)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={destroy}>
            {busy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Remove
            record
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function RecordFields({
  entity,
  record,
  catalog,
}: {
  entity: string;
  record: Record<string, unknown> | null;
  catalog: Catalog;
}) {
  const value = (name: string) => String(record?.[name] ?? '');
  const input = (
    name: string,
    label: string,
    options: Pick<
      InputHTMLAttributes<HTMLInputElement>,
      'type' | 'required' | 'maxLength' | 'step' | 'inputMode' | 'autoCapitalize' | 'spellCheck'
    > = {},
  ) => (
    <label key={name}>
      {label}
      <input
        {...options}
        name={name}
        defaultValue={value(name)}
        type={options.type ?? 'text'}
        required={options.required ?? true}
        maxLength={options.maxLength ?? 160}
        {...(options.type === 'number' ? { min: 0, max: 30, step: options.step ?? '0.5' } : {})}
      />
    </label>
  );
  const department = (
    <label>
      Department
      <select name="departmentId" defaultValue={value('departmentId')}>
        <option value="">Not assigned</option>
        {catalog.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (entity === 'faculty')
    return (
      <>
        {input('name', 'Full name')}
        {input('initials', 'Faculty initials', { maxLength: 20 })}
        {department}
      </>
    );
  if (entity === 'courses')
    return (
      <>
        {input('code', 'Course code', { maxLength: 20 })}
        {input('title', 'Course title', { maxLength: 250 })}
        {input('credits', 'Credits', { type: 'number', step: '0.5' })}
        {department}
      </>
    );
  if (entity === 'departments')
    return (
      <>
        {input('code', 'Department code', { maxLength: 20 })}
        {input('name', 'Department name')}
      </>
    );
  if (entity === 'semesters')
    return (
      <>
        {input('name', 'Semester name (for example, the university’s published term)', {
          maxLength: 80,
        })}
        {input('startsAt', 'Start date (optional)', { type: 'date', required: false })}
        <label className="checkbox-label">
          <input type="checkbox" name="isActive" defaultChecked={!!record?.isActive} />
          Use as the default semester
        </label>
      </>
    );
  if (entity === 'sections')
    return (
      <>
        <div className="admin-form-grid">
          <label>
            Course
            <select name="courseId" defaultValue={value('courseId')} required>
              <option value="">Select a course</option>
              {catalog.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester
            <select name="semesterId" defaultValue={value('semesterId')} required>
              <option value="">Select a semester</option>
              {catalog.semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {input('number', 'Section identifier', { maxLength: 20 })}
          <label>
            Available seats (optional)
            <input
              name="availableSeats"
              type="number"
              min={0}
              max={10000}
              defaultValue={value('availableSeats')}
            />
          </label>
          <label className="full">
            Assigned faculty (optional; select multiple if needed)
            <select
              className="multi-select"
              multiple
              name="facultyIds"
              defaultValue={
                Array.isArray(record?.facultyIds) ? (record.facultyIds as string[]) : []
              }
            >
              {catalog.faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  [{f.initials}] {f.name}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Hold Ctrl or Command to select more than one faculty member.
            </span>
          </label>
          <label className="full">
            Class meetings
            <textarea
              name="schedules"
              rows={5}
              defaultValue={value('schedules')}
              placeholder="MON 08:30 09:50 SEU215"
              maxLength={4000}
            />
            <span className="schedule-help">
              One meeting per line: day, start time, end time, room. Use 24-hour Asia/Dhaka time.
              Days: SUN MON TUE WED THU FRI SAT. Leave empty if unknown.
            </span>
          </label>
        </div>
      </>
    );
  if (entity === 'groups')
    return (
      <>
        {input('url', 'Messenger invite URL', {
          type: 'text',
          inputMode: 'url',
          autoCapitalize: 'none',
          spellCheck: false,
          maxLength: 2048,
        })}
        <p className="field-hint">
          Paste a Messenger group invite or shortened link. Supports m.me/j/…, messenger.com/j/…,
          and messenger.com/join/….
        </p>
      </>
    );
  if (entity === 'reports')
    return (
      <>
        <p className="admin-info">
          {value('reason')}
          <br />
          {value('details')}
        </p>
        <a
          href={value('url')}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-link"
        >
          Inspect reported invite ↗
        </a>
        <label className="checkbox-label">
          <input type="checkbox" name="resolved" defaultChecked={!!record?.resolved} />
          Mark this report resolved
        </label>
      </>
    );
  if (entity === 'settings')
    return (
      <>
        <label>
          Public notice
          <textarea name="notice" defaultValue={value('notice')} maxLength={500} rows={4} />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="submissionsEnabled"
            defaultChecked={!!record?.submissionsEnabled}
          />
          Allow public group submissions
        </label>
      </>
    );
  return null;
}
function PhotoForm({ facultyId, photoUrl }: { facultyId: string; photoUrl: string | null }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    router = useRouter();
  return (
    <form
      className="stack-form"
      action={async (form) => {
        setBusy(true);
        setError('');
        try {
          const result = await uploadPhoto(facultyId, form);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else setError(result.message);
        } catch {
          setError('Upload could not complete.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <hr />
      <h3>Faculty photograph</h3>
      {photoUrl && (
        <div className="admin-photo">
          <img src={photoUrl} width={50} height={50} alt="Current faculty photograph" />
          <span className="muted">Current photo</span>
        </div>
      )}
      <label>
        Upload or replace photo
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required />
        <span className="file-hint">
          JPEG, PNG, or WebP · Up to 2 MB. Images are cropped to a square.
        </span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Button variant="outline" disabled={busy}>
        <Upload size={15} />
        {busy ? 'Uploading…' : 'Upload photo'}
      </Button>
    </form>
  );
}
export function ImportPanel({
  catalog,
  history,
}: {
  catalog: Catalog;
  history: {
    id: string;
    semester: string;
    fileName: string;
    actor: string;
    summary: unknown;
    createdAt: string;
  }[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [summary, setSummary] = useState<unknown>(null),
    router = useRouter();
  return (
    <div className="panel admin-panel">
      <div className="admin-title">
        <div>
          <h2>Advising HTML importer</h2>
          <p>Safely import the rendered Offered Sections grid from a saved UMS page.</p>
        </div>
        <FileCode2 size={28} className="muted" />
      </div>
      <div className="import-warning">
        Choose the actual semester explicitly. The supplied HTML does not identify it. Imports
        update matching course sections and replace their faculty assignments and meetings; they
        preserve Messenger groups and never remove sections absent from the file. Personal advising
        records and scripts are excluded.
      </div>
      <form
        className="stack-form admin-file-form"
        action={async (form) => {
          setBusy(true);
          setError('');
          setSummary(null);
          try {
            const result = await runImport(form);
            if (result.ok) {
              setSummary(result.summary);
              toast.success(result.message);
              router.refresh();
            } else setError(result.message);
          } catch {
            setError('The import could not complete. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Import into semester
          <select name="semesterId" required defaultValue="">
            <option value="">Choose a semester</option>
            {catalog.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Saved Advising Table HTML
          <input type="file" name="html" accept=".html,text/html" required />
          <span className="file-hint">
            Maximum 3 MB. The page must contain loaded Offered Sections rows.
          </span>
        </label>
        {!catalog.semesters.length && (
          <p className="form-notice">
            Create a semester before importing.{' '}
            <Link href="/admin/semesters" className="text-link">
              Manage semesters →
            </Link>
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Button disabled={busy || !catalog.semesters.length}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{' '}
          {busy ? 'Importing advising data…' : 'Import advising data'}
        </Button>
      </form>
      {!!summary && (
        <div className="summary-result" role="status">
          <strong>Import complete</strong>
          <pre>{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}
      <h3 style={{ margin: '30px 0 15px' }}>Import history</h3>
      <div className="admin-table-wrap admin-history-table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Semester</th>
              <th>File</th>
              <th>Summary</th>
              <th>Imported by</th>
              <th>Time (Dhaka)</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td data-label="Semester">{h.semester}</td>
                <td data-label="File">{h.fileName}</td>
                <td data-label="Summary">{JSON.stringify(h.summary)}</td>
                <td data-label="Imported by">{h.actor}</td>
                <td data-label="Time (Dhaka)">
                  {new Date(h.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history.length && <div className="admin-empty">No imports yet.</div>}
      </div>
    </div>
  );
}
