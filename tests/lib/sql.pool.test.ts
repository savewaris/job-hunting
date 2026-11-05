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

describe('createPgSql', () => {
  beforeEach(() => poolCtor.mockClear());

  it('builds the Pool from the validated config, never the raw connection string', () => {
    createPgSql('postgresql://u:pw@db.example.supabase.com:6543/postgres?sslmode=require');
    expect(poolCtor).toHaveBeenCalledTimes(1);
    const cfg = poolCtor.mock.calls[0][0] as Record<string, unknown>;
    expect(cfg).not.toHaveProperty('connectionString');
    expect(cfg.host).toBe('db.example.supabase.com');
    expect(cfg.ssl).toBeTruthy();
    expect((cfg.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(false);
  });

  it('does not create a Pool for an insecure or ambiguous string', () => {
    expect(() => createPgSql('postgresql://u:pw@db.example.com/postgres')).toThrow();
    expect(() => createPgSql('postgresql://u:pw@localhost/db?host=remote.example.com')).toThrow();
    expect(poolCtor).not.toHaveBeenCalled();
  });
});
