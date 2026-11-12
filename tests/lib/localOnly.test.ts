import { describe, it, expect } from 'vitest';
import { isLocalHost, isCrossSiteBlocked } from '@/lib/localOnly';

describe('isLocalHost', () => {
  it.each([
    'localhost',
    'localhost:3000',
    'LOCALHOST:3000',
    '127.0.0.1:3000',
    '[::1]',
    '[::1]:3000',
  ])('accepts %s', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    null,
    '',
    '::1',
    '[localhost]:3000',
    '[127.0.0.1]:3000',
    '0.0.0.0',
    '127.0.0.2',
    'localhost.',
    '[::1]evil',
    '[::1]:abc',
    'localhost.evil.com',
    'evil.com',
    '192.168.1.20:3000',
    '127.0.0.1.evil.com',
  ])('rejects %s', (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});

type Input = Parameters<typeof isCrossSiteBlocked>[0];
const req = (method: string, over: Partial<Input> = {}): Input => ({
  method,
  origin: null,
  secFetchSite: null,
  secFetchMode: null,
  ...over,
});

describe('isCrossSiteBlocked', () => {
  it('blocks POST with a foreign Origin', () => {
    expect(isCrossSiteBlocked(req('POST', { origin: 'https://evil.example' }))).toBe(true);
  });
  it('allows POST with a local Origin', () => {
    expect(isCrossSiteBlocked(req('POST', { origin: 'http://localhost:3000' }))).toBe(false);
    expect(isCrossSiteBlocked(req('POST', { origin: 'http://[::1]:3000' }))).toBe(false);
  });
  it('blocks POST with Sec-Fetch-Site cross-site', () => {
    expect(isCrossSiteBlocked(req('POST', { secFetchSite: 'cross-site' }))).toBe(true);
  });
  it('blocks POST with Sec-Fetch-Site same-site', () => {
    expect(isCrossSiteBlocked(req('POST', { secFetchSite: 'same-site' }))).toBe(true);
  });
  it('allows POST with Sec-Fetch-Site same-origin or none', () => {
    expect(isCrossSiteBlocked(req('POST', { secFetchSite: 'same-origin' }))).toBe(false);
    expect(isCrossSiteBlocked(req('POST', { secFetchSite: 'none' }))).toBe(false);
  });
  it('blocks POST with neither header', () => {
    expect(isCrossSiteBlocked(req('POST'))).toBe(true);
  });
  it('allows GET without any headers', () => {
    expect(isCrossSiteBlocked(req('GET'))).toBe(false);
    expect(isCrossSiteBlocked(req('HEAD'))).toBe(false);
  });
  it('allows cross-site GET navigations', () => {
    expect(
      isCrossSiteBlocked(req('GET', { secFetchSite: 'cross-site', secFetchMode: 'navigate' })),
    ).toBe(false);
    expect(
      isCrossSiteBlocked(req('HEAD', { secFetchSite: 'same-site', secFetchMode: 'navigate' })),
    ).toBe(false);
  });
  it('blocks cross-site GET that is not a navigation', () => {
    expect(
      isCrossSiteBlocked(req('GET', { secFetchSite: 'cross-site', secFetchMode: 'no-cors' })),
    ).toBe(true);
    expect(isCrossSiteBlocked(req('GET', { secFetchSite: 'cross-site' }))).toBe(true);
  });
  it('blocks a cross-site navigation that uses a non-safe method', () => {
    expect(
      isCrossSiteBlocked(req('POST', { secFetchSite: 'cross-site', secFetchMode: 'navigate' })),
    ).toBe(true);
  });
  it('blocks GET with Origin "null" or an unparseable Origin', () => {
    expect(isCrossSiteBlocked(req('GET', { origin: 'null' }))).toBe(true);
    expect(isCrossSiteBlocked(req('GET', { origin: 'not a url' }))).toBe(true);
    expect(isCrossSiteBlocked(req('POST', { origin: 'null' }))).toBe(true);
  });
  it('blocks GET with a foreign Origin', () => {
    expect(isCrossSiteBlocked(req('GET', { origin: 'https://evil.example' }))).toBe(true);
  });
  it('blocks Origin hosts that merely look local', () => {
    expect(isCrossSiteBlocked(req('POST', { origin: 'http://localhost.evil.com' }))).toBe(true);
    expect(isCrossSiteBlocked(req('POST', { origin: 'http://127.0.0.1.evil.com:3000' }))).toBe(true);
  });
  it.each(['PATCH', 'DELETE', 'PUT'])('%s follows the POST rules', (method) => {
    expect(isCrossSiteBlocked(req(method))).toBe(true);
    expect(isCrossSiteBlocked(req(method, { origin: 'https://evil.example' }))).toBe(true);
    expect(isCrossSiteBlocked(req(method, { secFetchSite: 'cross-site' }))).toBe(true);
    expect(isCrossSiteBlocked(req(method, { origin: 'http://localhost:3000' }))).toBe(false);
    expect(isCrossSiteBlocked(req(method, { secFetchSite: 'same-origin' }))).toBe(false);
  });
  it('blocks OPTIONS cross-site and without proof of origin', () => {
    expect(isCrossSiteBlocked(req('OPTIONS', { secFetchSite: 'cross-site' }))).toBe(true);
    expect(isCrossSiteBlocked(req('OPTIONS'))).toBe(true);
    expect(isCrossSiteBlocked(req('OPTIONS', { secFetchSite: 'same-origin' }))).toBe(false);
  });
  it('is case-insensitive about the method', () => {
    expect(isCrossSiteBlocked(req('post'))).toBe(true);
    expect(isCrossSiteBlocked(req('get'))).toBe(false);
  });
});
