import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { currentAdmin } from '@/lib/auth';
import { LoginForm } from '@/components/login-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administrator sign in', robots: { index: false, follow: false } };
export default async function Login() {
  if (await currentAdmin()) redirect('/admin');
  return (
    <div className="page-container">
      <div className="panel login-card">
        <span className="empty-icon">
          <ShieldCheck size={29} />
        </span>
        <span className="eyebrow">ADMINISTRATOR ACCESS</span>
        <h1>
          Welcome back<span className="heading-dot">.</span>
        </h1>
        <p className="muted">Manage the directory and keep your campus connected.</p>
        <LoginForm />
      </div>
    </div>
  );
}
