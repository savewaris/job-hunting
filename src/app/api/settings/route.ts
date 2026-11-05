import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { getSettings, updateSettings } from '@/domain/settings/repo';

export const dynamic = 'force-dynamic';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(_req: Request): Promise<Response> {
  try {
    const settings = await getSettings(getDb());
    return ok({ settings });
  } catch (err) {
    console.error('[settings:GET]', err);
    return fail('Internal error', 500);
  }
}

export async function PUT(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  if (!isPlainObject(body)) return fail('Request body must be a JSON object', 400);

  if (Object.prototype.hasOwnProperty.call(body, 'scheduleEnabled')) {
    return fail("Scheduling isn't built yet", 400);
  }
  if (Object.keys(body).some((key) => key !== 'maxDailyDrafts')) {
    return fail('Unknown setting', 400);
  }

  try {
    const settings = await updateSettings(getDb(), {
      maxDailyDrafts: body.maxDailyDrafts as number | undefined,
    });
    return ok({ settings });
  } catch (err) {
    if (err instanceof RangeError) return fail(err.message, 400);
    console.error('[settings:PUT]', err);
    return fail('Internal error', 500);
  }
}
