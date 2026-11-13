import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { ConflictError, NotFoundError } from '@/lib/errors';
import {
  INBOX_INPUT_ERRORS,
  MAX_ANSWER_LENGTH,
  MAX_PROMPT_LENGTH,
  getOpenApprovalContext,
  updateApprovalPreview,
} from '@/domain/inbox/repo';
import {
  ensureMasterProfileLinks,
  generateMasterProfileCoverLetter,
} from '@/domain/tailoring/coverLetter';
import { factCheckLetter } from '@/domain/tailoring/factCheck';

export const dynamic = 'force-dynamic';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * POST /api/inbox/[id]/refine
 *
 * Modes:
 * - `{ preview: string }`: saves the user's manually edited cover letter draft
 *   (and ensures Personal Website + GitHub links from Master Profile are present).
 * - `{ instruction?: string }`: regenerates / rewrites the cover letter from
 *   the Master Profile (`master-profile.json`) + target job context, embedding
 *   Personal Website and GitHub links, and saves the new preview on the open
 *   approval item.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  let body: unknown = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return fail('Invalid JSON body', 400);
  }
  if (!isPlainObject(body)) return fail('Request body must be a JSON object', 400);

  const { instruction, preview } = body;
  if (instruction !== undefined && typeof instruction !== 'string') {
    return fail('instruction must be a string', 400);
  }
  if (typeof instruction === 'string' && instruction.length > MAX_PROMPT_LENGTH) {
    return fail('instruction is too long', 400);
  }
  if (preview !== undefined && typeof preview !== 'string') {
    return fail('preview must be a string', 400);
  }
  if (typeof preview === 'string' && preview.length > MAX_ANSWER_LENGTH) {
    return fail('preview is too long', 400);
  }

  const sql = getDb();
  try {
    if (typeof preview === 'string') {
      const withLinks = ensureMasterProfileLinks(preview);
      const item = await updateApprovalPreview(sql, params.id, withLinks, {
        refinedAt: new Date().toISOString(),
        factCheck: factCheckLetter(withLinks),
      });
      return ok({ item, usedAi: false });
    }

    const ctx = await getOpenApprovalContext(sql, params.id);
    const currentPreview =
      typeof ctx.item.payload.preview === 'string' ? ctx.item.payload.preview : null;

    const generated = await generateMasterProfileCoverLetter({
      companyName: ctx.item.companyName ?? 'Hiring Team',
      jobTitle: ctx.item.jobTitle ?? 'Software Engineer',
      jobDescription: ctx.jobDescription,
      requirements: ctx.requirements,
      location: ctx.location,
      currentDraft: currentPreview,
      refineInstruction: typeof instruction === 'string' ? instruction : null,
    });

    const item = await updateApprovalPreview(sql, params.id, generated.letter, {
      refinedAt: new Date().toISOString(),
      usedAi: generated.usedAi,
      embeddedLinks: generated.embeddedLinks,
      factCheck: factCheckLetter(generated.letter),
    });

    return ok({
      item,
      usedAi: generated.usedAi,
      embeddedLinks: generated.embeddedLinks,
    });
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Inbox item not found', 404);
    if (err instanceof ConflictError) return fail('Inbox item is already resolved', 409);
    if (err instanceof Error && INBOX_INPUT_ERRORS.has(err.message)) {
      return fail(err.message, 400);
    }
    console.error('[inbox:refine]', err);
    return fail('Internal error', 500);
  }
}
