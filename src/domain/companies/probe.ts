import type { Sql } from '@/lib/sql';
import { addTargetCompany, type AtsType, type TargetCompany } from '@/domain/companies/repo';

// Public, unauthenticated board endpoints. 200 = the company has a board here (even if empty).
const BOARDS: { atsType: Exclude<AtsType, 'direct_careers'>; api: (s: string) => string; page: (s: string) => string }[] = [
  {
    atsType: 'greenhouse',
    api: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    page: (s) => `https://boards.greenhouse.io/${s}`,
  },
  {
    atsType: 'lever',
    api: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    page: (s) => `https://jobs.lever.co/${s}`,
  },
  {
    atsType: 'ashby',
    api: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    page: (s) => `https://jobs.ashbyhq.com/${s}`,
  },
];

/** "Acme Co." -> ["acmeco", "acme-co", "acme"] */
export function slugCandidates(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  return Array.from(new Set([words.join(''), words.join('-'), words[0]])).filter((s) => s.length >= 3);
}

export interface BoardHit {
  atsType: AtsType;
  atsSlug: string;
  careersUrl: string;
  jobCount: number;
}

// Lever returns a bare array; Greenhouse and Ashby return { jobs: [...] }.
function jobCount(body: unknown): number {
  const list = Array.isArray(body) ? body : (body as { jobs?: unknown }).jobs;
  return Array.isArray(list) ? list.length : 0;
}

/** Tries each candidate slug on each public ATS; returns the board with the most jobs. */
export async function probeCompanyBoard(name: string): Promise<BoardHit | null> {
  let best: BoardHit | null = null;
  for (const slug of slugCandidates(name)) {
    for (const board of BOARDS) {
      try {
        const res = await fetch(board.api(slug), { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
        if (!res.ok) continue;
        const count = jobCount(await res.json());
        if (!best || count > best.jobCount) {
          best = { atsType: board.atsType, atsSlug: slug, careersUrl: board.page(slug), jobCount: count };
        }
      } catch {
        // network error or non-JSON body: treat as "no board here"
      }
    }
    if (best && best.jobCount > 0) break; // a live board beats trying more spellings
  }
  return best;
}

/** HN "Who is hiring" top-level comments start "Company | role | place": returns the company names. */
export async function hackerNewsCompanyNames(limit = 150): Promise<string[]> {
  const search = await fetch(
    'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=3',
    { signal: AbortSignal.timeout(10000) },
  ).then((r) => r.json() as Promise<{ hits: { objectID: string; title: string }[] }>);
  const story = search.hits.find((h) => /who is hiring/i.test(h.title));
  if (!story) return [];
  const item = await fetch(`https://hn.algolia.com/api/v1/items/${story.objectID}`, {
    signal: AbortSignal.timeout(20000),
  }).then((r) => r.json() as Promise<{ children?: { text?: string | null }[] }>);
  const names = new Set<string>();
  for (const c of item.children ?? []) {
    const first = (c.text ?? '').split(/<p>|\|/)[0].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    if (first.length >= 3 && first.length <= 40 && /^[\p{L}0-9][\p{L}0-9 .&'-]*$/u.test(first)) names.add(first);
    if (names.size >= limit) break;
  }
  return [...names];
}

export interface ProbeSummary {
  checked: number;
  added: TargetCompany[];
  notFound: string[];
}

/** Probes each name (4 at a time, politely) and registers the ones with a public board. */
export async function registerCompaniesByName(sql: Sql, names: string[], locationHint?: string): Promise<ProbeSummary> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).slice(0, 200);
  const added: TargetCompany[] = [];
  const notFound: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const name = unique[next++];
      const hit = await probeCompanyBoard(name);
      if (!hit) {
        notFound.push(name);
        continue;
      }
      added.push(
        await addTargetCompany(sql, {
          name,
          careersUrl: hit.careersUrl,
          atsType: hit.atsType,
          atsSlug: hit.atsSlug,
          locationHint,
        }),
      );
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { checked: unique.length, added, notFound };
}
