import { getDb } from '@/lib/sql';
import { fail, ok } from '@/lib/http';
import { listAnswers, saveAnswer, NO_USABLE_TEXT } from '@/domain/answers/repo';

export const dynamic = 'force-dynamic';

const MAX_QUESTION_LENGTH = 1000;
const MAX_ANSWER_LENGTH = 5000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(_req: Request): Promise<Response> {
  try {
    const answers = await listAnswers(getDb());
    return ok({ answers });
  } catch (err) {
    console.error('[answers:GET]', err);
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

  const { questionText, answer } = body;
  if (typeof questionText !== 'string' || typeof answer !== 'string') {
    return fail('questionText and answer must be strings', 400);
  }
  const question = questionText.trim();
  const reply = answer.trim();
  if (!question || !reply) return fail('questionText and answer must not be empty', 400);
  if (question.length > MAX_QUESTION_LENGTH) return fail('questionText is too long', 400);
  if (reply.length > MAX_ANSWER_LENGTH) return fail('answer is too long', 400);

  try {
    const entry = await saveAnswer(getDb(), question, reply);
    return ok({ answer: entry });
  } catch (err) {
    if (err instanceof Error && err.message === NO_USABLE_TEXT) return fail(NO_USABLE_TEXT, 400);
    console.error('[answers:PUT]', err);
    return fail('Internal error', 500);
  }
}
