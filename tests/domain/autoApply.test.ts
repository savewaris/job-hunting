import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import { createTestDb } from '../helpers/testDb';
import { generateTailoredResumePdf, rankProjectsForJob } from '@/domain/tailoring/resumePdf';
import { getMasterProfile } from '@/domain/profile';
import {
  addTargetCompany,
  detectCompanyAts,
  listTargetCompanies,
  removeTargetCompany,
} from '@/domain/companies/repo';
import { classifyRoleStatus } from '@/domain/companies/discover';
import {
  buildStandardFilledFields,
  inspectCareerFormHtml,
} from '@/domain/ats/formFiller';
import { prepareApplicationDraftsStep } from '@/domain/runs/steps';
import { createApplication } from '@/domain/applications/repo';
import { listOpenInbox } from '@/domain/inbox/repo';
import { getSettings } from '@/domain/settings/repo';

let sql: Sql;
beforeEach(async () => {
  sql = await createTestDb();
});

describe('Slice A: Tailored Resume PDF Generator', () => {
  it('generates a valid non-empty PDF buffer from master-profile.json', async () => {
    const buf = await generateTailoredResumePdf({
      companyName: 'Agoda',
      jobTitle: 'Full Stack Software Engineer',
      jobDescription: 'Build Next.js, TypeScript, and PostgreSQL web platforms.',
      requirements: ['TypeScript', 'Next.js', 'PostgreSQL'],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1500);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('ranks relevant projects highest for matching job requirements', () => {
    const profile = getMasterProfile();
    const ranked = rankProjectsForJob(profile, {
      jobTitle: 'AI Multi-Agent & MCP Orchestration Engineer',
      jobDescription:
        'Seeking experience with Model Context Protocol (MCP), Autonomous Issue Solver, and Gemini Vision AI.',
      requirements: ['MCP', 'Multi-Agent', 'Gemini Vision'],
    });
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].title).toContain('Agent Second Brain');
  });
});

describe('Slice B: Direct Company Career Portals & Role Classification', () => {
  it('auto-detects Greenhouse, Lever, Ashby, and direct career URLs', () => {
    expect(detectCompanyAts('https://boards.greenhouse.io/gitlab')).toEqual({
      atsType: 'greenhouse',
      atsSlug: 'gitlab',
    });
    expect(detectCompanyAts('https://jobs.lever.co/omise')).toEqual({
      atsType: 'lever',
      atsSlug: 'omise',
    });
    expect(detectCompanyAts('https://jobs.ashbyhq.com/supabase')).toEqual({
      atsType: 'ashby',
      atsSlug: 'supabase',
    });
    expect(detectCompanyAts('https://careers.agoda.com/engineering')).toEqual({
      atsType: 'direct_careers',
      atsSlug: null,
    });
  });

  it('adds, lists, and removes target company career portals', async () => {
    const initial = await listTargetCompanies(sql);
    expect(initial.length).toBeGreaterThanOrEqual(8); // seeded in 0003_target_companies.sql

    const added = await addTargetCompany(sql, {
      name: 'Linear',
      careersUrl: 'https://jobs.ashbyhq.com/linear',
      locationHint: 'Remote',
    });
    expect(added.atsType).toBe('ashby');
    expect(added.atsSlug).toBe('linear');

    const afterAdd = await listTargetCompanies(sql);
    expect(afterAdd.some((c) => c.name === 'Linear')).toBe(true);

    await removeTargetCompany(sql, added.id);
    const afterRemove = await listTargetCompanies(sql);
    expect(afterRemove.some((c) => c.id === added.id)).toBe(false);
  });

  it('classifies matching software roles into wishlist, maybe, or ignore', () => {
    expect(classifyRoleStatus('Full Stack Software Engineer', 'Bangkok, Thailand')).toBe(
      'wishlist',
    );
    expect(classifyRoleStatus('Senior Principal Software Architect', 'Remote')).toBe('maybe');
    expect(classifyRoleStatus('Enterprise Account Executive', 'Bangkok, Thailand')).toBe(
      'ignore',
    );
  });
});

describe('Slice C: ATS Career Form Inspector & Draft Preparation', () => {
  it('extracts custom screening questions while skipping standard and EEO fields', () => {
    const html = `
      <html>
        <body>
          <form>
            <label>First Name *</label>
            <label>Email *</label>
            <label>Gender Identity</label>
            <label>Why do you want to join our engineering team in Bangkok? *</label>
            <label>What is your expected monthly salary in THB?</label>
          </form>
        </body>
      </html>
    `;
    const res = inspectCareerFormHtml(html);
    expect(res.hasCaptcha).toBe(false);
    expect(res.customQuestions.map((q) => q.label)).toEqual([
      'Why do you want to join our engineering team in Bangkok?',
      'What is your expected monthly salary in THB?',
    ]);
  });

  it('flags CAPTCHA widgets immediately so automation halts', () => {
    const html = `
      <html>
        <body>
          <div class="cf-turnstile" data-sitekey="123"></div>
        </body>
      </html>
    `;
    const res = inspectCareerFormHtml(html);
    expect(res.hasCaptcha).toBe(true);
    expect(res.customQuestions).toEqual([]);
  });

  it('includes Personal Website and GitHub in standard filled fields', () => {
    const fields = buildStandardFilledFields(
      'Supabase',
      'Full Stack Engineer',
      'https://jobs.ashbyhq.com/supabase/123/application',
    );
    expect(fields['Personal Website / Portfolio']).toBe(
      'https://personal-website-full-stack.vercel.app',
    );
    expect(fields['GitHub Profile']).toBe('https://github.com/savewaris');
  });

  it('prepareApplicationDraftsStep creates approval items with cover letter & filled fields for wishlist jobs', async () => {
    await createApplication(sql, {
      companyName: 'DirectTech Co',
      jobTitle: 'Full Stack TypeScript Engineer',
      jobUrl: 'https://example.com/careers/fullstack',
      location: 'Bangkok, Thailand',
      status: 'wishlist',
      jobDescription: 'Build Next.js and PostgreSQL applications.',
      requirements: ['TypeScript', 'Next.js', 'PostgreSQL'],
      contactMethod: { type: 'form', value: 'https://example.com/careers/fullstack' },
    });

    const settings = await getSettings(sql);
    const out = await prepareApplicationDraftsStep.run({
      sql,
      resumed: [],
      settings,
      now: new Date(),
    });
    expect(out.drafted).toBe(1);

    const open = await listOpenInbox(sql);
    const approval = open.find((i) => i.companyName === 'DirectTech Co');
    expect(approval).toBeDefined();
    expect(approval?.kind).toBe('approval');
    expect(String(approval?.payload?.preview ?? '')).toContain(
      'https://personal-website-full-stack.vercel.app',
    );
    expect(String(approval?.payload?.preview ?? '')).toContain('https://github.com/savewaris');
    expect(approval?.payload?.filledFields).toBeDefined();
  });
});
