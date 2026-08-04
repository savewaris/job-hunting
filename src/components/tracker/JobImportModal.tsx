'use client';

import React, { useState } from 'react';
import { JobApplication, JobStatus } from '@/types';
import { X, Sparkles, Link, Building, Briefcase, MapPin, DollarSign, Loader2 } from 'lucide-react';

interface JobImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddApplication: (app: Omit<JobApplication, 'id' | 'createdAt'>) => void;
}

export const JobImportModal: React.FC<JobImportModalProps> = ({
  isOpen,
  onClose,
  onAddApplication,
}) => {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form Fields
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [salaryRange, setSalaryRange] = useState('');
  const [jobType, setJobType] = useState<'Full-time' | 'Remote' | 'Contract' | 'Hybrid'>('Full-time');
  const [status, setStatus] = useState<JobStatus>('wishlist');
  const [jobDescription, setJobDescription] = useState('');
  const [requirementsText, setRequirementsText] = useState('');

  if (!isOpen) return null;

  const handleParseUrl = async () => {
    if (!url && !rawText) {
      setError('Please provide a URL or paste job description text.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/parse-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, rawText }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        if (d.companyName) setCompanyName(d.companyName);
        if (d.jobTitle) setJobTitle(d.jobTitle);
        if (d.location) setLocation(d.location);
        if (d.salaryRange) setSalaryRange(d.salaryRange);
        if (d.jobType) setJobType(d.jobType);
        if (d.jobDescription) setJobDescription(d.jobDescription);
        if (d.requirements && Array.isArray(d.requirements)) {
          setRequirementsText(d.requirements.join(', '));
        }
      } else {
        setError('Failed to extract metadata automatically. Please fill manually.');
      }
    } catch (err: any) {
      setError('Error connecting to AI parser: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !jobTitle) {
      setError('Company Name and Job Title are required.');
      return;
    }

    const reqs = requirementsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    onAddApplication({
      companyName,
      jobTitle,
      jobUrl: url,
      location,
      salaryRange,
      jobType,
      status,
      matchScore: Math.floor(Math.random() * 20) + 80, // High candidate fit baseline
      jobDescription,
      requirements: reqs,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">Import Job & AI Parse</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Smart Link Parser Bar */}
          <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 space-y-3">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-blue-400" />
              <span>Job Posting URL (LinkedIn, Indeed, Company Site)</span>
            </label>
            <div className="flex space-x-2">
              <input
                type="url"
                placeholder="https://linkedin.com/jobs/view/123456"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleParseUrl}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Parsing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Parse URL</span>
                  </>
                )}
              </button>
            </div>
            {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span>Company Name *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stripe, OpenAI"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>Job Title *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Full Stack Engineer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Location</span>
                </label>
                <input
                  type="text"
                  placeholder="Remote / San Francisco"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  <span>Salary Range</span>
                </label>
                <input
                  type="text"
                  placeholder="$180,000 - $220,000"
                  value={salaryRange}
                  onChange={(e) => setSalaryRange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1 block">Job Type</label>
                <select
                  value={jobType}
                  onChange={(e: any) => setJobType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Remote">Remote</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">
                Key Skill Requirements (comma separated)
              </label>
              <input
                type="text"
                placeholder="React, Next.js, TypeScript, PostgreSQL, System Architecture"
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">Job Description</label>
              <textarea
                rows={3}
                placeholder="Paste key responsibilities or parsed output summary..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all"
              >
                Save to Application Pipeline
              </button>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
};
