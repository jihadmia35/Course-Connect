import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import ipaddr from 'ipaddr.js';
import {
  isMessengerInviteHost,
  normalizeMessengerUrl,
  submittedInviteUrl,
  INVITE_URL_LIMIT,
} from './invite-url';

export class InviteResolutionError extends Error {}
export type RedirectHeaders = { status: number; location?: string };
export type ResolverServices = {
  lookup: (hostname: string) => Promise<LookupAddress[]>;
  redirect: (url: URL, address: LookupAddress, signal: AbortSignal) => Promise<RedirectHeaders>;
};
export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast' && parsed.toString() !== '168.63.129.16';
  } catch {
    return false;
  }
}
function fail(message: string): never {
  throw new InviteResolutionError(message);
}
function withinDeadline<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(
        new InviteResolutionError(
          'The short link took too long. Paste the original Messenger invite instead.',
        ),
      );
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    operation()
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
/** GET headers only. DNS is pinned to a validated public address on each hop. */
export function requestRedirect(
  url: URL,
  address: LookupAddress,
  signal: AbortSignal,
): Promise<RedirectHeaders> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        rejectUnauthorized: true,
        headers: { 'User-Agent': 'SEU-Course-Connect-Link-Resolver/1.0', Accept: 'text/html' },
        lookup: (_hostname, options, callback) => {
          if (typeof options === 'object' && options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
        maxHeaderSize: 16384,
      },
      (response) => {
        resolve({ status: response.statusCode ?? 0, location: response.headers.location });
        // Never download, parse, or execute the destination page.
        response.destroy();
      },
    );
    request.on('error', reject);
    request.end();
  });
}
const defaults: ResolverServices = {
  lookup: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  redirect: requestRedirect,
};
const wrappers = new Set(['l.facebook.com', 'lm.facebook.com', 'l.messenger.com']);
export async function resolveMessengerInvite(
  input: string,
  services: ResolverServices = defaults,
): Promise<string> {
  const signal = AbortSignal.timeout(8000);
  const visited = new Set<string>();
  let next = input;
  try {
    for (let hop = 0; hop < 6; hop++) {
      const url = submittedInviteUrl(next);
      if (isMessengerInviteHost(url.hostname)) return normalizeMessengerUrl(url.href);
      if (visited.has(url.href))
        fail('This short link redirects in a loop. Paste the original Messenger invite.');
      visited.add(url.href);
      if (wrappers.has(url.hostname) && url.pathname === '/l.php') {
        const targets = url.searchParams.getAll('u');
        if (targets.length !== 1 || !targets[0])
          fail('This shared link has no valid invite destination.');
        next = targets[0];
        continue;
      }
      const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
      if (hostname === 'localhost' || /\.(localhost|local|internal|home\.arpa)$/.test(hostname))
        fail('Short links must point to a public website.');
      const family = isIP(hostname);
      const addresses = family
        ? [{ address: hostname, family }]
        : await withinDeadline(() => services.lookup(hostname), signal);
      if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address)))
        fail('Short links must point to a public website.');
      // Prefer IPv4 for serverless egress, while rejecting any private DNS answer.
      const address = addresses.find((a) => a.family === 4) ?? addresses[0];
      const response = await withinDeadline(() => services.redirect(url, address, signal), signal);
      if (![301, 302, 303, 307, 308].includes(response.status) || !response.location)
        fail(
          'This link does not redirect to a supported Messenger invite. Paste the invite copied from the group.',
        );
      if (response.location.length > INVITE_URL_LIMIT)
        fail('The shortened invite destination is too long.');
      next = new URL(response.location, url).href;
    }
    fail('This link has too many redirects. Paste the original Messenger invite.');
  } catch (error) {
    if (error instanceof InviteResolutionError) throw error;
    if (isMessengerInviteHost(submittedHost(next)))
      throw new InviteResolutionError(
        error instanceof Error ? error.message : 'Invalid Messenger invite.',
      );
    fail('Could not expand this short link safely. Paste the original Messenger invite instead.');
  }
}
function submittedHost(value: string) {
  try {
    return submittedInviteUrl(value).hostname;
  } catch {
    return '';
  }
}
