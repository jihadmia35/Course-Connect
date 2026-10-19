import Link from 'next/link';
import { BookOpen, ArrowUpRight, Users, MessageCircle, CalendarDays } from 'lucide-react';
import type { Catalog, FacultyView, SectionView } from '@/lib/types';
import { GroupDialog, ReportDialog } from './group-form';
export function Avatar({ faculty, large = false }: { faculty: FacultyView; large?: boolean }) {
  return (
    <span
      className={`faculty-avatar avatar-tone-${[...faculty.initials].reduce((total, char) => total + char.charCodeAt(0), 0) % 4} ${large ? 'avatar-large' : ''}`}
    >
      {faculty.photoUrl ? (
        <img
          src={faculty.photoUrl}
          alt={faculty.name}
          width={large ? 96 : 64}
          height={large ? 96 : 64}
        />
      ) : (
        <span>{faculty.initials.slice(0, 4)}</span>
      )}
    </span>
  );
}
export function FacultyCard({
  faculty,
  catalog,
  semester,
}: {
  faculty: FacultyView;
  catalog: Catalog;
  semester: string;
}) {
  const sections = catalog.sections.filter(
    (s) => s.semesterId === semester && s.facultyIds.includes(faculty.id),
  );
  const courses = catalog.courses.filter((c) => sections.some((s) => s.courseId === c.id));
  return (
    <Link className="faculty-card" href={`/faculty/${faculty.id}?semester=${semester}`}>
      <div className="faculty-card-top">
        <Avatar faculty={faculty} />
        <span className="initials-badge">{faculty.initials}</span>
      </div>
      <div className="faculty-card-info">
        <h3>{faculty.name}</h3>
        <p>{faculty.department ?? 'Southeast University'}</p>
      </div>
      <div className="course-tags">
        {courses.slice(0, 3).map((c) => (
          <span key={c.id}>{c.code}</span>
        ))}
        {courses.length > 3 && <span>+{courses.length - 3}</span>}
        {!courses.length && <span>No assigned courses</span>}
      </div>
      <div className="faculty-counts">
        <span>
          <BookOpen size={15} />
          <b>{courses.length}</b> {courses.length === 1 ? 'course' : 'courses'}
        </span>
        <i />
        <span>
          <Users size={15} />
          <b>{sections.length}</b> {sections.length === 1 ? 'section' : 'sections'}
        </span>
      </div>
      <div className="card-action">
        View faculty profile <ArrowUpRight size={16} />
      </div>
    </Link>
  );
}
export { SectionCard } from './section-card';
export function GroupList({ section, catalog }: { section: SectionView; catalog: Catalog }) {
  return (
    <div className="panel groups-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <MessageCircle size={21} /> Messenger groups{' '}
            <span className="count-pill">{section.groups.length}</span>
          </h2>
          <p>Student shared invites for this section.</p>
        </div>
        <GroupDialog catalog={catalog} sectionId={section.id} />
      </div>
      {section.groups.length ? (
        <div className="group-list">
          {section.groups.map((g, i) => (
            <div key={g.id} className="group-row">
              <span className="group-icon">
                <MessageCircle size={24} />
              </span>
              <div>
                <h3>
                  Section {section.number} · Group {i + 1}
                </h3>
                <p className="muted">
                  Shared{' '}
                  {new Date(g.createdAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka' })}
                </p>
                <p className="invite-text">{g.url}</p>
              </div>
              <div className="group-row-actions">
                <a
                  className="button button-primary"
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  Join group <ArrowUpRight size={16} />
                </a>
                <ReportDialog groupId={g.id} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">
          <span className="empty-icon">
            <MessageCircle size={28} />
          </span>
          <h3>Be the first to connect your class</h3>
          <p>Have a Messenger invite? Share it with everyone in this section.</p>
        </div>
      )}
      <p className="info-footnote">
        Invites are submitted by students. Membership and member counts are not verified.
      </p>
    </div>
  );
}
export function SourceNotice({ catalog }: { catalog: Catalog }) {
  return (
    <>
      {catalog.preview && (
        <div className="source-notice">
          <CalendarDays size={16} />
          <span>
            Viewing the Fall - 2026 advising snapshot. Sharing becomes available after database
            setup and import.
          </span>
          <Link href="/about">
            Source details <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
      {catalog.notice && <div className="source-notice">{catalog.notice}</div>}
    </>
  );
}
