'use client';

import React, { useState } from 'react';
import { JobApplication, ScrapedJob, ScraperSource } from '@/types';
import { 
  Compass, 
  Search, 
  Globe, 
  Sparkles, 
  Plus, 
  Check, 
  ExternalLink, 
  RefreshCw, 
  MapPin, 
  Building2, 
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface JobScraperPanelProps {
  onAddApplication: (app: Omit<JobApplication, 'id' | 'createdAt'>) => void;
  existingApplications: JobApplication[];
}

export const JobScraperPanel: React.FC<JobScraperPanelProps> = ({
  onAddApplication,
  existingApplications,
}) => {
  const [selectedSource, setSelectedSource] = useState<ScraperSource>('all');
  const [locationFilter, setLocationFilter] = useState<'thailand-remote' | 'thailand-only' | 'worldwide-remote'>('thailand-remote');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedJobs, setScrapedJobs] = useState<ScrapedJob[]>([]);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(
    new Set(existingApplications.map((a) => a.jobUrl).filter(Boolean) as string[])
  );
  const [sourcesChecked, setSourcesChecked] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRunScraper = async () => {
    setIsScraping(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/jobs/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: selectedSource === 'all' ? undefined : [selectedSource],
          locationFilter,
          persistToDb: true, // writes to job_applications
        }),
      });

      const json = await res.json();
      if (json.success) {
        setScrapedJobs(json.data || []);
        setSourcesChecked(json.sourcesChecked || []);
        setStatusMessage(`Successfully scraped and synchronized ${json.count || 0} jobs across Greenhouse, Lever, Ashby, RemoteOK, and Arbeitnow!`);
      } else {
        setStatusMessage(`Scraper notice: ${json.error || 'Check network connection'}`);
      }
    } catch (err: any) {
      setStatusMessage(`Scraper error: ${err?.message || 'Failed to connect to scraper endpoint'}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleImportSingle = (job: ScrapedJob) => {
    onAddApplication({
      companyName: job.companyName,
      jobTitle: job.jobTitle,
      jobUrl: job.jobUrl,
      location: job.location,
      jobType: job.jobType,
      salaryRange: job.salaryRange || '$120,000 - $170,000',
      status: 'wishlist',
      matchScore: job.matchScore,
      jobDescription: job.jobDescription,
      requirements: job.requirements,
    });

    setImportedUrls((prev) => new Set([...prev, job.jobUrl]));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Top Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-xl">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Job Board Scraper Service
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                  writes to job_applications
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Pulls live job postings from Greenhouse, Lever, Ashby, RemoteOK, and Arbeitnow with Thailand & remote filters.
              </p>
            </div>
          </div>

          <button
            onClick={handleRunScraper}
            disabled={isScraping}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-cyan-600/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isScraping ? 'animate-spin' : ''}`} />
            <span>{isScraping ? 'Scraping Live Boards...' : 'Run Scraper Now'}</span>
          </button>
        </div>

        {/* Controls and Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Target Sources</span>
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as ScraperSource)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Platforms (Greenhouse, Lever, Ashby, RemoteOK, Arbeitnow)</option>
              <option value="remoteok">RemoteOK API</option>
              <option value="arbeitnow">Arbeitnow API</option>
              <option value="greenhouse">Greenhouse Boards</option>
              <option value="lever">Lever Postings</option>
              <option value="ashby">Ashby Job Boards</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Location Restriction</span>
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="thailand-remote">Thailand & Worldwide/APAC Remote</option>
              <option value="thailand-only">Thailand Specific Only (Bangkok / TH)</option>
              <option value="worldwide-remote">Worldwide Remote (Anywhere)</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-slate-300 font-semibold">Active Filter:</span> Thailand, Bangkok, APAC & Worldwide Remote positions. Excludes strict non-remote roles.
            </div>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className="p-4 bg-slate-900/90 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs flex items-center space-x-3">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Scraped Results Display */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">
            Scraped Opportunities {scrapedJobs.length > 0 && `(${scrapedJobs.length} found)`}
          </h2>
          {sourcesChecked.length > 0 && (
            <div className="text-xs text-slate-400 flex items-center space-x-1.5">
              <span>Sources queried:</span>
              <span className="text-blue-400">{sourcesChecked.join(', ')}</span>
            </div>
          )}
        </div>

        {scrapedJobs.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl">
            <Globe className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-300 font-medium">Ready to scrape target job boards</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Click &quot;Run Scraper Now&quot; to fetch real-time listings from Greenhouse, Lever, Ashby, RemoteOK, and Arbeitnow filtered for Thailand & remote roles.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scrapedJobs.map((job) => {
              const alreadyImported = importedUrls.has(job.jobUrl);
              return (
                <div
                  key={job.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {job.companyName}
                          </span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {job.source}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-0.5">{job.jobTitle}</h3>
                      </div>

                      <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {job.matchScore}% Match
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-400" />
                        {job.location}
                      </span>
                      {job.salaryRange && (
                        <span>• {job.salaryRange}</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                      {job.jobDescription}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.requirements.map((req, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60"
                        >
                          {req}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                    <a
                      href={job.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                    >
                      <span>View Posting</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      onClick={() => handleImportSingle(job)}
                      disabled={alreadyImported}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        alreadyImported
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {alreadyImported ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>In Pipeline</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Add to Pipeline</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
