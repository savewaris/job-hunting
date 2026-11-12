import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { getOpenApprovalContext } from '@/domain/inbox/repo';
import {
  buildStandardFilledFields,
  launchPlaywrightFormFill,
} from '@/domain/ats/formFiller';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const sql = getDb();
  try {
    const ctx = await getOpenApprovalContext(sql, params.id);
    const jobRes = await sql.query<{
      job_url: string | null;
      contact_method: { type?: string; value?: string } | string | null;
    }>(
      `SELECT job_url, contact_method FROM job_applications WHERE id = $1::uuid`,
      [ctx.item.jobApplicationId],
    );
    const row = jobRes.rows[0];
    const cm =
      typeof row?.contact_method === 'string'
        ? (JSON.parse(row.contact_method) as { type?: string; value?: string })
        : row?.contact_method;

    const applyUrl =
      (typeof ctx.item.payload.applyUrl === 'string' && ctx.item.payload.applyUrl) ||
      cm?.value ||
      row?.job_url ||
      '';

    if (!applyUrl || !/^https?:\/\//i.test(applyUrl)) {
      return fail('No valid company career form URL is attached to this item', 400);
    }

    const companyName = ctx.item.companyName ?? 'Company';
    const jobTitle = ctx.item.jobTitle ?? 'Software Engineer';
    const coverLetter =
      typeof ctx.item.payload.preview === 'string' ? ctx.item.payload.preview : '';
    const filledFields =
      typeof ctx.item.payload.filledFields === 'object' &&
      ctx.item.payload.filledFields !== null &&
      !Array.isArray(ctx.item.payload.filledFields)
        ? (ctx.item.payload.filledFields as Record<string, string>)
        : buildStandardFilledFields(companyName, jobTitle, applyUrl);

    const result = await launchPlaywrightFormFill({
      applyUrl,
      companyName,
      jobTitle,
      coverLetter,
      filledFields,
    });

    return ok({ result });
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Inbox item not found', 404);
    if (err instanceof ConflictError) return fail('Inbox item is already resolved', 409);
    console.error('[inbox:fill-form]', err);
    return fail(
      err instanceof Error ? err.message : 'Failed to launch browser form filler',
      500,
    );
  }
}
