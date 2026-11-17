import * as cheerio from 'cheerio';
import type { Sql } from '@/lib/sql';
import { ConflictError } from '@/lib/errors';
import { renderPage } from '@/lib/renderPage';
import { createApplication, type ApplicationStatus } from '@/domain/applications/repo';
import {
  listTargetCompanies,
  recordCompanyScanResult,
  type TargetCompany,
} from './repo';

export interface DiscoveredRole {
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  location: string;
  salaryRange?: string;
  source: string;
  externalId: string;
  jobDescription: string;
  requirements: string[];
  contactMethod: { type: 'email' | 'form' | 'portal'; value: string };
}

// Thai terms sit outside the \b groups: JS \b is ASCII-only and never matches next to Thai script.
const ROLE_MATCH_RE =
  /\b(full[- ]?stack|front[- ]?end|back[- ]?end|software engineer|software architect|solutions architect|web developer|react|next\.?js|typescript|node\.?js|ai engineer|application engineer|product engineer|developer)\b|นักพัฒนา|โปรแกรมเมอร์|วิศวกรซอฟต์แวร์/i;

const SENIOR_MAYBE_RE =
  /\b(senior|staff|principal|lead|manager|director|head of|vp|architect|5\+\s*years|6\+\s*years|7\+\s*years|8\+\s*years)\b|อาวุโส|หัวหน้า|ผู้จัดการ/i;

const LOCATION_ALLOW_RE =
  /\b(bangkok|thailand|remote|anywhere|global|apac|asia|distributed|work from home|wfh)\b|กรุงเทพ|ประเทศไทย/i;

// A job-looking path, or a numeric id segment (/development/1618-software-engineer), which nav links lack.
const JOB_LINK_RE = /\/(jobs?|careers?|positions?|openings?|vacanc\w*)|\/\d{3,}/i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export function classifyRoleStatus(
  title: string,
  location: string,
  description = '',
): ApplicationStatus | 'ignore' {
  if (!ROLE_MATCH_RE.test(title)) return 'ignore';
  const loc = location.trim();
  if (loc && !LOCATION_ALLOW_RE.test(loc) && !LOCATION_ALLOW_RE.test(description)) {
    return 'ignore';
  }
  if (SENIOR_MAYBE_RE.test(title) || SENIOR_MAYBE_RE.test(description.slice(0, 600))) {
    return 'maybe';
  }
  return 'wishlist';
}

const BANGKOK_RE = /\b(bangkok|thailand)\b|กรุงเทพ|ประเทศไทย/i;

/** 0 = Bangkok/Thailand (searched first), 1 = anywhere else the filters allow. */
export function locationTier(location: string): 0 | 1 {
  return BANGKOK_RE.test(location) ? 0 : 1;
}

/** Saves one discovered role unless the same company+title already exists. Rethrows other errors. */
export async function saveDiscoveredRole(
  sql: Sql,
  role: DiscoveredRole,
  status: ApplicationStatus,
): Promise<'created' | 'duplicate'> {
  // Same role reposted under a new id: skip it (case-insensitive company + title).
  const same = await sql.query(
    'SELECT 1 FROM job_applications WHERE lower(company_name) = lower($1) AND lower(job_title) = lower($2) LIMIT 1',
    [role.companyName, role.jobTitle],
  );
  if (same.rows.length > 0) return 'duplicate';
  try {
    await createApplication(sql, {
      companyName: role.companyName,
      jobTitle: role.jobTitle,
      jobUrl: role.jobUrl,
      location: role.location,
      salaryRange: role.salaryRange,
      status,
      source: role.source,
      externalId: role.externalId,
      jobDescription: role.jobDescription,
      requirements: role.requirements,
      contactMethod: role.contactMethod,
    });
    return 'created';
  } catch (err) {
    if (err instanceof ConflictError) return 'duplicate';
    throw err;
  }
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html || '');
  return $.text().replace(/\s+/g, ' ').trim();
}

