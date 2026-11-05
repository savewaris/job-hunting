import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { listOpenInbox } from '@/domain/inbox/repo';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request): Promise<Response> {
  try {
    const items = await listOpenInbox(getDb());
    return ok({ items });
  } catch (err) {
    console.error('[inbox:GET]', err);
    return fail('Internal error', 500);
  }
}
