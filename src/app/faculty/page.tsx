import { getCatalog } from '@/lib/catalog';
import { Directory } from '@/components/directory';
import { SourceNotice } from '@/components/catalog-ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faculty directory' };
export default async function FacultyDirectory() {
  const data = await getCatalog();
  return (
    <div className="page-container">
      <div className="directory-heading">
        <span className="eyebrow">A FAMILIAR FACE IS A GOOD START</span>
        <h1>
          Faculty directory<span className="heading-dot">.</span>
        </h1>
        <p>Find a name or initials. Their courses, schedules and group links are one tap away.</p>
      </div>
      <SourceNotice catalog={data} />
      <Directory catalog={data} mode="faculty" />
    </div>
  );
}