function extractRequirements(text: string): string[] {
  const keywords = [
    'TypeScript',
    'JavaScript',
    'React',
    'Next.js',
    'Node.js',
    'Python',
    'PostgreSQL',
    'SQL',
    'Prisma',
    'Tailwind',
    'Playwright',
    'Docker',
    'AWS',
    'GraphQL',
    'REST',
    'AI',
  ];
  return keywords.filter((k) => new RegExp(`\\b${k.replace('.', '\\.')}\\b`, 'i').test(text));
}

function detectContactMethod(
  description: string,
  applyUrl: string,
): { type: 'email' | 'form' | 'portal'; value: string } {
  const emailMatch = description.match(EMAIL_RE);
  if (
    emailMatch &&
    !/noreply|no-reply|support@|privacy@|accommodation/i.test(emailMatch[0])
  ) {
    return { type: 'email', value: emailMatch[0] };
  }
  return { type: 'form', value: applyUrl };
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/html;q=0.9',
        'User-Agent': 'CareerPulse-Local-Agent/1.0',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9',
        'User-Agent': 'CareerPulse-Local-Agent/1.0',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGreenhouseCompanyJobs(
  company: TargetCompany,
): Promise<DiscoveredRole[]> {
  const slug = company.atsSlug || company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  const data = (await fetchJsonWithTimeout(url)) as {
    jobs?: Array<{
      id: number | string;
      title: string;
      absolute_url: string;
      location?: { name?: string };
      content?: string;
    }>;
  };
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const results: DiscoveredRole[] = [];

  for (const j of jobs) {
    const location = j.location?.name ?? company.locationHint ?? '';
    const desc = stripHtml(j.content ?? '');
    if (classifyRoleStatus(j.title, location, desc) === 'ignore') continue;
    results.push({
      companyName: company.name,
      jobTitle: j.title,
      jobUrl: j.absolute_url,
      location: location || 'Remote / Unspecified',
      source: 'greenhouse',
      externalId: `gh-${slug}-${j.id}`,
      jobDescription: desc.slice(0, 4000),
      requirements: extractRequirements(desc),
      contactMethod: detectContactMethod(desc, j.absolute_url),
    });
  }
  return results;
}

export async function fetchLeverCompanyJobs(company: TargetCompany): Promise<DiscoveredRole[]> {
  const slug = company.atsSlug || company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const data = await fetchJsonWithTimeout(url);
  const jobs = Array.isArray(data) ? data : [];
  const results: DiscoveredRole[] = [];

  for (const j of jobs as Array<{
    id: string;
    text: string;
    hostedUrl: string;
    applyUrl?: string;
    descriptionPlain?: string;
    categories?: { location?: string };
    workplaceType?: string;
  }>) {
    const location =
      [j.categories?.location, j.workplaceType].filter(Boolean).join(' · ') ||
      company.locationHint ||
      '';
    const desc = (j.descriptionPlain ?? '').trim();
    if (classifyRoleStatus(j.text, location, desc) === 'ignore') continue;
    const applyUrl = j.applyUrl || j.hostedUrl;
    results.push({
      companyName: company.name,
      jobTitle: j.text,
      jobUrl: j.hostedUrl,
      location: location || 'Remote / Unspecified',
      source: 'lever',
      externalId: `lever-${slug}-${j.id}`,
      jobDescription: desc.slice(0, 4000),
      requirements: extractRequirements(desc),
      contactMethod: detectContactMethod(desc, applyUrl),
    });
  }
  return results;
}

export async function fetchAshbyCompanyJobs(company: TargetCompany): Promise<DiscoveredRole[]> {
  const slug = company.atsSlug || company.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
  const data = (await fetchJsonWithTimeout(url)) as {
    jobs?: Array<{
      id: string;
      title: string;
      jobUrl?: string;
      applyUrl?: string;
      location?: string;
      isRemote?: boolean;
      descriptionPlain?: string;
      descriptionHtml?: string;
      compensation?: { compensationTierSummary?: string };
    }>;
  };
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const results: DiscoveredRole[] = [];

  for (const j of jobs) {
    const location = j.isRemote
      ? `${j.location ? `${j.location} · ` : ''}Remote`
      : j.location || company.locationHint || '';
    const desc = (j.descriptionPlain || stripHtml(j.descriptionHtml ?? '')).trim();
    if (classifyRoleStatus(j.title, location, desc) === 'ignore') continue;
    const jobUrl = j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`;
    const applyUrl = j.applyUrl || `${jobUrl}/application`;
    results.push({
      companyName: company.name,
      jobTitle: j.title,
      jobUrl,
      location: location || 'Remote',
      salaryRange: j.compensation?.compensationTierSummary,
      source: 'ashby',
      externalId: `ashby-${slug}-${j.id}`,
      jobDescription: desc.slice(0, 4000),
      requirements: extractRequirements(desc),
      contactMethod: detectContactMethod(desc, applyUrl),
    });
  }
  return results;
}

/**
 * Direct company career page parser: inspects JSON-LD `JobPosting` structured
 * data and `<a href>` links pointing to engineering roles or embedded ATS boards.
 */

/** Every non-empty piece of text under `node`, in document order. */
function textPieces($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>): string[] {
  const out: string[] = [];
  const walk = (nodes: cheerio.Cheerio<any>) =>
    nodes.each((_i, n) => {
      if (n.type === 'text') {
        const t = (n.data as string).replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      } else {
        walk($(n).contents());
      }
    });
  walk(node.contents());
  return out;
}

function titleFromSlug(href: string): string {
  const slug = href.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '';
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export async function fetchDirectCareerPageJobs(
  company: TargetCompany,
): Promise<DiscoveredRole[]> {
  let roles: DiscoveredRole[] = [];
  let fetchError: unknown = null;
  try {
    roles = parseDirectCareerHtml(await fetchTextWithTimeout(company.careersUrl), company);
  } catch (err) {
    fetchError = err;
  }
  if (roles.length > 0) return roles;
  // Static HTML held no roles (client-rendered list, or the plain fetch was refused): render it.
  const rendered = await renderPage(company.careersUrl);
  if (rendered) return parseDirectCareerHtml(rendered, company);
  if (fetchError) throw fetchError;
  return roles;
}

/** Roles from a career page's JSON-LD `JobPosting` blocks and job-looking links. */
export function parseDirectCareerHtml(html: string, company: TargetCompany): DiscoveredRole[] {
  const $ = cheerio.load(html);
  const results: DiscoveredRole[] = [];
  const seenUrls = new Set<string>();

  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const raw = $(el).contents().text();
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item?.['@type'] === 'JobPosting' && typeof item.title === 'string') {
          const title = item.title;
          const loc =
            item.jobLocation?.address?.addressLocality ||
            company.locationHint ||
            'Bangkok / Remote';
          const desc = stripHtml(item.description ?? '');
          if (classifyRoleStatus(title, loc, desc) === 'ignore') continue;
          const jobUrl = new URL(item.url || company.careersUrl, company.careersUrl).toString();
          if (seenUrls.has(jobUrl)) continue;
          seenUrls.add(jobUrl);
          results.push({
            companyName: company.name,
            jobTitle: title,
            jobUrl,
            location: loc,
            source: 'direct_careers',
            externalId: `direct-${jobUrl}`,
            jobDescription: desc.slice(0, 4000),
            requirements: extractRequirements(desc),
            contactMethod: detectContactMethod(desc, jobUrl),
          });
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  });

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    // A card link wraps title + tags ("Top Priority", "Bangkok", "Permanent"): the title is the heading,
    // else the card's first piece of text; the remaining pieces are tags that may name the location.
    const pieces = textPieces($, $(el));
    const heading = $(el).find('h1,h2,h3,h4,h5').first().text().replace(/\s+/g, ' ').trim();
    let text = heading || pieces[0] || '';
    const tags = pieces.filter((p) => p !== text);
    if (text.length > 120 && href) text = titleFromSlug(href);
    // Nav links such as "Developers" or "React docs" match the role regex; only job-looking URLs count.
    if (!href || !text || text.length > 120 || !JOB_LINK_RE.test(href)) return;
    // No tags: trust the company's location hint. Tags: use the Bangkok/Thailand one, else the tags
    // themselves, which the location filter then rejects (e.g. a Korea-based role on a Bangkok company's page).
    const cardLocation =
      tags.length === 0
        ? (company.locationHint ?? 'Bangkok / Remote')
        : (tags.find((t) => BANGKOK_RE.test(t)) ?? tags.join(' · '));
    const status = classifyRoleStatus(text, cardLocation);
    if (status === 'ignore') return;
    try {
      const jobUrl = new URL(href, company.careersUrl).toString();
      if (seenUrls.has(jobUrl)) return;
      seenUrls.add(jobUrl);
      results.push({
        companyName: company.name,
        jobTitle: text,
        jobUrl,
        location: cardLocation,
        source: 'direct_careers',
        externalId: `direct-${jobUrl}`,
        jobDescription: `Direct role discovered on ${company.name}'s career page (${company.careersUrl}).`,
        requirements: extractRequirements(text),
        contactMethod: { type: 'form', value: jobUrl },
      });
    } catch {
      // Ignore invalid relative hrefs
    }
  });

  return results;
}

