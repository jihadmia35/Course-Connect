import { z } from 'zod';
export function normalizeMessengerUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter a valid HTTPS Messenger invite URL.');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !['m.me', 'messenger.com'].includes(host)
  )
    throw new Error('Use an HTTPS m.me/j/… or messenger.com/join/… invite.');
  const pattern =
    host === 'm.me' ? /^\/j\/([A-Za-z0-9_-]{6,256})\/?$/ : /^\/join\/([A-Za-z0-9_-]{6,256})\/?$/;
  const match = url.pathname.match(pattern);
  if (!match) throw new Error('This Messenger invite format is not supported.');
  for (const key of url.searchParams.keys())
    if (!key.startsWith('utm_') && !['fbclid', 'mibextid', 'send_source'].includes(key))
      throw new Error('Remove unsupported invite query parameters.');
  return `https://${host}/${host === 'm.me' ? 'j' : 'join'}/${match[1]}`;
}
export const messengerUrl = z
  .string()
  .max(1000)
  .transform((value, ctx) => {
    try {
      return normalizeMessengerUrl(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
      return z.NEVER;
    }
  });
export const groupInput = z.object({
  semesterId: z.string().min(1).max(100),
  courseId: z.string().min(1).max(100),
  sectionId: z.string().min(1).max(100),
  url: messengerUrl,
  submitAnyway: z.boolean().default(false),
  website: z.string().max(0).default(''),
  token: z.string().min(1).max(400),
});
export const reportInput = z.object({
  groupId: z.string().min(1).max(100),
  reason: z.enum(['Broken invite', 'Wrong section', 'Spam or abuse']),
  details: z.string().trim().max(500).default(''),
  website: z.string().max(0).default(''),
  token: z.string().min(1).max(400),
});
export function isAuthorizedAdmin(
  userId: string | null | undefined,
  mapping: { userId: string } | null,
) {
  return !!userId && mapping?.userId === userId;
}
