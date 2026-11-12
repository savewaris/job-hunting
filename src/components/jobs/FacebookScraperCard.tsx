'use client';

import React, { useState, useEffect } from 'react';
import { ScrapedJob } from '@/types/job';
import { 
  Sparkles, 
  ExternalLink, 
  Play, 
  RefreshCw, 
  Mail, 
  MessageSquare, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  ShieldCheck, 
  LogIn, 
  ArrowDownCircle, 
  MapPin, 
  DollarSign, 
  Terminal,
  Clock
} from 'lucide-react';

interface FacebookScraperCardProps {
  initialJobs: ScrapedJob[];
}

export default function FacebookScraperCard({ initialJobs }: FacebookScraperCardProps) {
  const [jobs, setJobs] = useState<ScrapedJob[]>(initialJobs);
  const [postUrl, setPostUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [isParsingText, setIsParsingText] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(initialJobs[0]?.id || null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Poll for newly scraped jobs from CLI every 4 seconds
  const fetchLatestJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (data.success && data.jobs) {
        setJobs(data.jobs);
      }
    } catch (e) {}
  };

  useEffect(() => {
    const interval = setInterval(fetchLatestJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchLatestJobs();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Quick Parse Raw Text
  const handleQuickParseText = async () => {
    if (!rawText.trim()) return;
    setIsParsingText(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, postUrl: postUrl || 'https://facebook.com/groups/thai.programmer.jobs' })
      });
      const data = await res.json();
      if (data.success && data.job) {
        setJobs(prev => [data.job, ...prev]);
        setRawText('');
        setExpandedJobId(data.job.id);
        setStatusMessage('✓ Facebook post text parsed & saved!');
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsParsingText(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono font-semibold mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            FEATURE 2 • HIGH-YIELD SOURCING
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            Facebook Post Sourcing & Dedicated CLI Scraper
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Thai tech hiring thrives on Facebook groups. Run the standalone CLI tool directly in your terminal to scroll your feed with zero bot blocks, or paste raw post text below.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-400 text-xs font-mono transition-all flex items-center gap-1.5"
            title="Refresh jobs from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-400">
            {jobs.length} Verified Jobs
          </span>
        </div>
      </div>

      {/* Terminal Command Center Card (Option C Implementation) */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider">
            <Terminal className="w-4 h-4" />
            <span>Standalone Playwright CLI Runner</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Direct Terminal Execution
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          To bypass browser-process locks, run the scraper directly in your terminal. Playwright opens a real Chrome window on your screen where you can scroll freely, and whenever you see a job post, press <code className="text-cyan-300 font-mono bg-slate-900 px-1 py-0.5 rounded border border-slate-800">[Enter]</code> in the terminal to capture it!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Command 1: Interactive Feed Mode */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono text-slate-500 block mb-0.5">1. INTERACTIVE FEED MODE (SCROLL & CAPTURE)</span>
              <code className="text-xs font-mono text-cyan-300 font-bold">npm run scrape:fb</code>
            </div>
            <button
              onClick={() => handleCopy('npm run scrape:fb', 'cmd-1')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              title="Copy Command"
            >
              {copiedId === 'cmd-1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Command 2: Direct Single Post */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono text-slate-500 block mb-0.5">2. DIRECT SINGLE POST URL</span>
              <code className="text-xs font-mono text-cyan-300 font-bold">npm run scrape:fb -- --url &lt;link&gt;</code>
            </div>
            <button
              onClick={() => handleCopy('npm run scrape:fb -- --url ', 'cmd-2')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
              title="Copy Command"
            >
              {copiedId === 'cmd-2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Paste Post Text Box */}
      <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
        <label className="block text-xs font-mono font-semibold text-slate-300">
          OR QUICK-PASTE FACEBOOK POST TEXT (NO BROWSER NEEDED)
        </label>
        <p className="text-[11px] text-slate-400">
          Copy any Thai or English job post from your mobile Facebook app or browser and paste it here. Extracts Title, Company, Salary in THB, Tech Stack, and HR Email/LINE ID in 1 second.
        </p>
        <textarea
          rows={3}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste raw post text here (e.g. [รับสมัครงาน] Full Stack Developer 45k - 70k ติดต่อ hr@company.com หรือ Line @hr)..."
          className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={handleQuickParseText}
            disabled={isParsingText || !rawText.trim()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-200 disabled:opacity-40"
          >
            {isParsingText ? 'Parsing...' : 'Parse Post Text & Add to Dashboard'}
          </button>
          {statusMessage && (
            <span className="text-xs font-mono text-cyan-400">{statusMessage}</span>
          )}
        </div>
      </div>

      {/* Captured Jobs Feed */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>Captured Job Opportunities</span>
            <span className="text-xs font-normal text-slate-500">({jobs.length} verified)</span>
          </h3>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs font-mono text-slate-500">
            No jobs in your feed yet. Run <code className="text-cyan-300">npm run scrape:fb</code> in your terminal or paste post text above!
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => {
              const isExpanded = expandedJobId === job.id;

              return (
                <div
                  key={job.id}
                  className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-blue-500/40 transition-all space-y-4"
                >
                  {/* Job Card Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                        <span className="font-sans font-black">f</span> Facebook Job Post
                      </span>
                      <span className="text-xs font-mono text-slate-500">
                        {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {job.jobUrl && !job.jobUrl.includes('sample') && (
                        <a
                          href={job.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-cyan-300 transition-all"
                        >
                          <span>View Original Facebook Post</span>
                          <ExternalLink className="w-3 h-3 text-cyan-400" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Title & Company */}
                  <div>
                    <h4 className="text-lg font-bold text-white flex items-center gap-2">
                      {job.jobTitle}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                      <span className="text-slate-200 font-semibold">{job.companyName}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        {job.location}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                        <DollarSign className="w-3 h-3 text-emerald-500" />
                        {job.salaryRange || 'Negotiable'}
                      </span>
                    </div>
                  </div>

                  {/* Tech Stack Pills */}
                  {job.requirements && job.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.requirements.map((req, rIdx) => (
                        <span
                          key={rIdx}
                          className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-cyan-300 text-[11px] font-mono"
                        >
                          {req}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Contact Methods / Direct Application Strip */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {job.contactMethod?.type === 'email' && (
                        <a
                          href={`mailto:${job.contactMethod.value}?subject=Application for ${encodeURIComponent(job.jobTitle)} - Save Waris`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-semibold hover:bg-emerald-500/20 transition-all"
                        >
                          <Mail className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Email HR: {job.contactMethod.value}</span>
                        </a>
                      )}

                      {job.contactMethod?.type === 'line' && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-xs font-mono font-semibold">
                          <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                          <span>LINE ID: {job.contactMethod.value}</span>
                          <button
                            onClick={() => handleCopy(job.contactMethod!.value, `line-${job.id}`)}
                            className="ml-1 p-0.5 hover:text-white"
                          >
                            {copiedId === `line-${job.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      className="text-xs font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                      <span>{isExpanded ? 'Hide Raw Post' : 'Inspect Raw Post Text'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expandable Raw Post Text */}
                  {isExpanded && (
                    <div className="mt-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-line leading-relaxed">
                      <div className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                        <span>Raw Post Content</span>
                        <span className="text-cyan-400">100% Genuine Text</span>
                      </div>
                      {job.rawPostContent || job.jobDescription}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