export async function scanCompanyCareers(company: TargetCompany): Promise<DiscoveredRole[]> {
  if (company.atsType === 'greenhouse') return fetchGreenhouseCompanyJobs(company);
  if (company.atsType === 'lever') return fetchLeverCompanyJobs(company);
  if (company.atsType === 'ashby') return fetchAshbyCompanyJobs(company);
  return fetchDirectCareerPageJobs(company);
}

export async function discoverFromCompanyCareers(
  sql: Sql,
  maxNewRoles = 15,
): Promise<{
  companiesScanned: number;
  discovered: number;
  skippedDuplicates: number;
  errors: number;
}> {
  const companies = (await listTargetCompanies(sql)).filter((c) => c.enabled);
  let companiesScanned = 0;
  let discovered = 0;
  let skippedDuplicates = 0;
  let errors = 0;

  // Scan every company first, then take roles round-robin, so one company with many
  // openings cannot use the whole quota and starve the others.
  // Bangkok/Thailand roles (tier 0) fill the quota before any other role (tier 1).
  type Entry = { role: DiscoveredRole; status: ApplicationStatus };
  const tiers: Array<Array<Entry[]>> = [[], []];
  for (const company of companies) {
    companiesScanned += 1;
    try {
      const roles = await scanCompanyCareers(company);
      await recordCompanyScanResult(sql, company.id, roles.length, null);
      const byTier: Entry[][] = [[], []];
      for (const role of roles) {
        const status = classifyRoleStatus(role.jobTitle, role.location, role.jobDescription);
        if (status !== 'ignore') byTier[locationTier(role.location)].push({ role, status });
      }
      byTier.forEach((queue, tier) => {
        if (queue.length > 0) tiers[tier].push(queue);
      });
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : 'Scan failed';
      await recordCompanyScanResult(sql, company.id, 0, msg);
    }
  }

  for (const queues of tiers) {
    for (let round = 0; discovered < maxNewRoles; round++) {
      let tookAny = false;
      for (const queue of queues) {
        const entry = queue[round];
        if (!entry) continue;
        tookAny = true;
        if (discovered >= maxNewRoles) break;
        try {
          if ((await saveDiscoveredRole(sql, entry.role, entry.status)) === 'created') discovered += 1;
          else skippedDuplicates += 1;
        } catch {
          errors += 1;
        }
      }
      if (!tookAny) break;
    }
  }

  return { companiesScanned, discovered, skippedDuplicates, errors };
}
