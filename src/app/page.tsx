'use client';

import React, { useState, useEffect } from 'react';
import { 
  JobApplication, 
  JobStatus, 
  MasterProfile, 
  Interview, 
  JobOffer, 
  ColdEmail 
} from '@/types';
import { 
  INITIAL_APPLICATIONS, 
  MOCK_MASTER_PROFILE, 
  MOCK_INTERVIEWS, 
  MOCK_OFFERS, 
  INITIAL_COLD_EMAILS 
} from '@/lib/mockData';
import { 
  fetchJobApplications, 
  createJobApplication, 
  updateJobApplicationStatus, 
  deleteJobApplicationFromDb,
  fetchMasterProfile,
  saveMasterProfileToDb,
  fetchInterviews,
  fetchOffers,
  fetchColdEmails,
  saveColdEmailToDb,
  deleteColdEmailFromDb
} from '@/lib/db';
import { Navbar } from '@/components/layout/Navbar';
import { KanbanBoard } from '@/components/tracker/KanbanBoard';
import { JobImportModal } from '@/components/tracker/JobImportModal';
import { ResumeCustomizer } from '@/components/ai/ResumeCustomizer';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { InterviewCalendar } from '@/components/interviews/InterviewCalendar';
import { OfferCalculator } from '@/components/offers/OfferCalculator';
import { ProfileEditor } from '@/components/profile/ProfileEditor';
import { ColdEmailQueue } from '@/components/outreach/ColdEmailQueue';
import { JobScraperPanel } from '@/components/scraper/JobScraperPanel';

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('tracker');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Application Pipeline State (Hydrated from Supabase where env vars exist)
  const [applications, setApplications] = useState<JobApplication[]>(INITIAL_APPLICATIONS);
  const [masterProfile, setMasterProfile] = useState<MasterProfile>(MOCK_MASTER_PROFILE);
  const [interviews, setInterviews] = useState<Interview[]>(MOCK_INTERVIEWS);
  const [offers, setOffers] = useState<JobOffer[]>(MOCK_OFFERS);
  const [coldEmails, setColdEmails] = useState<ColdEmail[]>(INITIAL_COLD_EMAILS);

  const [selectedAppForTailoring, setSelectedAppForTailoring] = useState<JobApplication | null>(null);

  // Acceptance Criteria 7: mockData.ts reads replaced with real Supabase queries where env vars exist
  useEffect(() => {
    let isMounted = true;

    async function loadDataFromSupabase() {
      try {
        const [loadedApps, loadedProfile, loadedInterviews, loadedOffers, loadedEmails] = await Promise.all([
          fetchJobApplications(),
          fetchMasterProfile(),
          fetchInterviews(),
          fetchOffers(),
          fetchColdEmails(),
        ]);

        if (isMounted) {
          if (loadedApps && loadedApps.length > 0) setApplications(loadedApps);
          if (loadedProfile) setMasterProfile(loadedProfile);
          if (loadedInterviews && loadedInterviews.length > 0) setInterviews(loadedInterviews);
          if (loadedOffers && loadedOffers.length > 0) setOffers(loadedOffers);
          if (loadedEmails && loadedEmails.length > 0) setColdEmails(loadedEmails);
        }
      } catch (err) {
        console.warn('Error loading real Supabase data, utilizing safe initial state:', err);
      }
    }

    loadDataFromSupabase();

    return () => {
      isMounted = false;
    };
  }, []);

  // Pipeline Handlers (persists to Supabase job_applications)
  const handleUpdateStatus = async (id: string, newStatus: JobStatus) => {
    setApplications((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: newStatus } : app))
    );
    await updateJobApplicationStatus(id, newStatus);
  };

  const handleDeleteApplication = async (id: string) => {
    setApplications((prev) => prev.filter((app) => app.id !== id));
    await deleteJobApplicationFromDb(id);
  };

  const handleAddApplication = async (newApp: Omit<JobApplication, 'id' | 'createdAt'>) => {
    const created = await createJobApplication(newApp);
    setApplications((prev) => [created, ...prev]);
  };

  const handleSelectForTailoring = (app: JobApplication) => {
    setSelectedAppForTailoring(app);
    setActiveTab('resume');
  };

  // Profile Editor Handler: writes to master_profiles table
  const handleSaveProfile = async (updatedProfile: MasterProfile) => {
    setMasterProfile(updatedProfile);
    return await saveMasterProfileToDb(updatedProfile);
  };

  // Cold Email Handlers (explicit per-email sending, no automatic background sending)
  const handleSaveColdEmail = async (email: ColdEmail) => {
    const saved = await saveColdEmailToDb(email);
    setColdEmails((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
  };

  const handleDeleteColdEmail = async (id: string) => {
    setColdEmails((prev) => prev.filter((e) => e.id !== id));
    await deleteColdEmailFromDb(id);
  };

  const handleSendColdEmail = async (email: ColdEmail) => {
    await handleSaveColdEmail(email);
  };

  // Interviews and Offers Handlers
  const handleAddInterview = (newInt: Omit<Interview, 'id'>) => {
    const created: Interview = {
      ...newInt,
      id: `int-${Date.now()}`,
    };
    setInterviews((prev) => [created, ...prev]);
  };

  const handleAddOffer = (newOff: Omit<JobOffer, 'id'>) => {
    const created: JobOffer = {
      ...newOff,
      id: `off-${Date.now()}`,
    };
    setOffers((prev) => [created, ...prev]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        applicationCount={applications.length}
      />

      {/* Main Workspace View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Tab 1: Kanban Pipeline Board */}
        {activeTab === 'tracker' && (
          <KanbanBoard
            applications={applications}
            onUpdateStatus={handleUpdateStatus}
            onDeleteApplication={handleDeleteApplication}
            onSelectForTailoring={handleSelectForTailoring}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        )}

        {/* Tab 2: Job Board Scraper Service */}
        {activeTab === 'scraper' && (
          <JobScraperPanel
            onAddApplication={handleAddApplication}
            existingApplications={applications}
          />
        )}

        {/* Tab 3: Master Profile Editor (writes to master_profiles) */}
        {activeTab === 'profile' && (
          <ProfileEditor
            profile={masterProfile}
            onSaveProfile={handleSaveProfile}
          />
        )}

        {/* Tab 4: AI Tailored Resumes & Cover Letters */}
        {activeTab === 'resume' && (
          <ResumeCustomizer
            applications={applications}
            masterProfile={masterProfile}
            selectedApp={selectedAppForTailoring}
          />
        )}

        {/* Tab 5: Cold Email Review Queue (Explicit per-email send, no automatic sending) */}
        {activeTab === 'outreach' && (
          <ColdEmailQueue
            emails={coldEmails}
            applications={applications}
            masterProfile={masterProfile}
            onSaveEmail={handleSaveColdEmail}
            onDeleteEmail={handleDeleteColdEmail}
            onSendEmail={handleSendColdEmail}
          />
        )}

        {/* Tab 6: Interview Calendar */}
        {activeTab === 'interviews' && (
          <InterviewCalendar
            interviews={interviews}
            applications={applications}
            onAddInterview={handleAddInterview}
          />
        )}

        {/* Tab 7: Offer Calculator */}
        {activeTab === 'offers' && (
          <OfferCalculator
            offers={offers}
            applications={applications}
            onAddOffer={handleAddOffer}
          />
        )}

        {/* Tab 8: Analytics & Conversion Funnel */}
        {activeTab === 'analytics' && (
          <AnalyticsDashboard applications={applications} />
        )}

      </main>

      {/* Job URL Import Modal */}
      <JobImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onAddApplication={handleAddApplication}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 CareerPulse AI — All-in-One Job Hunting Suite</p>
          <div className="flex items-center space-x-4">
            <span className="hover:text-slate-400 cursor-pointer">Supabase DB Sync Ready</span>
            <span>•</span>
            <span className="hover:text-slate-400 cursor-pointer">Shared AI Battery Fallback Engine</span>
            <span>•</span>
            <span className="hover:text-slate-400 cursor-pointer">Human-in-the-Loop Outreach</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
