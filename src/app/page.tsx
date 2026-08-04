'use client';

import React, { useState } from 'react';
import { JobApplication, JobStatus, MasterProfile, Interview, JobOffer } from '@/types';
import { INITIAL_APPLICATIONS, MOCK_MASTER_PROFILE, MOCK_INTERVIEWS, MOCK_OFFERS } from '@/lib/mockData';
import { Navbar } from '@/components/layout/Navbar';
import { KanbanBoard } from '@/components/tracker/KanbanBoard';
import { JobImportModal } from '@/components/tracker/JobImportModal';
import { ResumeCustomizer } from '@/components/ai/ResumeCustomizer';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { InterviewCalendar } from '@/components/interviews/InterviewCalendar';
import { OfferCalculator } from '@/components/offers/OfferCalculator';

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('tracker');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Application Pipeline State
  const [applications, setApplications] = useState<JobApplication[]>(INITIAL_APPLICATIONS);
  const [masterProfile, setMasterProfile] = useState<MasterProfile>(MOCK_MASTER_PROFILE);
  const [interviews, setInterviews] = useState<Interview[]>(MOCK_INTERVIEWS);
  const [offers, setOffers] = useState<JobOffer[]>(MOCK_OFFERS);

  const [selectedAppForTailoring, setSelectedAppForTailoring] = useState<JobApplication | null>(null);

  // Pipeline Handlers
  const handleUpdateStatus = (id: string, newStatus: JobStatus) => {
    setApplications((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: newStatus } : app))
    );
  };

  const handleDeleteApplication = (id: string) => {
    setApplications((prev) => prev.filter((app) => app.id !== id));
  };

  const handleAddApplication = (newApp: Omit<JobApplication, 'id' | 'createdAt'>) => {
    const created: JobApplication = {
      ...newApp,
      id: `app-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setApplications((prev) => [created, ...prev]);
  };

  const handleSelectForTailoring = (app: JobApplication) => {
    setSelectedAppForTailoring(app);
    setActiveTab('resume');
  };

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
        
        {activeTab === 'tracker' && (
          <KanbanBoard
            applications={applications}
            onUpdateStatus={handleUpdateStatus}
            onDeleteApplication={handleDeleteApplication}
            onSelectForTailoring={handleSelectForTailoring}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard applications={applications} />
        )}

        {activeTab === 'resume' && (
          <ResumeCustomizer
            applications={applications}
            masterProfile={masterProfile}
            selectedApp={selectedAppForTailoring}
          />
        )}

        {activeTab === 'interviews' && (
          <InterviewCalendar
            interviews={interviews}
            applications={applications}
            onAddInterview={handleAddInterview}
          />
        )}

        {activeTab === 'offers' && (
          <OfferCalculator
            offers={offers}
            applications={applications}
            onAddOffer={handleAddOffer}
          />
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
            <span className="hover:text-slate-400 cursor-pointer">Google Gemini AI Engine</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
