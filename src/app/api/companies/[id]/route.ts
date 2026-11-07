import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { NotFoundError } from '@/lib/errors';
import { removeTargetCompany } from '@/domain/companies/repo';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  try {
    await removeTargetCompany(getDb(), params.id);
    return ok({});
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Company not found', 404);
    console.error('[companies:DELETE]', err);
    return fail('Internal error', 500);
  }
}
