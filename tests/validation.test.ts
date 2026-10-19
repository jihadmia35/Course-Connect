import { describe, it, expect } from 'vitest';
import { normalizeMessengerUrl, groupInput, isAuthorizedAdmin } from '@/lib/validation';
describe('Messenger URLs', () => {
  it('normalizes safely detectable equivalent URLs', () => {
    expect(
      normalizeMessengerUrl(' https://www.m.me/j/AbCd_1234/?utm_source=seu&fbclid=test '),
    ).toBe('https://m.me/j/AbCd_1234');
    expect(normalizeMessengerUrl('https://www.messenger.com/join/AbCd1234/')).toBe(
      'https://m.me/j/AbCd1234',
    );
  });
  it('accepts copied Messenger invites and removes send_source share metadata', () => {
    const copied =
      'https://www.m.me/j/CopiedInviteToken/?send_source=gc%3Acopy_invite&mibextid=test';
    const canonical = 'https://m.me/j/CopiedInviteToken';
    expect(normalizeMessengerUrl(copied)).toBe(canonical);
    expect(normalizeMessengerUrl(copied)).toBe(normalizeMessengerUrl(canonical));
    expect(
      normalizeMessengerUrl(
        'https://messenger.com/join/CopiedInviteToken?send_source=gc%3Acopy_invite',
      ),
    ).toBe(canonical);
  });
  it.each([
    'https://www.messenger.com/j/AbCd_1234/',
    'https://m.messenger.com/j/AbCd_1234?send_source=gc%3Acopy_invite',
    'https://messenger.com/join/AbCd_1234',
    'http://m.me/j/AbCd_1234',
    'm.me/j/AbCd_1234',
    '//www.messenger.com/j/AbCd_1234/#_=_',
  ])('accepts copied invite %s', (url) => {
    expect(normalizeMessengerUrl(url)).toBe('https://m.me/j/AbCd_1234');
  });
  it.each([
    'https://m.me.evil.test/j/AbCd1234',
    'https://user:password@m.me/j/AbCd1234',
    'javascript:alert(1)',
    'https://m.me/user',
    'https://facebook.com/groups/1',
    'https://m.me/j/AbCd1234#x',
    'https://m.me:444/j/AbCd1234',
    'https://m.me/j/AbCd1234?unknown=1',
    'https://messenger.com/t/123',
    'https://messenger.com/j/short',
    'https://messenger.com/j/' + 'a'.repeat(257),
    'https://messenger.com/j/AbCd1234/extra',
    'https://m.me/j/%2F%2Fabcd',
  ])('rejects %s', (url) => expect(() => normalizeMessengerUrl(url)).toThrow());
  it('requires a real section identity and rejects honeypot spam', () => {
    expect(
      groupInput.safeParse({
        semesterId: 's',
        courseId: 'c',
        sectionId: 's1',
        url: 'https://m.me/j/abcdef',
        website: 'spam',
        token: 'test',
      }).success,
    ).toBe(false);
  });
});
describe('admin mapping', () => {
  it('requires matching authenticated identity and database mapping', () => {
    expect(isAuthorizedAdmin(null, { userId: 'one' })).toBe(false);
    expect(isAuthorizedAdmin('one', null)).toBe(false);
    expect(isAuthorizedAdmin('one', { userId: 'two' })).toBe(false);
    expect(isAuthorizedAdmin('one', { userId: 'one' })).toBe(true);
  });
});
