'use client';

import React, { useState } from 'react';
import { Interview, JobApplication } from '@/types';
import { Calendar as CalendarIcon, Plus, Clock, UserCheck, FileText, CheckCircle2 } from 'lucide-react';

interface InterviewCalendarProps {
  interviews: Interview[];
  applications: JobApplication[];
  onAddInterview: (interview: Omit<Interview, 'id'>) => void;
}

export const InterviewCalendar: React.FC<InterviewCalendarProps> = ({
  interviews,
  applications,
  onAddInterview,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState(applications[0]?.id || '');
  const [roundName, setRoundName] = useState('Technical System Design');
  const [scheduledAt, setScheduledAt] = useState('2026-08-10T14:00');
  const [interviewerNames, setInterviewerNames] = useState('');
  const [prepNotes, setPrepNotes] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const app = applications.find((a) => a.id === selectedAppId);
    if (!app) return;

    onAddInterview({
      jobApplicationId: selectedAppId,
      companyName: app.companyName,
      jobTitle: app.jobTitle,
      roundName,
      scheduledAt: new Date(scheduledAt).toISOString(),
      interviewerNames,
      prepNotes,
      status: 'scheduled',
    });

    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <CalendarIcon className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Interview Schedule & Prep Notes</h2>
            <p className="text-xs text-slate-400">Track interview rounds, interviewer details, and prep cheat sheets.</p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule Interview</span>
        </button>
      </div>

      {/* Interviews List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {interviews.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
            <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p>No interviews scheduled yet. Click 'Schedule Interview' to add one.</p>
          </div>
        ) : (
          interviews.map((int) => (
            <div
              key={int.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 relative overflow-hidden"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    {int.roundName}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">{int.companyName}</h3>
                  <p className="text-xs text-slate-400">{int.jobTitle}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  int.status === 'scheduled' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {int.status === 'scheduled' ? 'Upcoming' : 'Completed'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800">
                <div className="flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{new Date(int.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                {int.interviewerNames && (
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Interviewers: {int.interviewerNames}</span>
                  </div>
                )}
              </div>

              {int.prepNotes && (
                <div className="p-3 bg-slate-850 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
                  <span className="font-bold text-slate-400 text-[10px] uppercase block">Prep Notes</span>
                  <p>{int.prepNotes}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Interview Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Schedule New Interview Round</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Select Job Application</label>
                <select
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                >
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.jobTitle} @ {app.companyName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Round Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Technical Screen, System Design, HR"
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Interviewer Names</label>
                <input
                  type="text"
                  placeholder="Sarah Jenkins (Engineering Manager)"
                  value={interviewerNames}
                  onChange={(e) => setInterviewerNames(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Preparation Notes</label>
                <textarea
                  rows={3}
                  placeholder="Key topics to review, system design patterns, questions to ask..."
                  value={prepNotes}
                  onChange={(e) => setPrepNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white resize-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold"
                >
                  Save Interview
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
