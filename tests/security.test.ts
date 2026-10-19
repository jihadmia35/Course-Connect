import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { issueToken, verifyToken, assertOrigin, readJsonBody } from '@/lib/security';
beforeEach(() => {
  vi.stubEnv('APP_URL', '');
  vi.stubEnv('VERCEL', '');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe('public write protection', () => {
  it('requires a minimum delay, expires tokens, and rejects tampering', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    const token = issueToken();
    expect(() => verifyToken(token)).toThrow('wait');
    vi.advanceTimersByTime(2100);
    expect(() => verifyToken(token)).not.toThrow();
    expect(() => verifyToken(token.slice(0, -1) + 'z')).toThrow();
    vi.advanceTimersByTime(3600000);
    expect(() => verifyToken(token)).toThrow();
  });
  it('requires the canonical same origin', () => {
    vi.stubEnv('APP_URL', 'https://course.example');
    expect(() =>
      assertOrigin(
        new Request('https://course.example/api/groups', {
          headers: { origin: 'https://evil.example' },
        }),
      ),
    ).toThrow('origin');
    expect(() =>
      assertOrigin(
        new Request('https://course.example/api/groups', {
          headers: { origin: 'https://course.example' },
        }),
      ),
    ).not.toThrow();
  });
  it.each([
    'https://seu-course-connect.vercel.app',
    'https://seu-course-connect-deployment-team.vercel.app',
    'https://seu-course-connect-git-feature-team.vercel.app',
    'https://courses.example.edu.bd',
    'http://localhost:3000',
  ])('accepts the serving origin %s without APP_URL', (origin) => {
    vi.stubEnv('APP_URL', undefined);
    expect(() =>
      assertOrigin(new Request(`${origin}/api/groups`, { headers: { origin } })),
    ).not.toThrow();
  });
  it.each([
    'https://unrelated-project.vercel.app',
    'https://evil.example',
    'http://seu-course-connect.vercel.app',
    'https://seu-course-connect.vercel.app.evil.example',
    'https://seu-course-connect.vercel.app:444',
    'null',
  ])('rejects the unrelated origin %s with automatic detection', (origin) => {
    expect(() =>
      assertOrigin(
        new Request('https://seu-course-connect.vercel.app/api/groups', {
          headers: { origin },
        }),
      ),
    ).toThrow('origin');
  });
  it('rejects a missing Origin and ignores spoofed forwarding headers', () => {
    const url = 'https://seu-course-connect.vercel.app/api/groups';
    expect(() => assertOrigin(new Request(url))).toThrow('origin');
    expect(() =>
      assertOrigin(
        new Request(url, {
          headers: {
            origin: 'https://evil.example',
            host: 'evil.example',
            'x-forwarded-host': 'evil.example',
            'x-forwarded-proto': 'https',
          },
        }),
      ),
    ).toThrow('origin');
  });
  it('uses automatic detection for a blank optional value', () => {
    vi.stubEnv('APP_URL', '   ');
    const origin = 'https://seu-course-connect.vercel.app';
    expect(() =>
      assertOrigin(new Request(`${origin}/api/reports`, { headers: { origin } })),
    ).not.toThrow();
  });
  it('uses the browser-facing Host when Next.js exposes its internal bind address', () => {
    expect(() =>
      assertOrigin(
        new Request('http://0.0.0.0:3001/api/groups', {
          headers: { host: '127.0.0.1:3001', origin: 'http://127.0.0.1:3001' },
        }),
      ),
    ).not.toThrow();
  });
  it('normalizes an explicit default HTTPS port on the serving host', () => {
    vi.stubEnv('VERCEL', '1');
    expect(() =>
      assertOrigin(
        new Request('http://127.0.0.1:3000/api/groups', {
          headers: {
            host: 'seu-course-connect.vercel.app:443',
            origin: 'https://seu-course-connect.vercel.app',
          },
        }),
      ),
    ).not.toThrow();
  });
  it.each(['seu-course-connect.vercel.app', 'seu-course-connect-git-feature-team.vercel.app'])(
    'recognizes the HTTPS Vercel host %s behind an internal URL',
    (host) => {
      vi.stubEnv('VERCEL', '1');
      expect(() =>
        assertOrigin(
          new Request('http://127.0.0.1:3000/api/groups', {
            headers: { host, origin: `https://${host}` },
          }),
        ),
      ).not.toThrow();
      expect(() =>
        assertOrigin(
          new Request('http://127.0.0.1:3000/api/groups', {
            headers: {
              host,
              origin: 'https://unrelated.vercel.app',
              'x-forwarded-host': 'unrelated.vercel.app',
            },
          }),
        ),
      ).toThrow('origin');
    },
  );
  it.each([
    'evil.example@seu-course-connect.vercel.app',
    'seu-course-connect.vercel.app/path',
    'seu-course-connect.vercel.app,evil.example',
  ])('rejects a malformed Host value %s', (host) => {
    expect(() =>
      assertOrigin(
        new Request('http://0.0.0.0:3001/api/groups', {
          headers: { host, origin: `http://${host}` },
        }),
      ),
    ).toThrow('origin');
  });
  it('preserves an explicit canonical override for a reverse proxy', () => {
    vi.stubEnv('APP_URL', 'https://courses.example.edu.bd');
    expect(() =>
      assertOrigin(
        new Request('http://internal-proxy:3000/api/groups', {
          headers: { origin: 'https://courses.example.edu.bd' },
        }),
      ),
    ).not.toThrow();
  });
  it('limits actual streamed JSON bytes even without content-length', async () => {
    const request = new Request('https://course.example/api/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(6000) }),
    });
    await expect(readJsonBody(request)).rejects.toThrow('too large');
  });
});
