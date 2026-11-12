import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import {
  ATS_TYPES,
  addTargetCompany,
  listTargetCompanies,
  type AtsType,
} from '@/domain/companies/repo';
import { discoverFromCompanyCareers } from '@/domain/companies/discover';

export const dynamic = 'force-dynamic';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(): Promise<Response> {
  try {
    const companies = await listTargetCompanies(getDb());
    return ok({ companies });
  } catch (err) {
    console.error('[companies:GET]', err);
    return fail('Internal error', 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  if (!isPlainObject(body)) return fail('Request body must be a JSON object', 400);

  if (body.action === 'scan') {
    try {
      const summary = await discoverFromCompanyCareers(getDb(), 15);
      const companies = await listTargetCompanies(getDb());
      return ok({ summary, companies });
    } catch (err) {
      console.error('[companies:scan]', err);
      return fail('Failed to scan company career pages', 500);
    }
  }

  const { name, careersUrl, atsType, atsSlug, locationHint } = body;
  if (typeof name !== 'string' || !name.trim()) return fail('name is required', 400);
  if (typeof careersUrl !== 'string' || !careersUrl.trim()) {
    return fail('careersUrl is required', 400);
  }
  if (atsType !== undefined && (typeof atsType !== 'string' || !ATS_TYPES.includes(atsType as AtsType))) {
    return fail('atsType must be greenhouse, lever, ashby, or direct_careers', 400);
  }

  try {
    const company = await addTargetCompany(getDb(), {
      name,
      careersUrl,
      atsType: atsType as AtsType | undefined,
      atsSlug: typeof atsSlug === 'string' ? atsSlug : undefined,
      locationHint: typeof locationHint === 'string' ? locationHint : undefined,
    });
    return ok({ company }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes('careersUrl')) {
      return fail(err.message, 400);
    }
    console.error('[companies:POST]', err);
    return fail('Internal error', 500);
  }
}
