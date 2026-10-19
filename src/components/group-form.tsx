'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ArrowUpRight,
  AlertTriangle,
  Flag,
  Link as LinkIcon,
  LoaderCircle,
  Check,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Catalog } from '@/lib/types';
import type { GroupResult } from '@/lib/groups';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { InviteActions, InviteHelp } from './invite-actions';
function useChallenge(enabled: boolean) {
  const [challenge, setChallenge] = useState({ token: '', failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    fetch('/api/challenge', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Form unavailable');
        const data = (await response.json()) as { token?: string };
        const token = data.token;
        if (!token) throw new Error('Missing challenge');
        // The server requires a two-second minimum age. Enable the action only after that
        // interval so fast pastes do not cause a preventable error and another click.
        timer = setTimeout(() => {
          if (live) setChallenge({ token, failed: false });
        }, 2100);
      })
      .catch(() => {
        if (live) setChallenge({ token: '', failed: true });
      });
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled, attempt]);
  function retry() {
    setChallenge({ token: '', failed: false });
    setAttempt((value) => value + 1);
  }
  return { token: enabled ? challenge.token : '', failed: enabled && challenge.failed, retry };
}
export function GroupDialog({
  catalog,
  sectionId,
  fullPage = false,
  label = 'Add group link',
}: {
  catalog: Catalog;
  sectionId?: string;
  fullPage?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(fullPage);
  const form = (
    <GroupForm
      catalog={catalog}
      sectionId={sectionId}
      enabled={open}
      onSuccess={() => {
        if (!fullPage) setOpen(false);
      }}
    />
  );
  if (fullPage) return form;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus size={16} /> {label}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Connect your course section"
        description="Share a Messenger invite so your classmates can find you."
        autoFocusSelector='input[inputmode="url"]'
      >
        {form}
      </Modal>
    </>
  );
}
export function GroupForm({
  catalog,
  sectionId,
  enabled = true,
  onSuccess,
}: {
  catalog: Catalog;
  sectionId?: string;
  enabled?: boolean;
  onSuccess?: () => void;
}) {
  const initial = catalog.sections.find((s) => s.id === sectionId),
    [semester, setSemester] = useState(initial?.semesterId ?? catalog.semesters[0]?.id ?? ''),
    [course, setCourse] = useState(initial?.courseId ?? ''),
    [section, setSection] = useState(sectionId ?? ''),
    [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [warning, setWarning] = useState<{ id: string; url: string }[] | null>(null),
    [success, setSuccess] = useState(false),
    [editingSelection, setEditingSelection] = useState(!initial);
  const { token, failed, retry } = useChallenge(
      enabled && !catalog.preview && catalog.submissionsEnabled,
    ),
    router = useRouter();
  const courses = catalog.courses.filter((c) =>
    catalog.sections.some((s) => s.courseId === c.id && s.semesterId === semester),
  );
  const sections = catalog.sections.filter(
    (s) => s.courseId === course && s.semesterId === semester,
  );
  async function submit(form: FormData, anyway = false) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semesterId: semester,
          courseId: course,
          sectionId: section,
          url,
          submitAnyway: anyway,
          website: form.get('website') ?? '',
          token,
        }),
      });
      const data = (await response.json()) as GroupResult & {
        error?: string;
        resolvedUrl?: string;
      };
      if (!response.ok) throw new Error(data.error ?? 'Unable to share group.');
      if (data.status === 'warning') {
        if (data.resolvedUrl) setUrl(data.resolvedUrl);
        setWarning(data.groups);
        return;
      }
      if (data.status === 'duplicate') {
        toast.info('This invite is already listed for this section.');
        setError('This invite is already listed for this section.');
        return;
      }
      toast.success('Your group link has been shared.');
      setSuccess(true);
      router.refresh();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit.');
    } finally {
      setBusy(false);
    }
  }
  if (success)
    return (
      <div className="empty-state">
        <span className="empty-icon">
          <Check />
        </span>
        <h3>Your class is a little more connected.</h3>
        <p>The invite is now available on the section page.</p>
        <a href={`/sections/${section}`} className="button button-primary">
          View your section <ArrowUpRight size={16} />
        </a>
      </div>
    );
  return (
    <form
      className="stack-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget), !!warning);
      }}
    >
      {catalog.preview && (
        <div className="form-notice">
          Sharing needs a connected Supabase database and a semester assigned by an administrator.
          You can explore the imported advising data now.
        </div>
      )}
      {!catalog.submissionsEnabled && !catalog.preview && (
        <div className="form-notice">Group submissions are currently paused.</div>
      )}
      {initial && !editingSelection && !warning && (
        <div className="selected-class">
          <span className="selected-class-icon">
            <BookOpen size={21} />
          </span>
          <div>
            <strong>
              {courses.find((c) => c.id === course)?.code}.
              {sections.find((s) => s.id === section)?.number}
            </strong>
            <p>{courses.find((c) => c.id === course)?.title}</p>
            <small>{catalog.semesters.find((s) => s.id === semester)?.name}</small>
          </div>
          <button type="button" className="text-link" onClick={() => setEditingSelection(true)}>
            Change class
          </button>
        </div>
      )}
      <fieldset hidden={!!warning} disabled={!!warning || busy}>
        <div className="class-fields" hidden={!!initial && !editingSelection}>
          <label>
            Semester
            <select
              required
              value={semester}
              onChange={(e) => {
                setSemester(e.target.value);
                setCourse('');
                setSection('');
              }}
            >
              {catalog.semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Course
            <select
              required
              value={course}
              onChange={(e) => {
                setCourse(e.target.value);
                setSection('');
              }}
            >
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <select required value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">Select a section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.number}
                  {s.facultyIds.length
                    ? ` · ${s.facultyIds.map((id) => catalog.faculty.find((f) => f.id === id)?.initials).join(', ')}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Messenger invite URL
          <div className="input-with-icon">
            <LinkIcon size={17} />
            <input
              required
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={2048}
              placeholder="https://m.me/j/your-invite-code"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </label>
        <p className="field-hint">
          Paste a Messenger group invite or shortened link. Supports m.me/j/…, messenger.com/j/…,
          and messenger.com/join/….
        </p>
      </fieldset>
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {warning && (
        <div className="submission-context">
          <strong>
            {courses.find((c) => c.id === course)?.code}.
            {sections.find((s) => s.id === section)?.number}
          </strong>
          <small>{catalog.semesters.find((s) => s.id === semester)?.name}</small>
          <p>{url}</p>
        </div>
      )}
      {warning && (
        <div className="existing-warning" role="status">
          <h3>
            <AlertTriangle size={19} /> A Messenger group already exists for this course section.
          </h3>
          <p>You can join an existing group, or share another distinct invite.</p>
          {warning.map((g, i) => (
            <div className="existing-invite-actions" key={g.id}>
              <InviteActions
                url={g.url}
                variant="outline"
                label={`Join Existing Group${warning.length > 1 ? ` ${i + 1}` : ''}`}
              />
            </div>
          ))}
          <button type="button" className="text-link" onClick={() => setWarning(null)}>
            Edit submission
          </button>
          <InviteHelp />
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {failed && (
        <div className="form-error" role="alert">
          We couldn’t prepare this form.{' '}
          <button type="button" className="text-link" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      <Button
        type="submit"
        disabled={busy || catalog.preview || !catalog.submissionsEnabled || !token}
      >
        {busy || (!catalog.preview && catalog.submissionsEnabled && !token && !failed) ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Plus size={17} />
        )}{' '}
        {busy
          ? 'Checking invite…'
          : warning
            ? 'Submit Anyway'
            : !catalog.preview && catalog.submissionsEnabled && !token && !failed
              ? 'Preparing form…'
              : 'Share group link'}
      </Button>
      <p className="field-hint">
        Only share invites you have permission to share. No sign-in needed.
      </p>
    </form>
  );
}
export function ReportDialog({ groupId, compact = false }: { groupId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    { token, failed, retry } = useChallenge(open);
  async function submit(form: FormData) {
    setBusy(true);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          reason: form.get('reason'),
          details: form.get('details'),
          website: form.get('website') ?? '',
          token,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      toast.success('Report sent to administrators.');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={compact ? 'report-icon icon-button' : 'text-link muted'}
        aria-label="Report link"
        title="Report this invite"
        onClick={() => {
          retry();
          setError('');
          setOpen(true);
        }}
      >
        <Flag size={compact ? 15 : 13} /> {!compact && 'Report link'}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Report this invite"
        description="Let administrators know what needs attention."
      >
        <form className="stack-form" action={submit}>
          <label>
            Reason
            <select name="reason">
              <option>Broken invite</option>
              <option>Wrong section</option>
              <option>Spam or abuse</option>
            </select>
          </label>
          <label>
            Details (optional)
            <textarea name="details" maxLength={500} rows={3} />
          </label>
          <div className="honeypot" aria-hidden="true">
            <input name="website" tabIndex={-1} autoComplete="off" aria-label="Website" />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {failed && (
            <div className="form-error" role="alert">
              We couldn’t prepare this form.{' '}
              <button type="button" className="text-link" onClick={retry}>
                Try again
              </button>
            </div>
          )}
          <Button disabled={busy || !token}>
            {!token && !failed ? 'Preparing form…' : 'Send report'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
