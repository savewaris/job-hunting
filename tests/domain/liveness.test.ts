import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPostingLive } from '@/lib/liveness';

afterEach(() => vi.restoreAllMocks());
const page = (body: string, status = 200) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }));

describe('isPostingLive', () => {
  it('false on 404/410 and on a "no longer available" page', async () => {
    page('', 404);
    expect(await isPostingLive('https://jobs.example.com/1')).toBe(false);
    page('Sorry, this position has been filled.');
    expect(await isPostingLive('https://jobs.example.com/2')).toBe(false);
  });
  it('true for a normal page, a 500, a network error, and private hosts (never fetched)', async () => {
    page('Apply now for Senior Engineer');
    expect(await isPostingLive('https://jobs.example.com/3')).toBe(true);
    page('', 500);
    expect(await isPostingLive('https://jobs.example.com/4')).toBe(true);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await isPostingLive('https://jobs.example.com/5')).toBe(true);
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockClear();
    expect(await isPostingLive('http://127.0.0.1:3000/x')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('never follows a redirect into a private host, and follows a normal one to a 404', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:3000/admin' } }));
    expect(await isPostingLive('https://jobs.example.com/6')).toBe(true);
    expect(f).toHaveBeenCalledTimes(1); // the loopback hop was not fetched

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/gone' } }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await isPostingLive('https://jobs.example.com/7')).toBe(false);
  });
});
