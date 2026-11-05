import { describe, it, expect } from 'vitest';
import { isLocalHost } from '@/lib/localOnly';

describe('isLocalHost', () => {
  it.each(['localhost', 'localhost:3000', 'LOCALHOST:3000', '127.0.0.1:3000', '[::1]:3000'])(
    'accepts %s',
    (host) => {
      expect(isLocalHost(host)).toBe(true);
    },
  );

  it.each([null, '', 'localhost.evil.com', 'evil.com', '192.168.1.20:3000', '127.0.0.1.evil.com'])(
    'rejects %s',
    (host) => {
      expect(isLocalHost(host)).toBe(false);
    },
  );
});
