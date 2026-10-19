import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPublicAddress,
  resolveMessengerInvite,
  type ResolverServices,
} from '@/lib/resolve-invite';
const invite = 'https://www.messenger.com/j/CopiedInviteToken/?send_source=gc%3Acopy_invite';
const canonical = 'https://m.me/j/CopiedInviteToken';
function services(locations = [invite]) {
  let hop = 0;
  return {
    lookup: vi
      .fn<ResolverServices['lookup']>()
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
    redirect: vi
      .fn<ResolverServices['redirect']>()
      .mockImplementation(async () => ({ status: 302, location: locations[hop++] })),
  };
}
afterEach(() => vi.restoreAllMocks());
describe('invite expansion without fetching Messenger content', () => {
  it('normalizes direct invites without DNS or HTTP requests', async () => {
    const network = services();
    expect(await resolveMessengerInvite(invite, network)).toBe(canonical);
    expect(network.lookup).not.toHaveBeenCalled();
    expect(network.redirect).not.toHaveBeenCalled();
  });
  it('unwraps Facebook and Messenger share wrappers locally', async () => {
    const network = services();
    for (const host of ['l.facebook.com', 'lm.facebook.com', 'l.messenger.com'])
      expect(
        await resolveMessengerInvite(
          `https://${host}/l.php?u=${encodeURIComponent(invite)}&h=tracking`,
          network,
        ),
      ).toBe(canonical);
    expect(network.redirect).not.toHaveBeenCalled();
    expect(network.lookup).not.toHaveBeenCalled();
  });
  it('follows standard shorteners, relative redirects, and canonicalizes the destination', async () => {
    const network = services(['/second', 'https://another-shortener.example/final', invite]);
    expect(await resolveMessengerInvite('https://shortener.example/first', network)).toBe(
      canonical,
    );
    expect(network.redirect.mock.calls.map(([url]) => url.href)).toEqual([
      'https://shortener.example/first',
      'https://shortener.example/second',
      'https://another-shortener.example/final',
    ]);
    expect(network.lookup).toHaveBeenCalledTimes(3);
    for (const [, pinned, signal] of network.redirect.mock.calls) {
      expect(pinned).toEqual({ address: '93.184.216.34', family: 4 });
      expect(signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('upgrades legacy HTTP and schemeless short links to HTTPS', async () => {
    for (const input of ['http://short.example/a', 'short.example/a']) {
      const network = services();
      expect(await resolveMessengerInvite(input, network)).toBe(canonical);
      expect(network.redirect.mock.calls[0][0].protocol).toBe('https:');
    }
  });
  it.each([301, 302, 303, 307, 308])('accepts HTTP redirect status %s', async (status) => {
    const network = services();
    network.redirect.mockResolvedValue({ status, location: invite });
    expect(await resolveMessengerInvite('https://short.example/a', network)).toBe(canonical);
  });
  it.each([200, 201, 300, 304, 400, 403, 500])(
    'rejects terminal/nonredirect status %s, including HTML/JS landing pages',
    async (status) => {
      const network = services();
      network.redirect.mockResolvedValue({ status, location: invite });
      await expect(resolveMessengerInvite('https://short.example/a', network)).rejects.toThrow(
        'does not redirect',
      );
    },
  );
  it('rejects loops, missing destinations, and long redirect chains', async () => {
    await expect(
      resolveMessengerInvite('https://short.example/a', services(['https://short.example/a'])),
    ).rejects.toThrow('loop');
    const network = services();
    network.redirect.mockResolvedValue({ status: 302 });
    await expect(resolveMessengerInvite('https://short.example/a', network)).rejects.toThrow(
      'does not redirect',
    );
    await expect(
      resolveMessengerInvite(
        'https://short.example/0',
        services(Array.from({ length: 8 }, (_, i) => `/${i + 1}`)),
      ),
    ).rejects.toThrow('too many redirects');
  });
  it.each([
    'https://m.me/profile-name',
    'https://messenger.com/t/123456',
    'javascript:alert(1)',
    'https://user:pass@short.example/a',
    'https://short.example:444/a',
    'https://short.example/a#javascript',
    'https://short.example/' + 'a'.repeat(2048),
  ])('rejects unsafe or nongroup destinations: %s', async (destination) => {
    await expect(
      resolveMessengerInvite('https://short.example/a', services([destination])),
    ).rejects.toThrow();
  });
  it('rejects private literal hosts without making a network request', async () => {
    for (const host of [
      'localhost',
      'localhost.',
      'host.local',
      '127.1',
      '2130706433',
      '169.254.169.254',
      '[::1]',
      '[::ffff:127.0.0.1]',
    ]) {
      const network = services();
      // localhost. must be blocked before DNS too.
      network.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      await expect(resolveMessengerInvite(`https://${host}/a`, network)).rejects.toThrow(
        'public website',
      );
      expect(network.redirect).not.toHaveBeenCalled();
    }
  });
  it('rejects mixed public/private DNS answers and checks every redirect hop', async () => {
    const network = services(['https://private-target.example/a']);
    network.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    await expect(resolveMessengerInvite('https://short.example/a', network)).rejects.toThrow(
      'public website',
    );
    expect(network.redirect).toHaveBeenCalledTimes(1);
    network.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '::1', family: 6 },
    ]);
    await expect(resolveMessengerInvite('https://short.example/a', network)).rejects.toThrow(
      'public website',
    );
  });
  it('pins a public DNS answer and prefers IPv4 for serverless egress', async () => {
    const network = services();
    network.lookup.mockResolvedValue([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '1.1.1.1', family: 4 },
    ]);
    await resolveMessengerInvite('https://short.example/a', network);
    expect(network.redirect.mock.calls[0][1]).toEqual({ address: '1.1.1.1', family: 4 });
  });
  it('redacts DNS/network errors and bounds lookup time', async () => {
    const network = services();
    network.lookup.mockRejectedValue(new Error('synthetic secret server detail'));
    await expect(resolveMessengerInvite('https://short.example/a', network)).rejects.toThrow(
      'Could not expand',
    );
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    network.lookup.mockImplementation(() => new Promise(() => {}));
    const result = resolveMessengerInvite('https://short.example/a', network);
    controller.abort();
    await expect(result).rejects.toThrow('took too long');
    expect(network.redirect).not.toHaveBeenCalled();
  });
});
describe('outbound address restrictions', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '168.63.129.16',
    '172.16.0.1',
    '192.168.1.1',
    '100.100.100.200',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1',
    'not-an-address',
  ])('blocks nonpublic address %s', (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => expect(isPublicAddress(address)).toBe(true),
  );
});
