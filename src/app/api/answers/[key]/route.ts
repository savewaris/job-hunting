import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { NotFoundError } from '@/lib/errors';
import { deleteAnswer } from '@/domain/answers/repo';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { key: string } },
): Promise<Response> {
  let key: string;
  try {
    key = decodeURIComponent(params.key);
  } catch {
    return fail('Invalid key encoding', 400);
  }
  try {
    await deleteAnswer(getDb(), key);
    return ok();
  } catch (err) {
    if (err instanceof NotFoundError) return fail('Answer not found', 404);
    console.error('[answers:DELETE]', err);
    return fail('Internal error', 500);
  }
}
