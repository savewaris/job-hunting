import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolCtor = vi.hoisted(() => vi.fn());
vi.mock('pg', () => ({
  Pool: class {
    constructor(config: unknown) {
      poolCtor(config);
    }
    on() {
      return this;
    }
  },
}));

import { createPgSql } from '@/lib/sql';

describe('createPgSql (mocked Pool)', () => {
  beforeEach(() => poolCtor.mockClear());

  it('does not create a Pool for an insecure or ambiguous string', () => {
    expect(() => createPgSql('postgresql://u:pw@db.example.com/postgres')).toThrow();
    expect(() => createPgSql('postgresql://u:pw@localhost/db?host=remote.example.com')).toThrow();
    expect(poolCtor).not.toHaveBeenCalled();
  });
});
