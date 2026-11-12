import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { slugCandidates, probeCompanyBoard, registerCompaniesByName } from '@/domain/companies/probe';
import { createTestDb } from '../helpers/testDb';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe('slugCandidates', () => {
  it('derives joined, hyphenated and first-word slugs', () => {
    expect(slugCandidates('Acme Co.')).toEqual(['acmeco', 'acme-co', 'acme']);
    expect(slugCandidates('A')).toEqual([]);
  });
});

describe('probeCompanyBoard', () => {
  it('finds a Lever board and counts its jobs; other ATSs 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('api.lever.co/v0/postings/acme') ? json([{ id: 1 }, { id: 2 }]) : json({}, 404),
    );
    expect(await probeCompanyBoard('Acme')).toMatchObject({
      atsType: 'lever',
      atsSlug: 'acme',
      careersUrl: 'https://jobs.lever.co/acme',
      jobCount: 2,
    });
  });

  it('returns null when no ATS has the company, and survives network errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await probeCompanyBoard('Nowhere Ltd')).toBeNull();
  });
});

describe('registerCompaniesByName', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('registers found boards (idempotently) and reports the rest', async () => {
    const sql = await createTestDb();
    await sql.query('DELETE FROM target_companies');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('boards-api.greenhouse.io/v1/boards/stripe/') ? json({ jobs: [{ id: 1 }] }) : json({}, 404),
    );
    const first = await registerCompaniesByName(sql, ['Stripe', 'Stripe', 'Ghost Co']);
    expect(first.checked).toBe(2);
    expect(first.added.map((c) => c.name)).toEqual(['Stripe']);
    expect(first.notFound).toEqual(['Ghost Co']);
    await registerCompaniesByName(sql, ['Stripe']);
    const rows = await sql.query('SELECT 1 FROM target_companies');
    expect(rows.rows).toHaveLength(1);
  });
});
