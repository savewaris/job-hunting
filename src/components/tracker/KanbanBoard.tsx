'use client';

import React, { useState } from 'react';
import { JobApplication, JobStatus } from '@/types';
import { 
  Plus, 
  Search, 
  MapPin, 
  DollarSign, 
  Sparkles, 
  ExternalLink, 
  Calendar,
  MoreVertical,
  Trash2,
  FileCheck,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';

interface KanbanBoardProps {
  applications: JobApplication[];
  onUpdateStatus: (id: string, newStatus: JobStatus) => void;
  onDeleteApplication: (id: string) => void;
  onSelectForTailoring: (app: JobApplication) => void;
  onOpenImportModal: () => void;
}

const STAGES: { id: JobStatus; label: string; color: string; badgeBg: string }[] = [
  { id: 'wishlist', label: 'Wishlist', color: 'border-slate-500/40 text-slate-300', badgeBg: 'bg-slate-500/20 text-slate-300' },
  { id: 'applied', label: 'Applied', color: 'border-blue-500/40 text-blue-400', badgeBg: 'bg-blue-500/20 text-blue-400' },
  { id: 'interviewing', label: 'Interviewing', color: 'border-purple-500/40 text-purple-400', badgeBg: 'bg-purple-500/20 text-purple-400' },
  { id: 'offer', label: 'Offer Received', color: 'border-emerald-500/40 text-emerald-400', badgeBg: 'bg-emerald-500/20 text-emerald-400' },
  { id: 'rejected', label: 'Rejected', color: 'border-rose-500/40 text-rose-400', badgeBg: 'bg-rose-500/20 text-rose-400' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  applications,
  onUpdateStatus,
  onDeleteApplication,
  onSelectForTailoring,
  onOpenImportModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredApps = applications.filter((app) => {
    const matchesSearch = app.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || app.jobType === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search company, job title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Job Types</option>
            <option value="Remote">Remote</option>
            <option value="Full-time">Full-time</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Contract">Contract</option>
          </select>

          <button
            onClick={onOpenImportModal}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Job</span>
          </button>
        </div>
      </div>

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-6">
        {STAGES.map((stage) => {
          const stageApps = filteredApps.filter((a) => a.status === stage.id);
          
          return (
            <div
              key={stage.id}
              className="bg-slate-900/40 rounded-2xl p-3 border border-slate-800/80 min-h-[550px] flex flex-col"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${stage.badgeBg.split(' ')[0]}`} />
                  <h3 className="text-xs font-bold text-slate-200 tracking-wide uppercase">{stage.label}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${stage.badgeBg}`}>
                  {stageApps.length}
                </span>
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {stageApps.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                    <span>No applications</span>
                  </div>
                ) : (
                  stageApps.map((app) => (
                    <div
                      key={app.id}
                      className="group relative bg-slate-850 hover:bg-slate-800/90 border border-slate-700/60 hover:border-blue-500/50 rounded-xl p-3.5 shadow-md transition-all duration-200"
                    >
                      {/* Top Header */}
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors">
                            {app.jobTitle}
                          </h4>
                          <p className="text-xs font-medium text-slate-300">{app.companyName}</p>
                        </div>

                        {/* Match Score Badge */}
                        <div 
                          className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            app.matchScore >= 90
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : app.matchScore >= 80
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                          title="AI Candidate Match Percentage"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>{app.matchScore}%</span>
                        </div>
                      </div>

                      {/* Location & Salary */}
                      <div className="space-y-1 mb-3 text-[11px] text-slate-400">
                        {app.location && (
                          <div className="flex items-center space-x-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            <span className="truncate">{app.location}</span>
                          </div>
                        )}
                        {app.salaryRange && (
                          <div className="flex items-center space-x-1">
                            <DollarSign className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300 font-medium">{app.salaryRange}</span>
                          </div>
                        )}
                      </div>

                      {/* Requirements Tags */}
                      {app.requirements && app.requirements.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {app.requirements.slice(0, 3).map((req, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[10px]"
                            >
                              {req}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Quick Actions Footer */}
                      <div className="pt-2 border-t border-slate-700/40 flex items-center justify-between text-xs">
                        
                        <button
                          onClick={() => onSelectForTailoring(app)}
                          className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition-colors"
                        >
                          <FileCheck className="w-3 h-3" />
                          <span>Tailor Resume</span>
                        </button>

                        <div className="flex items-center space-x-1">
                          {/* Move Left */}
                          {stage.id !== 'wishlist' && (
                            <button
                              onClick={() => {
                                const currentIndex = STAGES.findIndex((s) => s.id === stage.id);
                                if (currentIndex > 0) {
                                  onUpdateStatus(app.id, STAGES[currentIndex - 1].id);
                                }
                              }}
                              title="Move to previous stage"
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Move Right */}
                          {stage.id !== 'rejected' && (
                            <button
                              onClick={() => {
                                const currentIndex = STAGES.findIndex((s) => s.id === stage.id);
                                if (currentIndex < STAGES.length - 1) {
                                  onUpdateStatus(app.id, STAGES[currentIndex + 1].id);
                                }
                              }}
                              title="Move to next stage"
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => onDeleteApplication(app.id)}
                            title="Delete application"
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>

                    </div>
                  ))
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
