'use client';

import React, { useState, useEffect } from 'react';
import { JobApplication, MasterProfile } from '@/types';
import { 
  Sparkles, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Copy, 
  Check, 
  Download, 
  Wand2, 
  Briefcase,
  User,
  Loader2
} from 'lucide-react';

interface ResumeCustomizerProps {
  applications: JobApplication[];
  masterProfile: MasterProfile;
  selectedApp: JobApplication | null;
}

export const ResumeCustomizer: React.FC<ResumeCustomizerProps> = ({
  applications,
  masterProfile,
  selectedApp,
}) => {
  const [currentAppId, setCurrentAppId] = useState<string>(
    selectedApp?.id || (applications.length > 0 ? applications[0].id : '')
  );

  useEffect(() => {
    if (selectedApp) {
      setCurrentAppId(selectedApp.id);
    }
  }, [selectedApp]);

  const activeApp = applications.find((a) => a.id === currentAppId) || applications[0];

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // AI Tailor State
  const [aiData, setAiData] = useState<{
    matchScore: number;
    missingSkills: string[];
    matchReasons: string[];
    tailoredSummary: string;
    coverLetter: string;
    suggestedBullets: string[];
  } | null>(null);

  const handleGenerateTailoredPackage = async () => {
    if (!activeApp) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ai-tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterProfile,
          jobDescription: activeApp.jobDescription,
          jobTitle: activeApp.jobTitle,
          companyName: activeApp.companyName,
          requirements: activeApp.requirements,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setAiData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeApp) {
      handleGenerateTailoredPackage();
    }
  }, [currentAppId]);

  const handleCopyCoverLetter = () => {
    if (aiData?.coverLetter) {
      navigator.clipboard.writeText(aiData.coverLetter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!activeApp) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
        <FileText className="w-12 h-12 mx-auto mb-3 text-slate-600" />
        <p>No job applications available for resume tailoring. Please add a job posting first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header Selector Bar */}
      <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <Wand2 className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">AI Resume & Cover Letter Customizer</h2>
            <p className="text-xs text-slate-400">Tailor your candidate resume & cover letter to pass ATS & impress hiring managers.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">Target Role:</label>
          <select
            value={currentAppId}
            onChange={(e) => setCurrentAppId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium max-w-xs"
          >
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.jobTitle} @ {app.companyName}
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerateTailoredPackage}
            disabled={loading}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-purple-600/25 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{loading ? 'Analyzing...' : 'Re-Run AI Match'}</span>
          </button>
        </div>

      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: AI Match Score & Skills Gap */}
        <div className="space-y-6">
          
          {/* Match Score Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">ATS Fit & Match Analysis</h3>
              <span className="text-xs font-medium text-slate-400">{activeApp.companyName}</span>
            </div>

            <div className="flex items-center space-x-4 p-4 bg-slate-850 rounded-xl border border-slate-800">
              <div className="relative w-16 h-16 flex items-center justify-center bg-purple-500/10 border-2 border-purple-500 rounded-full">
                <span className="text-lg font-black text-purple-300">
                  {aiData?.matchScore || activeApp.matchScore}%
                </span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Strong Candidate Fit</h4>
                <p className="text-xs text-slate-400">High probability of passing automated screening filters.</p>
              </div>
            </div>

            {/* Missing Skills Warning */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Identified Skill Gaps (To Highlight / Learn)</span>
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {aiData?.missingSkills?.map((skill, i) => (
                  <span key={i} className="px-2 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-md text-xs font-medium">
                    + {skill}
                  </span>
                )) || <span className="text-xs text-slate-500">None detected</span>}
              </div>
            </div>

            {/* Match Drivers */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Core Match Drivers</span>
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {aiData?.matchReasons?.map((reason, i) => (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="text-emerald-400 mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Master Profile Summary Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Master Candidate Profile</span>
            </h3>
            <div className="text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-200">{masterProfile.fullName}</p>
              <p>{masterProfile.targetTitle}</p>
              <div className="pt-2 flex flex-wrap gap-1">
                {masterProfile.skills.slice(0, 8).map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Right 2 Columns: Tailored Resume & Cover Letter */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tailored Executive Summary & Bullets */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span>Tailored Resume Highlights for {activeApp.companyName}</span>
              </h3>
              <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full font-medium">
                Targeted Resume Version
              </span>
            </div>

            {/* Executive Summary */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase mb-1 block">Tailored Professional Summary</label>
              <div className="p-3.5 bg-slate-850 rounded-xl border border-slate-700/60 text-xs text-slate-200 leading-relaxed">
                {aiData?.tailoredSummary || 'Generating tailored summary based on master candidate experience...'}
              </div>
            </div>

            {/* Suggested Bullets */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase mb-1 block">Custom Targeted Accomplishment Bullets</label>
              <div className="space-y-2">
                {aiData?.suggestedBullets?.map((bullet, i) => (
                  <div key={i} className="p-3 bg-slate-850 rounded-xl border border-slate-700/50 text-xs text-slate-200 flex items-start space-x-2">
                    <span className="text-purple-400 font-bold">•</span>
                    <span className="flex-1">{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Generated Cover Letter */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>AI Custom Cover Letter</span>
              </h3>
              
              <button
                onClick={handleCopyCoverLetter}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {aiData?.coverLetter || 'Drafting custom cover letter...'}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
