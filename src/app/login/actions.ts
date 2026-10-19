'use server';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { currentAdmin } from '@/lib/auth';
import { rateLimit } from '@/lib/security';
export async function login(form: FormData): Promise<{ error: string } | undefined> {
  const result = z
    .object({ email: z.email().max(200), password: z.string().min(8).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!result.success) return { error: 'Enter a valid email and password.' };
  if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL)
    return { error: 'Configure Supabase and the database before signing in.' };
  try {
    await rateLimit(await headers(), 'login', 10);
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword(result.data);
    if (error) return { error: 'Sign-in failed. Check your email and password.' };
    const admin = await currentAdmin();
    if (!admin) {
      await supabase.auth.signOut();
      return { error: 'This account does not have administrator access.' };
    }
  } catch {
    return {
      error: 'Sign-in is unavailable or there have been too many attempts. Try again later.',
    };
  }
  redirect('/admin');
}
export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
