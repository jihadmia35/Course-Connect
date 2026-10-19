/** Public URL parsing only; performs no network requests. */
export const INVITE_URL_LIMIT = 2048;
const messengerHosts = new Set([
  'm.me',
  'www.m.me',
  'messenger.com',
  'www.messenger.com',
  'm.messenger.com',
]);
export function submittedInviteUrl(input: string): URL {
  const value = input.trim();
  if (!value || value.length > INVITE_URL_LIMIT || /[\x00-\x20\x7f]/.test(value))
    throw new Error('Paste a complete Messenger invite or shortened link.');
  let url: URL;
  try {
    const address = value.startsWith('//')
      ? `https:${value}`
      : /^[a-z][a-z\d+.-]*:/i.test(value)
        ? value
        : `https://${value}`;
    url = new URL(address);
  } catch {
    throw new Error('Paste a valid Messenger invite or shortened link.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    (url.hash && url.hash !== '#_=_')
  )
    throw new Error('Use a web invite link without credentials, custom ports, or fragments.');
  // Legacy copied HTTP links are upgraded; no unencrypted request is ever made.
  url.protocol = 'https:';
  url.hash = '';
  return url;
}
export function isMessengerInviteHost(hostname: string) {
  return messengerHosts.has(hostname.toLowerCase());
}
export function normalizeMessengerUrl(input: string): string {
  const url = submittedInviteUrl(input);
  if (!isMessengerInviteHost(url.hostname))
    throw new Error(
      'Use a Messenger group invite: m.me/j/…, messenger.com/j/…, or messenger.com/join/….',
    );
  const match = url.pathname.match(
    url.hostname === 'm.me' || url.hostname === 'www.m.me'
      ? /^\/j\/([A-Za-z0-9_-]{6,256})\/?$/
      : /^\/(?:j|join)\/([A-Za-z0-9_-]{6,256})\/?$/,
  );
  if (!match)
    throw new Error('Use a group invite link, not a profile or private conversation address.');
  for (const key of url.searchParams.keys())
    if (!key.startsWith('utm_') && !['fbclid', 'mibextid', 'send_source'].includes(key))
      throw new Error('Remove unsupported invite query parameters.');
  // One stable invite representation works with existing database constraints.
  return `https://m.me/j/${match[1]}`;
}

/** Storage identity is separate from the full invite address used for joining. */
export function messengerLaunchUrl(input: string): string {
  const canonical = normalizeMessengerUrl(input);
  const token = canonical.slice('https://m.me/j/'.length);
  return `https://www.messenger.com/j/${token}/?send_source=gc%3Acopy_invite`;
}
