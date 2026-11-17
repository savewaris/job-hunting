import { getMasterProfile } from '@/domain/profile';
import type { MasterProfile } from '@/types/profile';

export interface FitJob {
  jobTitle: string;
  jobDescription?: string | null;
  requirements?: string[] | null;
  location?: string | null;
}

export interface FitResult {
  /** 1 (poor) to 5 (strong). */
  score: number;
  /** How much job text the score rests on, not how good the match is. */
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

// shortcut: substring matching on skill names, so "Go"-style short skills could false-match; swap for token matching if the profile gains such skills.
function hits(text: string, terms: string[]): string[] {
  return terms.filter((t) => t.length >= 3 && text.includes(t.toLowerCase()));
}

/**
 * Deterministic fit score against the Master Profile: role match (0-2) +
 * skill overlap (0-2) + location (0-1), floored at 1.
 */
export function scoreFit(job: FitJob, profile: MasterProfile = getMasterProfile()): FitResult {
  const title = job.jobTitle.toLowerCase();
  const body = `${job.jobDescription ?? ''} ${(job.requirements ?? []).join(' ')}`.toLowerCase();
  const reasons: string[] = [];

  const roleWords = profile.preferences.targetRoles.flatMap((r) =>
    r.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 5),
  );
  const roleHits = new Set(roleWords.filter((w) => title.includes(w)));
  const role = roleHits.size >= 2 ? 2 : roleHits.size;
  if (role) reasons.push(`title matches target role (${[...roleHits].join(', ')})`);

  const skillHits = hits(`${title} ${body}`, profile.skills);
  const skill = Math.min(2, skillHits.length);
  if (skillHits.length) reasons.push(`skills in posting: ${skillHits.join(', ')}`);

  const loc = (job.location ?? '').toLowerCase();
  const wantsRemote = /remote|anywhere|worldwide/.test(loc);
  const place =
    wantsRemote ||
    profile.preferences.targetLocations.some((l) => {
      const city = l.toLowerCase().split(/[,(]/)[0].trim();
      return city.length >= 3 && loc.includes(city);
    })
      ? 1
      : 0;
  if (place) reasons.push('location fits preferences');

  const textLen = body.trim().length;
  const reqCount = job.requirements?.length ?? 0;
  const confidence =
    textLen >= 200 || reqCount >= 3 ? 'high' : textLen >= 60 || reqCount > 0 ? 'medium' : 'low';
  if (confidence === 'low') reasons.push('little posting text, score is a rough guess');

  return { score: Math.max(1, role + skill + place), confidence, reasons };
}
