import { getCatalog } from '@/lib/catalog';
import { CourseFinder } from '@/components/course-finder';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Find your section' };
export default async function Sections({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [catalog, query] = await Promise.all([getCatalog(), searchParams]);
  return (
    <div className="page-container">
      <CourseFinder key={query.q ?? ''} catalog={catalog} initialQuery={query.q} />
    </div>
  );
}
