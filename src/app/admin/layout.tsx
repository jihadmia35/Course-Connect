import { redirect } from 'next/navigation';
import { currentAdmin } from '@/lib/auth';
import { AdminNav } from '@/components/admin-manager';
import { logout } from '@/app/login/actions';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin dashboard', robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentAdmin();
  if (!user) redirect('/login');
  return (
    <div className="page-container">
      <div className="admin-title admin-workspace-heading">
        <div>
          <span className="eyebrow">DIRECTORY ADMINISTRATION</span>
          <h1>
            Campus control center<span className="heading-dot">.</span>
          </h1>
          <p>Signed in as {user.email}</p>
        </div>
        <form action={logout}>
          <button className="button button-outline button-sm">Sign out</button>
        </form>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
