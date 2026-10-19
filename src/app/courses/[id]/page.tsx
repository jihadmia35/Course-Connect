import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { getCatalog } from '@/lib/catalog';
import { SectionCard, SourceNotice } from '@/components/catalog-ui';
import { SemesterPicker } from '@/components/semester-picker';
export const dynamic = 'force-dynamic';
export default async function CourseDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semester?: string }>;
}) {
  const [{ id }, query, data] = await Promise.all([params, searchParams, getCatalog()]);
  const course = data.courses.find((c) => c.id === id);
  if (!course) notFound();
  const semester =
      data.semesters.find((s) => s.id === query.semester)?.id ?? data.semesters[0]?.id ?? '',
    sections = data.sections
      .filter((s) => s.courseId === id && s.semesterId === semester)
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return (
    <div className="page-container">
      <Link href="/courses" className="back-link">
        <ArrowLeft size={16} /> Course directory
      </Link>
      <SourceNotice catalog={data} />
      <div className="profile-header panel">
        <span className="course-icon large">
          <BookOpen size={35} />
        </span>
        <div>
          <span className="eyebrow">
            {course.code} <span className="badge">{course.credits} credits</span>
          </span>
          <h1>{course.title}</h1>
          <p className="muted">{course.department ?? 'Southeast University · Course overview'}</p>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Available sections <span className="count-pill">{sections.length}</span>
          </h2>
          <p>Find your faculty, class schedule, and course community.</p>
        </div>
        <SemesterPicker semesters={data.semesters} value={semester} />
      </div>
      <div className="sections-grid">
        {sections.map((s) => (
          <SectionCard key={s.id} section={s} catalog={data} />
        ))}
      </div>
      {!sections.length && (
        <div className="panel empty-state">
          <h3>No sections in this semester</h3>
          <p>Select a different semester to explore available sections.</p>
        </div>
      )}
    </div>
  );
}
