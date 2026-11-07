import type { Sql } from '@/lib/sql';
import {
  createInboxItem,
  listAnsweredUnresumed,
  markResumed,
  type InboxItem,
} from '@/domain/inbox/repo';
import type { Settings } from '@/domain/settings/repo';
import { discoverFromCompanyCareers } from '@/domain/companies/discover';
import { generateMasterProfileCoverLetter } from '@/domain/tailoring/coverLetter';
import { prepareCareerFormApplication } from '@/domain/ats/formFiller';

export interface RunContext {
  sql: Sql;
  resumed: InboxItem[];
  settings: Settings;
  now: Date;
}

export interface RunStep {
  name: string;
  /** Returns the fields to record under `summary.steps[name]`. */
  run(ctx: RunContext): Promise<Record<string, unknown>>;
}

/** Picks up inbox items the user has answered since the last run. */
export const resumeAnsweredInbox: RunStep = {
  name: 'resumeAnsweredInbox',
  async run(ctx) {
    const items = await listAnsweredUnresumed(ctx.sql);
    ctx.resumed = items;
    await markResumed(
      ctx.sql,
      items.map((i) => i.id),
    );
    return { resumed: items.length };
  },
};

/**
 * Scans enabled company career pages (Greenhouse, Lever, Ashby, and direct
 * company career URLs) and creates matching `wishlist` / `maybe` applications.
 */
export const discoverCompanyCareersStep: RunStep = {
  name: 'discoverCompanyCareers',
  async run(ctx) {
    return discoverFromCompanyCareers(ctx.sql, ctx.settings.maxDailyDrafts);
  },
};

/**
 * Prepares tailored cover letters, resume PDF metadata, and career-form field
 * mappings for `wishlist` applications that have not yet been queued in the Inbox,
 * up to `ctx.settings.maxDailyDrafts`.
 */
export const prepareApplicationDraftsStep: RunStep = {
  name: 'prepareApplicationDrafts',
  async run(ctx) {
    const limit = Math.max(1, Math.min(ctx.settings.maxDailyDrafts, 50));
    const candidates = await ctx.sql.query<{
      id: string;
      company_name: string;
      job_title: string;
      job_url: string | null;
      location: string | null;
      job_description: string | null;
      requirements: string[] | null;
      contact_method: { type?: string; value?: string } | string | null;
    }>(
      `SELECT a.id, a.company_name, a.job_title, a.job_url, a.location,
              a.job_description, a.requirements, a.contact_method
       FROM job_applications a
       WHERE a.status = 'wishlist'
         AND NOT EXISTS (
           SELECT 1 FROM inbox_items i
           WHERE i.job_application_id = a.id
             AND (i.status = 'open' OR i.kind = 'approval')
         )
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit],
    );

    let drafted = 0;
    let parkedQuestions = 0;
    let captchaStopped = 0;

    for (const job of candidates.rows) {
      const contactMethod =
        typeof job.contact_method === 'string'
          ? (JSON.parse(job.contact_method) as { type?: string; value?: string })
          : job.contact_method;
      const isEmail = contactMethod?.type === 'email' && Boolean(contactMethod.value);
      const applyUrl = contactMethod?.value || job.job_url || '';

      if (!isEmail && applyUrl) {
        const formOutcome = await prepareCareerFormApplication(ctx.sql, {
          id: job.id,
          companyName: job.company_name,
          jobTitle: job.job_title,
          applyUrl,
        });

        if (formOutcome.status === 'captcha_blocked') {
          await createInboxItem(ctx.sql, {
            jobApplicationId: job.id,
            kind: 'error',
            prompt: `CAPTCHA detected on ${job.company_name} career form`,
            payload: {
              detail: formOutcome.errorDetail,
              applyUrl,
            },
          });
          captchaStopped += 1;
          continue;
        }

        if (formOutcome.status === 'needs_questions') {
          parkedQuestions += formOutcome.pendingQuestions.length;
          continue;
        }

        const coverLetter = await generateMasterProfileCoverLetter({
          companyName: job.company_name,
          jobTitle: job.job_title,
          jobDescription: job.job_description,
          requirements: job.requirements,
          location: job.location,
        });

        await createInboxItem(ctx.sql, {
          jobApplicationId: job.id,
          kind: 'approval',
          prompt: `Approve career-page application & cover letter for ${job.company_name} (${job.job_title})?`,
          payload: {
            channel: 'career_form',
            applyUrl,
            preview: coverLetter.letter,
            filledFields: formOutcome.filledFields,
            usedAi: coverLetter.usedAi,
            embeddedLinks: coverLetter.embeddedLinks,
          },
        });
        drafted += 1;
        continue;
      }

      const coverLetter = await generateMasterProfileCoverLetter({
        companyName: job.company_name,
        jobTitle: job.job_title,
        jobDescription: job.job_description,
        requirements: job.requirements,
        location: job.location,
      });

      await createInboxItem(ctx.sql, {
        jobApplicationId: job.id,
        kind: 'approval',
        prompt: isEmail
          ? `Approve email application (${contactMethod?.value}) & cover letter for ${job.company_name}?`
          : `Approve tailored cover letter & resume for ${job.company_name}?`,
        payload: {
          channel: isEmail ? 'email' : 'career_form',
          recipientEmail: isEmail ? contactMethod?.value : undefined,
          applyUrl: applyUrl || undefined,
          preview: coverLetter.letter,
          usedAi: coverLetter.usedAi,
          embeddedLinks: coverLetter.embeddedLinks,
        },
      });
      drafted += 1;
    }

    return { drafted, parkedQuestions, captchaStopped };
  },
};

/** Steps executed in order by startRun. Later plans append to this list. */
export const runSteps: RunStep[] = [resumeAnsweredInbox];

/** Full pipeline executed when the user triggers a full auto-apply run. */
export const fullPipelineSteps: RunStep[] = [
  resumeAnsweredInbox,
  discoverCompanyCareersStep,
  prepareApplicationDraftsStep,
];
