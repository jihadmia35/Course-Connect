import { describe, expect, it } from 'vitest';
import { messengerLaunchUrl, normalizeMessengerUrl } from '@/lib/invite-url';
describe('full Messenger invite launch address', () => {
  it.each([
    'https://m.me/j/Copied_TOKEN-123',
    'https://messenger.com/j/Copied_TOKEN-123/',
    'https://messenger.com/join/Copied_TOKEN-123?utm_source=directory',
    'https://m.messenger.com/j/Copied_TOKEN-123?send_source=gc%3Acopy_invite',
  ])('opens %s through the full invite route without changing its stored identity', (url) => {
    const launch = messengerLaunchUrl(url);
    expect(launch).toBe(
      'https://www.messenger.com/j/Copied_TOKEN-123/?send_source=gc%3Acopy_invite',
    );
    expect(normalizeMessengerUrl(launch)).toBe(normalizeMessengerUrl(url));
  });
  it.each([
    'javascript:alert(1)',
    'https://m.me/profile',
    'https://messenger.com/t/123456',
    'https://messenger.com.evil.example/j/Token123',
  ])('never creates a launch URL for %s', (url) => {
    expect(() => messengerLaunchUrl(url)).toThrow();
  });
});
