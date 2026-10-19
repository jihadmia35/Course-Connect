import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), findUnique: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/db', () => ({
  db: () => ({
    adminUser: { findUnique: mocks.findUnique },
    faculty: { create: mocks.write, delete: mocks.write },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { currentAdmin, requireAdmin } from '@/lib/auth';
import { saveRecord, deleteRecord, runImport, uploadPhoto } from '@/app/admin/actions';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DATABASE_URL', 'postgresql://test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test');
});
describe('server administrator authorization', () => {
  it('denies unauthenticated users before a database role lookup', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await currentAdmin()).toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    await expect(requireAdmin()).rejects.toThrow('authorization required');
  });
  it('denies authenticated non-admins', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'student' } }, error: null });
    mocks.findUnique.mockResolvedValue(null);
    expect(await currentAdmin()).toBeNull();
  });
  it('accepts only a matching server-side role mapping', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'admin', email: 'admin@example.com' } },
      error: null,
    });
    mocks.findUnique.mockResolvedValue({ userId: 'admin' });
    expect((await requireAdmin()).id).toBe('admin');
  });
  it('protects create, delete, import, and upload server actions', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const form = new FormData();
    for (const operation of [
      () => saveRecord('faculty', '', form),
      () => deleteRecord('faculty', 'id'),
      () => runImport(form),
      () => uploadPhoto('id', form),
    ])
      expect(await operation()).toMatchObject({
        ok: false,
        message: 'Administrator authorization required.',
      });
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
