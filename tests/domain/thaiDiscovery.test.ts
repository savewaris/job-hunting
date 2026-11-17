import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import { createTestDb } from '../helpers/testDb';
import { addTargetCompany } from '@/domain/companies/repo';
import {
  classifyRoleStatus,
  discoverFromCompanyCareers,
  locationTier,
  saveDiscoveredRole,
  type DiscoveredRole,
} from '@/domain/companies/discover';

let sql: Sql;
beforeEach(async () => {
  sql = await createTestDb();
});

describe('Thai-aware role classification', () => {
  it('matches a Thai title mixed with Latin text in a Thai location', () => {
    expect(classifyRoleStatus('นักพัฒนาซอฟต์แวร์ Full Stack', 'กรุงเทพมหานคร')).toBe('wishlist');
  });

  it('flags Thai seniority words as maybe', () => {
    expect(classifyRoleStatus('วิศวกรซอฟต์แวร์อาวุโส', 'กรุงเทพ')).toBe('maybe');
  });

  it('ignores non-engineering Thai titles', () => {
    expect(classifyRoleStatus('พนักงานขาย', 'กรุงเทพ')).toBe('ignore');
  });

  it('still ignores a non-Bangkok Thai city', () => {
    expect(classifyRoleStatus('Developer', 'เชียงใหม่')).toBe('ignore');
  });

  it('accepts the Thai word for Thailand as a location', () => {
    expect(classifyRoleStatus('Developer', 'ประเทศไทย')).toBe('wishlist');
  });
});

describe('Bangkok-first discovery', () => {
  it('locationTier is 0 for Bangkok/Thailand locations and 1 otherwise', () => {
    expect(locationTier('Bangkok, Thailand')).toBe(0);
    expect(locationTier('กรุงเทพมหานคร')).toBe(0);
    expect(locationTier('Remote (Worldwide)')).toBe(1);
  });

  it('a Bangkok role wins the quota over remote roles from a company that sorts first', async () => {
    await sql.query('DELETE FROM target_companies');
    const job = (id: number, title: string, loc: string, slug: string) => ({
      id,
      title,
      absolute_url: `https://boards.greenhouse.io/${slug}/jobs/${id}`,
      location: { name: loc },
      content: '',
    });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const jobs = url.includes('/aardvark/')
        ? [job(1, 'Full Stack Engineer', 'Remote', 'aardvark'), job(2, 'Backend Engineer', 'Remote', 'aardvark')]
        : [job(3, 'Full Stack Developer', 'Bangkok, Thailand', 'bangkokco')];
      return new Response(JSON.stringify({ jobs }));
    });
    await addTargetCompany(sql, { name: 'Aardvark Remote', careersUrl: 'https://boards.greenhouse.io/aardvark' });
    await addTargetCompany(sql, { name: 'Bangkok Co', careersUrl: 'https://boards.greenhouse.io/bangkokco' });
    const summary = await discoverFromCompanyCareers(sql, 1);
    spy.mockRestore();
    expect(summary.discovered).toBe(1);
    const rows = await sql.query<{ company_name: string }>('SELECT company_name FROM job_applications');
    expect(rows.rows.map((r) => r.company_name)).toEqual(['Bangkok Co']);
  });

  it('saveDiscoveredRole reports created then duplicate for the same role', async () => {
    const role: DiscoveredRole = {
      companyName: 'Dup Co',
      jobTitle: 'Full Stack Engineer',
      jobUrl: 'https://example.com/jobs/1',
      location: 'Bangkok',
      source: 'direct_careers',
      externalId: 'dup-1',
      jobDescription: 'desc',
      requirements: [],
      contactMethod: { type: 'form', value: 'https://example.com/jobs/1' },
    };
    expect(await saveDiscoveredRole(sql, role, 'wishlist')).toBe('created');
    expect(await saveDiscoveredRole(sql, { ...role, externalId: 'dup-2' }, 'wishlist')).toBe('duplicate');
  });
});
