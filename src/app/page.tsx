import { getMasterProfile } from '@/domain/profile';
import { getSavedJobs } from '@/domain/jobs';
import ProfileView from '@/components/profile/ProfileView';
import FacebookScraperCard from '@/components/jobs/FacebookScraperCard';

export default function HomePage() {
  const profile = getMasterProfile();
  const jobs = getSavedJobs();

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
        
        {/* Feature 1: Candidate Master Profile */}
        <ProfileView initialProfile={profile} />

        {/* Feature 2: Facebook Job Post Sourcing & Visible Playwright Scraper */}
        <FacebookScraperCard initialJobs={jobs} />

      </div>
    </main>
  );
}
