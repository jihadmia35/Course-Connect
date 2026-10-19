import 'server-only';
import { redirect } from 'next/navigation';
import { db } from './db';
import { supabaseServer } from './supabase/server';
import { isAuthorizedAdmin } from './validation';
export async function currentAdmin() {
  if (
    !process.env.DATABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const mapping = await db().adminUser.findUnique({ where: { userId: user.id } });
  return isAuthorizedAdmin(user.id, mapping) ? user : null;
}
export async function requireAdmin() {
  const user = await currentAdmin();
  if (!user) throw new Error('Administrator authorization required.');
  return user;
}

export async function requireAdminPage() {
  const user = await currentAdmin();
  if (!user) redirect('/login');
  return user;
}
