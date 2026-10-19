import { getCatalog } from '@/lib/catalog';
import { Directory } from '@/components/directory';
import { SourceNotice } from '@/components/catalog-ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Course directory' };
export default async function Courses({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [data, params] = await Promise.all([getCatalog(), searchParams]);
  return (
    <div className="page-container">
      <div className="directory-heading">
        <span className="eyebrow">FIND YOUR CLASS, YOUR WAY</span>
        <h1>
          Browse courses<span className="heading-dot">.</span>
        </h1>
        <p>Pick a section number to see its schedule and join its group right here.</p>
      </div>
      <SourceNotice catalog={data} />
      <Directory key={params.q ?? ''} catalog={data} mode="courses" initialQuery={params.q} />
    </div>
  );
}
