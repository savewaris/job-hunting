import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { listApplications } from '@/domain/applications/repo';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request): Promise<Response> {
  try {
    const applications = await listApplications(getDb());
    return ok({ applications });
  } catch (err) {
    console.error('[applications:GET]', err);
    return fail('Failed to load applications', 500);
  }
}
