import { getCatalog } from '@/lib/catalog';
import { CourseFinder } from '@/components/course-finder';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saved sections' };
export default async function Saved() {
  return (
    <div className="page-container">
      <CourseFinder catalog={await getCatalog()} onlySaved />
    </div>
  );
}
