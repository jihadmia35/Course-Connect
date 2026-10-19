import { getCatalog } from '@/lib/catalog';
import { CourseFinder } from '@/components/course-finder';
export const dynamic = 'force-dynamic';
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; semester?: string }>;
}) {
  const [catalog, query] = await Promise.all([getCatalog(), searchParams]);
  const semester = catalog.semesters.find((s) => s.id === query.semester)?.id;
  return (
    <div className="page-container">
      <CourseFinder
        key={`${query.q ?? ''}:${semester ?? ''}`}
        catalog={catalog}
        initialQuery={query.q}
        initialSemester={semester}
      />
    </div>
  );
}
