import { getDb } from '@/lib/sql';
import { listScrapedJobs } from '@/domain/applications/legacy';
import FacebookScraperCard from '@/components/jobs/FacebookScraperCard';

export const dynamic = 'force-dynamic';

export default async function FacebookSourcePage() {
  const jobs = await listScrapedJobs(getDb());
  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-4 py-8 sm:px-6">
      <FacebookScraperCard initialJobs={jobs} />
    </main>
  );
}
