import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicPage } from '@/lib/safeFetch';

afterEach(() => vi.restoreAllMocks());

const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

describe('fetchPublicPage', () => {
  it('blocks private hosts and non-http schemes without fetching', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const url of [
      'http://127.0.0.1/x',
      'http://localhost/x',
      'http://10.0.0.5/x',
      'http://169.254.169.254/latest',
      'file:///etc/passwd',
      'ftp://example.org/x',
    ]) {
      await expect(fetchPublicPage(url)).rejects.toThrow(/blocked/i);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('blocks a redirect to a private host', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(redirect('http://169.254.169.254/latest'));
    await expect(fetchPublicPage('https://example.org/a')).rejects.toThrow(/blocked/i);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('follows a public redirect by hand and returns the final response', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(redirect('https://example.org/b'))
      .mockResolvedValueOnce(new Response('ok'));
    const res = await fetchPublicPage('https://example.org/a');
    expect(await res.text()).toBe('ok');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('gives up after too many redirects', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => redirect('https://example.org/next'));
    await expect(fetchPublicPage('https://example.org/a')).rejects.toThrow(/too many/i);
  });
});
