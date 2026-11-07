import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError, NotFoundError } from '@/lib/errors';
import {
  INBOX_DECISIONS,
  INBOX_INPUT_ERRORS,
  resolveInboxItem,
  type InboxDecision,
} from '@/domain/inbox/repo';
import { moveApplication } from '@/domain/applications/repo';
import { generateTailoredResumePdf } from '@/domain/tailoring/resumePdf';
import { ensureMasterProfileLinks } from '@/domain/tailoring/coverLetter';
import { sendApplicationEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  if (!isPlainObject(body)) return fail('Request body must be a JSON object', 400);

  const { decision, answer, saveToBank } = body;
  if (typeof decision !== 'string' || !INBOX_DECISIONS.includes(decision as InboxDecision)) {
    return fail('decision must be one of answered, approved, skipped', 400);
  }
  if (answer !== undefined && typeof answer !== 'string') return fail('answer must be a string', 400);
  if (saveToBank !== undefined && typeof saveToBank !== 'boolean') {
    return fail('saveToBank must be a boolean', 400);
  }

  const sql = getDb();
  try {
    const item = await resolveInboxItem(sql, params.id, {
      decision: decision as InboxDecision,
      answer,
      saveToBank,
    });

    let delivery: Record<string, unknown> | undefined;
    if (decision === 'approved' && item.jobApplicationId) {
      try {
        const jobRes = await sql.query<{
          company_name: string;
          job_title: string;
          job_description: string | null;
          requirements: string[] | null;
          contact_method: { type?: string; value?: string } | string | null;
        }>(
          `SELECT company_name, job_title, job_description, requirements, contact_method
           FROM job_applications WHERE id = $1::uuid`,
          [item.jobApplicationId],
        );

        if (jobRes.rows.length > 0) {
          const job = jobRes.rows[0];
          const contactMethod =
            typeof job.contact_method === 'string'
              ? (JSON.parse(job.contact_method) as { type?: string; value?: string })
              : job.contact_method;

          if (contactMethod?.type === 'email' && contactMethod.value) {
            const pdf = await generateTailoredResumePdf({
              companyName: job.company_name,
              jobTitle: job.job_title,
              jobDescription: job.job_description,
              requirements: job.requirements,
            });
            const coverLetter = ensureMasterProfileLinks(
              item.answer ||
                (typeof item.payload.preview === 'string' ? item.payload.preview : ''),
            );
            const safeCompany = job.company_name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
            const emailRes = await sendApplicationEmail({
              to: contactMethod.value,
              subject: `Application: ${job.job_title} at ${job.company_name} — Waris Khamkaweepart`,
              body: coverLetter,
              resumePdfBuffer: pdf,
              resumeFilename: `Waris_Khamkaweepart_Resume_${safeCompany}.pdf`,
            });
            delivery = { channel: 'email', ...emailRes };
          } else {
            delivery = {
              channel: 'career_form',
              applyUrl: contactMethod?.value ?? null,
            };
          }

          await moveApplication(sql, item.jobApplicationId, 'applied');
        }
      } catch (deliveryErr) {
        console.error('[inbox:resolve:delivery]', deliveryErr);
      }
    }

    return ok(delivery ? { item, delivery } : { item });
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Inbox item not found', 404);
    if (err instanceof ConflictError) return fail('Inbox item is already resolved', 409);
    if (err instanceof Error && INBOX_INPUT_ERRORS.has(err.message)) return fail(err.message, 400);
    console.error('[inbox:resolve]', err);
    return fail('Internal error', 500);
  }
}
