import { getDb } from '@/lib/sql';
import { listAnswers } from '@/domain/answers/repo';
import AnswerBank from '@/components/dashboard/AnswerBank';

export const dynamic = 'force-dynamic';

export default async function AnswersPage() {
  const entries = await listAnswers(getDb());
  return (
    <main className="mx-auto w-full max-w-3xl min-w-0 px-4 py-6 sm:px-6">
      <AnswerBank entries={entries} />
    </main>
  );
}
