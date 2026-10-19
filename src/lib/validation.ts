import { z } from 'zod';
import {
  INVITE_URL_LIMIT,
  isMessengerInviteHost,
  normalizeMessengerUrl,
  submittedInviteUrl,
} from './invite-url';
export { normalizeMessengerUrl } from './invite-url';
export const messengerUrl = z
  .string()
  .max(INVITE_URL_LIMIT)
  .transform((value, ctx) => {
    try {
      return normalizeMessengerUrl(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
      return z.NEVER;
    }
  });
const submissionUrl = z
  .string()
  .max(INVITE_URL_LIMIT)
  .transform((value, ctx) => {
    try {
      const url = submittedInviteUrl(value);
      return isMessengerInviteHost(url.hostname) ? normalizeMessengerUrl(url.href) : url.href;
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
      return z.NEVER;
    }
  });
export const groupInput = z.object({
  semesterId: z.string().min(1).max(100),
  courseId: z.string().min(1).max(100),
  sectionId: z.string().min(1).max(100),
  url: submissionUrl,
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
