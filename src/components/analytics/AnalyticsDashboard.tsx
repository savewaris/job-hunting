'use client';

import React from 'react';
import { JobApplication } from '@/types';
import { 
  BarChart3, 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Award,
  Sparkles,
  Percent
} from 'lucide-react';

interface AnalyticsDashboardProps {
  applications: JobApplication[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ applications }) => {
  const total = applications.length;
  const appliedCount = applications.filter((a) => a.status !== 'wishlist').length;
  const interviewingCount = applications.filter((a) => a.status === 'interviewing').length;
  const offerCount = applications.filter((a) => a.status === 'offer').length;
  const rejectedCount = applications.filter((a) => a.status === 'rejected').length;

  const responseRate = appliedCount > 0 ? Math.round(((interviewingCount + offerCount + rejectedCount) / appliedCount) * 100) : 0;
  const interviewRate = appliedCount > 0 ? Math.round(((interviewingCount + offerCount) / appliedCount) * 100) : 0;
  const offerRate = appliedCount > 0 ? Math.round((offerCount / appliedCount) * 100) : 0;

  const avgMatchScore = total > 0 
    ? Math.round(applications.reduce((acc, curr) => acc + curr.matchScore, 0) / total)
    : 0;

  return (
    <div className="space-y-6">
      
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Active Suite Jobs</span>
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-white">{total}</p>
          <p className="text-[11px] text-slate-400">{appliedCount} Submitted Applications</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Interview Conversion</span>
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-300">{interviewRate}%</p>
          <p className="text-[11px] text-slate-400">{interviewingCount + offerCount} Reached Interview Stage</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Offer Win Rate</span>
            <Award className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-300">{offerRate}%</p>
          <p className="text-[11px] text-slate-400">{offerCount} Received Official Offers</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Avg AI Match Fit</span>
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-300">{avgMatchScore}%</p>
          <p className="text-[11px] text-slate-400">Average alignment across portfolio</p>
        </div>

      </div>

      {/* Conversion Funnel & Stage Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Funnel Progress */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span>Job Application Conversion Funnel</span>
          </h3>

          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Total Applications Submitted</span>
                <span className="text-slate-400">{appliedCount}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div className="bg-blue-500 h-3 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Employer Response Received</span>
                <span className="text-slate-400">{responseRate}% ({interviewingCount + offerCount + rejectedCount})</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div className="bg-indigo-500 h-3 rounded-full" style={{ width: `${responseRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Interviewing Stage</span>
                <span className="text-slate-400">{interviewRate}% ({interviewingCount + offerCount})</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div className="bg-purple-500 h-3 rounded-full" style={{ width: `${interviewRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Final Offers Received</span>
                <span className="text-emerald-400">{offerRate}% ({offerCount})</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div className="bg-emerald-500 h-3 rounded-full" style={{ width: `${offerRate}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Stage Status Breakdown Cards */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Pipeline Distribution</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-slate-850 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Wishlist</span>
              <p className="text-xl font-bold text-slate-200">
                {applications.filter((a) => a.status === 'wishlist').length}
              </p>
            </div>

            <div className="p-4 bg-slate-850 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[11px] text-blue-400 font-semibold uppercase">Applied</span>
              <p className="text-xl font-bold text-blue-300">
                {applications.filter((a) => a.status === 'applied').length}
              </p>
            </div>

            <div className="p-4 bg-slate-850 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[11px] text-purple-400 font-semibold uppercase">Interviewing</span>
              <p className="text-xl font-bold text-purple-300">
                {interviewingCount}
              </p>
            </div>

            <div className="p-4 bg-slate-850 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[11px] text-emerald-400 font-semibold uppercase">Offers</span>
              <p className="text-xl font-bold text-emerald-300">
                {offerCount}
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
