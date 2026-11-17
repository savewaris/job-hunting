import { getMasterProfile } from '@/domain/profile';
import type { MasterProfile } from '@/types/profile';

// shortcut: fixed vocabulary of common tech terms, so a claim about a tool not listed here goes unchecked; extend when a miss shows up.
const TECH_TERMS = [
  'Angular', 'AWS', 'Azure', 'C#', 'C++', 'Django', 'Docker', 'Elasticsearch', 'Express', 'FastAPI',
  'Flask', 'Flutter', 'GCP', 'Go', 'GraphQL', 'Java', 'Kafka', 'Kotlin', 'Kubernetes', 'Laravel',
  'MongoDB', 'MySQL', 'NestJS', 'PHP', 'PostgreSQL', 'Prisma', 'Python', 'React', 'Redis', 'Ruby',
  'Rust', 'Spring', 'Supabase', 'Svelte', 'Swift', 'Tailwind', 'Terraform', 'TypeScript', 'Vue',
];

function monthsOf(date: string | null | undefined, fallback: Date): number {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : fallback.getFullYear() * 12 + fallback.getMonth();
}

function experienceYears(profile: MasterProfile, now: Date): number {
  const months = profile.experiences.reduce(
    (sum, e) => sum + Math.max(0, monthsOf(e.endDate, now) - monthsOf(e.startDate, now)),
    0,
  );
  return months / 12;
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(text: string, term: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`, 'i').test(text);
}

/**
 * Returns claims in a cover letter that the Master Profile does not back:
 * tech the profile never mentions, years of experience beyond the dated roles,
 * and percentages/multipliers absent from the profile text.
 */
export function factCheckLetter(
  letter: string,
  profile: MasterProfile = getMasterProfile(),
  now: Date = new Date(),
): string[] {
  const corpus = [
    profile.headline,
    profile.summary,
    ...profile.skills,
    ...profile.detailedSkills.map((s) => s.name),
    ...profile.experiences.flatMap((e) => [e.role, e.company, e.description]),
    ...profile.education.flatMap((e) => [e.institution, e.degree, e.fieldOfStudy]),
    ...profile.projects.flatMap((p) => [p.title, p.description, p.tags ?? '']),
  ].join('\n');

  const claims: string[] = [];

  for (const term of TECH_TERMS) {
    if (mentions(letter, term) && !mentions(corpus, term)) {
      claims.push(`Mentions ${term}, which is not in the Master Profile`);
    }
  }

  const ownYears = experienceYears(profile, now);
  for (const m of letter.matchAll(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\b/gi)) {
    if (Number(m[1]) > ownYears) {
      claims.push(`Claims "${m[0]}" of experience; the dated roles in the profile add up to about ${ownYears.toFixed(1)} years`);
    }
  }

  for (const m of letter.matchAll(/\d+(?:\.\d+)?\s*(?:%|x\b)/gi)) {
    if (!corpus.includes(m[0].replace(/\s+/g, ''))) {
      claims.push(`States metric "${m[0]}", which is not in the Master Profile`);
    }
  }

  return claims;
}
