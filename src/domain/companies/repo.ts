import type { Sql } from '@/lib/sql';
import { NotFoundError } from '@/lib/errors';

export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'direct_careers';

export const ATS_TYPES: readonly AtsType[] = ['greenhouse', 'lever', 'ashby', 'direct_careers'];

export interface TargetCompany {
  id: string;
  name: string;
  careersUrl: string;
  atsType: AtsType;
  atsSlug: string | null;
  locationHint: string | null;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastFoundCount: number;
  lastError: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  careers_url: string;
  ats_type: AtsType;
  ats_slug: string | null;
  location_hint: string | null;
  enabled: boolean;
  last_checked_at: Date | string | null;
  last_found_count: number;
  last_error: string | null;
  created_at: Date | string;
}

function iso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toCompany(r: Row): TargetCompany {
  return {
    id: r.id,
    name: r.name,
    careersUrl: r.careers_url,
    atsType: r.ats_type,
    atsSlug: r.ats_slug,
    locationHint: r.location_hint,
    enabled: r.enabled,
    lastCheckedAt: iso(r.last_checked_at),
    lastFoundCount: r.last_found_count,
    lastError: r.last_error,
    createdAt: iso(r.created_at) as string,
  };
}

/**
 * Automatically detects Greenhouse, Lever, or Ashby slug from a company's
 * careers URL, or falls back to `direct_careers` for custom company career pages.
 */
export function detectCompanyAts(careersUrl: string): { atsType: AtsType; atsSlug: string | null } {
  let url: URL;
  try {
    url = new URL(careersUrl.trim());
  } catch {
    throw new Error('careersUrl must be a valid http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('careersUrl must be a valid http(s) URL');
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host.includes('greenhouse.io') && segments.length >= 1) {
    const slug = segments[0] === 'embed' ? url.searchParams.get('for') : segments[0];
    if (slug) return { atsType: 'greenhouse', atsSlug: slug };
  }
  if (host.includes('lever.co') && segments.length >= 1) {
    return { atsType: 'lever', atsSlug: segments[0] };
  }
  if (host.includes('ashbyhq.com') && segments.length >= 1) {
    return { atsType: 'ashby', atsSlug: segments[0] };
  }
  return { atsType: 'direct_careers', atsSlug: null };
}

export async function listTargetCompanies(sql: Sql): Promise<TargetCompany[]> {
  const res = await sql.query<Row>(
    `SELECT id, name, careers_url, ats_type, ats_slug, location_hint, enabled,
            last_checked_at, last_found_count, last_error, created_at
     FROM target_companies
     ORDER BY enabled DESC, name ASC`,
  );
  return res.rows.map(toCompany);
}

export async function addTargetCompany(
  sql: Sql,
  input: {
    name: string;
    careersUrl: string;
    atsType?: AtsType;
    atsSlug?: string | null;
    locationHint?: string | null;
  },
): Promise<TargetCompany> {
  const name = input.name.trim();
  const careersUrl = input.careersUrl.trim();
  if (!name) throw new Error('Company name is required');
  const detected = detectCompanyAts(careersUrl);
  const atsType = input.atsType && ATS_TYPES.includes(input.atsType) ? input.atsType : detected.atsType;
  const atsSlug =
    input.atsSlug !== undefined
      ? input.atsSlug?.trim() || null
      : detected.atsSlug;

  const res = await sql.query<Row>(
    `INSERT INTO target_companies (name, careers_url, ats_type, ats_slug, location_hint)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (careers_url) DO UPDATE SET
       name = EXCLUDED.name,
       ats_type = EXCLUDED.ats_type,
       ats_slug = EXCLUDED.ats_slug,
       location_hint = COALESCE(EXCLUDED.location_hint, target_companies.location_hint),
       enabled = true
     RETURNING id, name, careers_url, ats_type, ats_slug, location_hint, enabled,
               last_checked_at, last_found_count, last_error, created_at`,
    [name, careersUrl, atsType, atsSlug, input.locationHint?.trim() || null],
  );
  return toCompany(res.rows[0]);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function removeTargetCompany(sql: Sql, id: string): Promise<void> {
  if (!UUID_RE.test(id)) throw new NotFoundError('Company not found');
  const res = await sql.query('DELETE FROM target_companies WHERE id = $1::uuid RETURNING id', [id]);
  if (res.rows.length === 0) throw new NotFoundError('Company not found');
}

export async function recordCompanyScanResult(
  sql: Sql,
  id: string,
  foundCount: number,
  error: string | null = null,
): Promise<void> {
  await sql.query(
    `UPDATE target_companies
     SET last_checked_at = now(), last_found_count = $2, last_error = $3
     WHERE id = $1::uuid`,
    [id, foundCount, error ? error.slice(0, 300) : null],
  );
}
