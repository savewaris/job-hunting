import * as cheerio from 'cheerio';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Sql } from '@/lib/sql';
import { getCandidateContact, getMasterProfile } from '@/domain/profile';
import { askOrRecall } from '@/domain/answers/repo';
import { generateTailoredResumePdf } from '@/domain/tailoring/resumePdf';

export interface FormFillOutcome {
  status: 'ready_for_approval' | 'needs_questions' | 'captcha_blocked' | 'unreachable';
  filledFields: Record<string, string>;
  pendingQuestions: string[];
  errorDetail?: string;
}

const CAPTCHA_RE =
  /\b(g-recaptcha|h-captcha|cf-turnstile|captcha|verify you are human|cloudflare turnstile)\b/i;

const STANDARD_FIELD_RE =
  /\b(first\s*name|last\s*name|full\s*name|your\s*name|email|e-mail|phone|mobile|tel|resume|cv|cover\s*letter|linkedin|github|website|portfolio|personal\s*site|location|city|address|pronouns|current\s*company)\b/i;

const EEO_SKIP_RE =
  /\b(gender|race|ethnicity|veteran|hispanic|latino|disability|sexual\s*orientation|demographic)\b/i;

export interface DiscoveredFormQuestion {
  label: string;
  required: boolean;
}

/**
 * Extracts custom screening questions from a company career page / ATS HTML
 * document while detecting CAPTCHA gates before any automation occurs.
 */
export function inspectCareerFormHtml(html: string): {
  hasCaptcha: boolean;
  customQuestions: DiscoveredFormQuestion[];
} {
  const $ = cheerio.load(html || '');

  // Check for CAPTCHA widgets or scripts
  const hasCaptchaWidget =
    $('.g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"]').length > 0 ||
    CAPTCHA_RE.test($('body').attr('class') ?? '');

  if (hasCaptchaWidget) {
    return { hasCaptcha: true, customQuestions: [] };
  }

  const customQuestions: DiscoveredFormQuestion[] = [];
  const seen = new Set<string>();

  $('label, .application-question .label, [data-qa="additional-cards"] label').each((_i, el) => {
    const raw = $(el)
      .text()
      .replace(/\s+/g, ' ')
      .replace(/\*\s*$/, '')
      .trim();
    if (!raw || raw.length < 4 || raw.length > 220) return;
    if (STANDARD_FIELD_RE.test(raw) || EEO_SKIP_RE.test(raw)) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const required = $(el).text().includes('*') || $(el).find('[required]').length > 0;
    customQuestions.push({ label: raw, required });
  });

  return { hasCaptcha: false, customQuestions: customQuestions.slice(0, 8) };
}

/**
 * Builds the canonical map of standard candidate fields from `master-profile.json`
 * (including Personal Website and GitHub links) plus any recalled screening answers.
 */
export function buildStandardFilledFields(
  companyName: string,
  jobTitle: string,
  applyUrl: string,
  answeredQuestions: Record<string, string> = {},
): Record<string, string> {
  const profile = getMasterProfile();
  const contact = getCandidateContact();
  const [firstName, ...rest] = contact.fullName.split(' ');
  const lastName = rest.join(' ') || contact.preferredName;

  return {
    'Target Application URL': applyUrl,
    'First Name': firstName,
    'Last Name': lastName,
    'Full Name': `${contact.fullName} (${contact.preferredName})`,
    Email: contact.email,
    Phone: contact.phone,
    Location: contact.location,
    'Personal Website / Portfolio': contact.website,
    'GitHub Profile': contact.github,
    'LinkedIn Profile': contact.linkedin || 'https://www.linkedin.com/in/waris-khamkaweepart/',
    Education: `${profile.education[0]?.degree ?? 'B.Sc.'} in ${profile.education[0]?.fieldOfStudy ?? 'Database & Intelligence Systems'} — ${profile.education[0]?.institution ?? 'Mahidol University'}`,
    'Resume PDF Attachment': `Waris_Khamkaweepart_Resume_${companyName.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`,
    'Role Applied For': `${jobTitle} at ${companyName}`,
    ...answeredQuestions,
  };
}

/**
 * Inspects a company's career form URL, resolves custom screening questions
 * against the Answer Bank (`askOrRecall`), and returns either:
 * - `needs_questions` (when unknown questions were parked in the Inbox),
 * - `captcha_blocked` (when a CAPTCHA gate was detected), or
 * - `ready_for_approval` (with all filled fields ready for user review).
 */
