import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import { createTestDb } from '../helpers/testDb';
import { prepareCareerFormApplication } from '@/domain/ats/formFiller';

let sql: Sql;
beforeEach(async () => {
  sql = await createTestDb();
});
afterEach(() => vi.restoreAllMocks());

describe('prepareCareerFormApplication network safety', () => {
  it('does not fetch a private apply URL and still prepares the standard fields', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const out = await prepareCareerFormApplication(sql, {
      id: 'x',
      companyName: 'Evil Co',
      jobTitle: 'Developer',
      applyUrl: 'http://169.254.169.254/latest/meta-data',
    });
    expect(spy).not.toHaveBeenCalled();
    expect(out.status).toBe('ready_for_approval');
  });
});
