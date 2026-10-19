import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { getCatalog } from '@/lib/catalog';
import { SectionCard, GroupList, SourceNotice } from '@/components/catalog-ui';
export const dynamic = 'force-dynamic';
export default async function SectionDetails({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, data] = await Promise.all([params, getCatalog()]);
  const section = data.sections.find((s) => s.id === id);
  if (!section) notFound();
  const course = data.courses.find((c) => c.id === section.courseId)!;
  return (
    <div className="page-container">
      <Link className="back-link" href={`/courses/${course.id}?semester=${section.semesterId}`}>
        <ArrowLeft size={16} /> {course.code} sections
      </Link>
      <SourceNotice catalog={data} />
      <div className="directory-heading">
        <div>
          <span className="eyebrow">YOUR CLASSROOM COMMUNITY</span>
          <h1>
            {course.code}
            <span className="heading-dot">.</span>
            {section.number}
          </h1>
          <p>{course.title}</p>
        </div>
        <span className="badge">
          <CalendarDays size={15} />
          {data.semesters.find((s) => s.id === section.semesterId)?.name}
        </span>
      </div>
      <div className="section-detail-grid">
        <div>
          <span className="detail-label">CLASS DETAILS</span>
          <SectionCard section={section} catalog={data} showGroups={false} />
        </div>
        <GroupList section={section} catalog={data} />
      </div>
    </div>
  );
}
