import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  findFaculty: vi.fn(),
  updateFaculty: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  bucket: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAdmin: mocks.authorize }));
vi.mock('@/lib/db', () => ({
  db: () => ({ faculty: { findUniqueOrThrow: mocks.findFaculty, update: mocks.updateFaculty } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
import { updateTag } from 'next/cache';
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import { uploadPhoto } from '@/app/admin/actions';
function form(bytes: Uint8Array, type = 'image/png') {
  const form = new FormData();
  form.set('photo', new File([new Uint8Array(bytes)], 'test-image', { type }));
  return form;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage-test.invalid');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only-storage-key');
  mocks.authorize.mockResolvedValue({ id: 'test-admin' });
  mocks.findFaculty.mockResolvedValue({ id: 'test-faculty', photoPath: 'test-faculty/old.webp' });
  mocks.updateFaculty.mockResolvedValue({});
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.bucket.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
  mocks.createClient.mockReturnValue({ storage: { from: mocks.bucket } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const image = () =>
  sharp({ create: { width: 4, height: 6, channels: 3, background: '#abcdef' } })
    .png()
    .toBuffer();
describe('faculty photo safety and replacement without external writes', () => {
  it('requires authorization before any database or Storage access', async () => {
    mocks.authorize.mockRejectedValue(new Error('Administrator authorization required.'));
    expect(await uploadPhoto('test-faculty', form(await image()))).toMatchObject({ ok: false });
    expect(mocks.findFaculty).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it('re-encodes a valid image, updates its path, then removes the previous object', async () => {
    expect(await uploadPhoto('test-faculty', form(await image()))).toMatchObject({ ok: true });
    expect(mocks.bucket).toHaveBeenCalledWith('faculty-photos');
    const [path, bytes, options] = mocks.upload.mock.calls[0];
    expect(path).toMatch(/^test-faculty\/[a-f0-9-]+\.webp$/);
    expect(options).toMatchObject({ contentType: 'image/webp', upsert: false });
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: 'webp',
      width: 512,
      height: 512,
    });
    expect(mocks.updateFaculty).toHaveBeenCalledWith({
      where: { id: 'test-faculty' },
      data: { photoPath: path },
    });
    expect(mocks.remove).toHaveBeenCalledWith(['test-faculty/old.webp']);
    expect(mocks.updateFaculty.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0],
    );
    expect(updateTag).toHaveBeenCalledTimes(1);
  });
  it('cleans up the new upload if the database path update fails, preserving the old photo', async () => {
    mocks.updateFaculty.mockRejectedValue(new Error('simulated persistence failure'));
    expect(await uploadPhoto('test-faculty', form(await image()))).toMatchObject({ ok: false });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
    expect(mocks.remove).not.toHaveBeenCalledWith(['test-faculty/old.webp']);
    expect(updateTag).not.toHaveBeenCalled();
  });
  it('does not change the faculty record when Storage rejects the upload', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('simulated storage failure') });
    expect(await uploadPhoto('test-faculty', form(await image()))).toMatchObject({ ok: false });
    expect(mocks.updateFaculty).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('rejects oversize images, unsupported SVGs, and spoofed MIME types before Storage access', async () => {
    for (const input of [
      form(new Uint8Array(2 * 1024 * 1024 + 1)),
      form(new TextEncoder().encode('<svg/>'), 'image/svg+xml'),
      form(await image(), 'image/jpeg'),
    ])
      expect(await uploadPhoto('test-faculty', input)).toMatchObject({ ok: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateFaculty).not.toHaveBeenCalled();
  });
  it('rejects corrupt images even if the signature matches their declared type', async () => {
    expect(
      await uploadPhoto(
        'test-faculty',
        form(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      ),
    ).toMatchObject({ ok: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
