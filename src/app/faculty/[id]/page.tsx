import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Users, ArrowLeft } from 'lucide-react';
import { getCatalog } from '@/lib/catalog';
import { Avatar, SectionCard, SourceNotice } from '@/components/catalog-ui';
import { SemesterPicker } from '@/components/semester-picker';
export const dynamic = 'force-dynamic';
export default async function FacultyProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semester?: string }>;
}) {
  const [{ id }, query, data] = await Promise.all([params, searchParams, getCatalog()]);
  const faculty = data.faculty.find((f) => f.id === id);
  if (!faculty) notFound();
  const semester =
      data.semesters.find((s) => s.id === query.semester)?.id ?? data.semesters[0]?.id ?? '',
    sections = data.sections.filter((s) => s.semesterId === semester && s.facultyIds.includes(id)),
    courses = data.courses.filter((c) => sections.some((s) => s.courseId === c.id));
  return (
    <div className="page-container">
      <Link className="back-link" href="/faculty">
        <ArrowLeft size={16} /> Faculty directory
      </Link>
      <SourceNotice catalog={data} />
      <div className="profile-header panel">
        <Avatar faculty={faculty} large />
        <div>
          <span className="eyebrow">
            FACULTY PROFILE <span className="initials-badge">{faculty.initials}</span>
          </span>
          <h1>{faculty.name}</h1>
          <p className="muted">{faculty.department ?? 'Southeast University · Faculty member'}</p>
          <div className="profile-counts">
            <span>
              <BookOpen size={16} /> {courses.length} courses
            </span>
            <span>
              <Users size={16} /> {sections.length} sections
            </span>
          </div>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>Assigned courses & sections</h2>
          <p>Class meetings and communities for the selected semester.</p>
        </div>
        <SemesterPicker semesters={data.semesters} value={semester} />
      </div>
      {courses.length ? (
        courses.map((c) => (
          <section className="assigned-course" key={c.id}>
            <h3>
              <Link href={`/courses/${c.id}?semester=${semester}`}>
                <span className="badge purple-badge">{c.code}</span> {c.title}
              </Link>
            </h3>
            <div className="sections-grid">
              {sections
                .filter((s) => s.courseId === c.id)
                .map((s) => (
                  <SectionCard key={s.id} section={s} catalog={data} />
                ))}
            </div>
          </section>
        ))
      ) : (
        <div className="panel empty-state">
          <h3>No courses assigned for this semester</h3>
          <p>Try another semester, or check back after the next advising import.</p>
        </div>
      )}
    </div>
  );
}
