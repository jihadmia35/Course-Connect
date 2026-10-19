import Link from 'next/link';
import { getAdminCatalog } from '@/lib/catalog';
import { requireAdminPage } from '@/lib/auth';
import { db } from '@/lib/db';
export default async function AdminOverview() {
  await requireAdminPage();
  const data = await getAdminCatalog(),
    reports = await db().groupReport.count({ where: { resolved: false } }),
    imports = await db().importHistory.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { semester: true },
    });
  return (
    <>
      <div className="stats-grid">
        {[
          ['Faculty', data.faculty.length],
          ['Courses', data.courses.length],
          ['Sections', data.sections.length],
          ['Open reports', reports],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="admin-summary">
        <div className="panel">
          <h2>Recent advising imports</h2>
          {imports.length ? (
            imports.map((i) => (
              <p key={i.id}>
                {i.semester.name} · {i.fileName}
                <br />
                <span className="muted">
                  {i.createdAt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}
                </span>
              </p>
            ))
          ) : (
            <p>No imports yet. Create a semester, then import the saved Advising Table HTML.</p>
          )}
          <Link className="text-link" href="/admin/imports" style={{ marginTop: 15 }}>
            Open HTML importer →
          </Link>
        </div>
        <div className="panel">
          <h2>Keep the directory accurate</h2>
          <p>
            Manage course and faculty records, assign sections to a semester, and update class
            meetings. Course and section counts are calculated from assignments.
          </p>
          <p style={{ marginTop: 14 }}>
            Missing faculty photos and departments can be added manually. Reports stay open until
            you resolve or remove them.
          </p>
          <Link className="text-link" href="/admin/reports" style={{ marginTop: 15 }}>
            Review student reports →
          </Link>
        </div>
      </div>
    </>
  );
}