export async function prepareCareerFormApplication(
  sql: Sql,
  job: {
    id: string;
    companyName: string;
    jobTitle: string;
    applyUrl: string;
  },
): Promise<FormFillOutcome> {
  const answeredQuestions: Record<string, string> = {};
  const pendingQuestions: string[] = [];

  if (
    job.applyUrl &&
    /^https?:\/\//i.test(job.applyUrl) &&
    !job.applyUrl.includes('example.com/')
  ) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(job.applyUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CareerPulse-Local-Agent/1.0' },
      });
      clearTimeout(timer);

      if (res.ok) {
        const html = await res.text();
        const inspected = inspectCareerFormHtml(html);
        if (inspected.hasCaptcha) {
          return {
            status: 'captcha_blocked',
            filledFields: {},
            pendingQuestions: [],
            errorDetail: `CAPTCHA or anti-bot gate detected on ${job.companyName}'s application page (${job.applyUrl}). Stopped automatically per safety policy.`,
          };
        }

        for (const q of inspected.customQuestions) {
          const recall = await askOrRecall(sql, {
            jobApplicationId: job.id,
            questionText: q.label,
          });
          if (recall.kind === 'answered') {
            answeredQuestions[`Screening: ${q.label}`] = recall.answer;
          } else {
            pendingQuestions.push(q.label);
          }
        }
      }
    } catch {
      // If offline or page requires client hydration, continue with standard profile fields
    }
  }

  if (pendingQuestions.length > 0) {
    return {
      status: 'needs_questions',
      filledFields: buildStandardFilledFields(
        job.companyName,
        job.jobTitle,
        job.applyUrl,
        answeredQuestions,
      ),
      pendingQuestions,
    };
  }

  return {
    status: 'ready_for_approval',
    filledFields: buildStandardFilledFields(
      job.companyName,
      job.jobTitle,
      job.applyUrl,
      answeredQuestions,
    ),
    pendingQuestions: [],
  };
}

/**
 * Launches a visible or headless Playwright Chromium browser to pre-fill a
 * company's career form (Greenhouse, Lever, Ashby, or direct form) with the
 * candidate's approved Master Profile data, Personal Website, GitHub, and
 * generated PDF resume. Never bypasses CAPTCHAs.
 */
export async function launchPlaywrightFormFill(opts: {
  applyUrl: string;
  companyName: string;
  jobTitle: string;
  coverLetter: string;
  filledFields: Record<string, string>;
  autoSubmit?: boolean;
}): Promise<{ filledCount: number; submitted: boolean; stoppedReason?: string }> {
  // Dynamically load playwright at runtime so builds succeed even if Playwright is installed globally or optionally
  const pwModuleName = 'playwright';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pw: any = await import(/* webpackIgnore: true */ pwModuleName).catch(() => null);
  if (!pw?.chromium) {
    throw new Error(
      'Playwright is not installed in node_modules. Run `npx playwright install chromium` or open the company career form link directly.',
    );
  }
  const { chromium } = pw;
  const contact = getCandidateContact();
  const [firstName, ...rest] = contact.fullName.split(' ');
  const lastName = rest.join(' ') || contact.preferredName;

  const pdfBuffer = await generateTailoredResumePdf({
    companyName: opts.companyName,
    jobTitle: opts.jobTitle,
  });
  const tmpPdfPath = path.join(
    os.tmpdir(),
    `Waris_Khamkaweepart_Resume_${Date.now()}.pdf`,
  );
  fs.writeFileSync(tmpPdfPath, pdfBuffer);

  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    await page.goto(opts.applyUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const html = await page.content();
    if (inspectCareerFormHtml(html).hasCaptcha) {
      return {
        filledCount: 0,
        submitted: false,
        stoppedReason: 'CAPTCHA detected on page; stopped immediately per safety rules.',
      };
    }

    let filledCount = 0;
    const tryFill = async (selectorOrLabel: string, value: string, byLabel = false) => {
      if (!value) return;
      try {
        const loc = byLabel
          ? page.getByLabel(new RegExp(selectorOrLabel, 'i')).first()
          : page.locator(selectorOrLabel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible())) {
          await loc.fill(value);
          filledCount += 1;
        }
      } catch {
        // Ignore non-matching optional locators
      }
    };

    // Standard Greenhouse / Lever / Ashby selectors & accessible labels
    await tryFill('#first_name, input[name="first_name"]', firstName);
    await tryFill('#last_name, input[name="last_name"]', lastName);
    await tryFill('input[name="name"]', contact.fullName);
    await tryFill('First Name', firstName, true);
    await tryFill('Last Name', lastName, true);
    await tryFill('Full Name', contact.fullName, true);
    await tryFill('#email, input[type="email"], input[name="email"]', contact.email);
    await tryFill('#phone, input[type="tel"], input[name="phone"]', contact.phone);
    await tryFill('GitHub', contact.github, true);
    await tryFill('Website|Portfolio', contact.website, true);
    await tryFill('LinkedIn', contact.linkedin, true);
    await tryFill('input[name*="github" i], input[placeholder*="github" i]', contact.github);
    await tryFill(
      'input[name*="website" i], input[name*="portfolio" i], input[name*="urls[Portfolio]" i]',
      contact.website,
    );
    await tryFill(
      'input[name*="linkedin" i], input[name*="urls[LinkedIn]" i]',
      contact.linkedin,
    );
    await tryFill(
      'textarea[name*="comments" i], textarea[name*="cover_letter" i], #cover_letter_text',
      opts.coverLetter,
    );

    // Upload tailored PDF resume to the first file input
    try {
      const fileInput = page.locator('input[type="file"]').first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(tmpPdfPath);
        filledCount += 1;
      }
    } catch {
      // Ignore if file input requires custom interaction
    }

    // Fill any recalled screening answers
    for (const [key, val] of Object.entries(opts.filledFields)) {
      if (key.startsWith('Screening: ')) {
        const label = key.replace(/^Screening:\s*/, '');
        await tryFill(label, val, true);
      }
    }

    return {
      filledCount,
      submitted: false,
      stoppedReason:
        'Pre-filled in browser and paused before final Submit button so you can verify.',
    };
  } finally {
    try {
      fs.unlinkSync(tmpPdfPath);
    } catch {
      // Ignore temp cleanup error
    }
  }
}
