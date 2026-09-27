import { getMasterProfile } from '@/domain/profile';
import { getAllJobs } from '@/domain/jobs';
import { getPipelineSettings } from '@/domain/pipeline/settings';
import { getDraftColdEmails } from '@/domain/cold-emails';
import ProfileView from '@/components/profile/ProfileView';
import FacebookScraperCard from '@/components/jobs/FacebookScraperCard';
import PipelineSettingsCard from '@/components/pipeline/PipelineSettingsCard';
import ColdEmailQueue from '@/components/cold-emails/ColdEmailQueue';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const profile = getMasterProfile();
  const jobs = await getAllJobs();
  const pipelineSettings = await getPipelineSettings();
  const draftEmails = await getDraftColdEmails();

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">

        <PipelineSettingsCard initialSettings={pipelineSettings} />

        {/* Feature 1: Candidate Master Profile */}
        <ProfileView initialProfile={profile} />

        {/* Feature 2: Facebook Job Post Sourcing */}
        <FacebookScraperCard initialJobs={jobs} />

        {/* Feature 3: Cold-Email Review Queue */}
        <ColdEmailQueue initialEmails={draftEmails} />

      </div>
    </main>
  );
}
