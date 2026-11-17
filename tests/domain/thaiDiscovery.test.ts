import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/sql';
import { createTestDb } from '../helpers/testDb';
import { addTargetCompany, type TargetCompany } from '@/domain/companies/repo';
import {
  classifyRoleStatus,
  discoverFromCompanyCareers,
  locationTier,
  parseDirectCareerHtml,
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

describe('direct career card parsing', () => {
  const company: TargetCompany = {
    id: 'x',
    name: 'Card Co',
    careersUrl: 'https://example.com/careers',
    atsType: 'direct_careers',
    atsSlug: null,
    locationHint: 'Bangkok, Thailand',
    enabled: true,
    lastCheckedAt: null,
    lastFoundCount: 0,
    lastError: null,
    createdAt: '',
  };

  it('takes the card title only, and the Bangkok tag as location', () => {
    const html = `<a href="/development/1726-software-engineer-full-stack-vuejs"><div><span title="x">Senior Software Engineer, Fullstack (Vue.js, Python)</span><div><div>Top Priority</div></div><div>LINE MAN</div><div>Bangkok</div><div>Permanent</div></div></a>`;
    const [role] = parseDirectCareerHtml(html, company);
    expect(role.jobTitle).toBe('Senior Software Engineer, Fullstack (Vue.js, Python)');
    expect(role.location).toBe('Bangkok');
  });

  it('drops a card whose tags name no allowed location (Korea-based role)', () => {
    const html = `<a href="/development/1618-software-engineer-backend-java-lp"><div><span>Senior Software Engineer, Backend (Java) - Korea Based</span><div>LINE Pay</div><div>Pangyo</div><div>Permanent</div></div></a>`;
    expect(parseDirectCareerHtml(html, company)).toEqual([]);
  });

  it('handles an empty overlay link plus a titled card for the same job (one result)', () => {
    const html = `<a class="box-container-link" href="/en/jobs/position/backend-engineer"></a>
      <a class="box-container-link" href="/en/jobs/position/backend-engineer"><div class="box__title">Backend Engineer - Building Affordable Solutions for Thai SMEs</div><div><span>Bangkok</span><span>Full-Time</span><span>Product Team</span></div></a>`;
    const roles = parseDirectCareerHtml(html, { ...company, careersUrl: 'https://example.com/en/jobs' });
    expect(roles).toHaveLength(1);
    expect(roles[0].jobTitle).toBe('Backend Engineer - Building Affordable Solutions for Thai SMEs');
    expect(roles[0].location).toBe('Bangkok');
  });

  it('keeps the company location hint when the link holds only a title', () => {
    const html = `<a href="/jobs/123-full-stack-developer">Full Stack Developer</a>`;
    const [role] = parseDirectCareerHtml(html, company);
    expect(role.jobTitle).toBe('Full Stack Developer');
    expect(role.location).toBe('Bangkok, Thailand');
  });
});
