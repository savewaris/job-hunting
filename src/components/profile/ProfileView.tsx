'use client';

import React, { useState } from 'react';
import { MasterProfile } from '@/types/profile';
import { 
  User, 
  RefreshCw, 
  Briefcase, 
  GraduationCap, 
  Code, 
  FolderGit2, 
  CheckCircle2, 
  ExternalLink, 
  Globe, 
  Mail, 
  Phone, 
  MapPin, 
  Sparkles, 
  Check, 
  AlertCircle,
  Clock
} from 'lucide-react';

interface ProfileViewProps {
  initialProfile: MasterProfile;
}

export default function ProfileView({ initialProfile }: ProfileViewProps) {
  const [profile, setProfile] = useState<MasterProfile>(initialProfile);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus('idle');
    try {
      const res = await fetch('/api/profile/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 4000);
      } else {
        setSyncStatus('error');
      }
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      
      {/* 1. Feature Progression Stepper */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">
              Step-by-Step Feature Build • Active Feature
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Source of Truth: <code className="text-cyan-300">PersonalWebsite (Neon DB)</code>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold truncate">1. Master Profile</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600"></span>
            <span className="truncate">2. Job Sourcing</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600"></span>
            <span className="truncate">3. ATS Matcher</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600"></span>
            <span className="truncate">4. Tailoring & PDF</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-600"></span>
            <span className="truncate">5. Browser Apply</span>
          </div>
        </div>
      </div>

      {/* 2. Hero Candidate Banner */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono font-medium">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              Verified Master Candidate Profile
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
              {profile.fullName}
              <span className="text-base sm:text-lg font-normal text-slate-400">
                ({profile.preferredName || 'Save Waris'})
              </span>
            </h1>
            <p className="text-sm sm:text-base text-cyan-400 font-medium">
              {profile.headline}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 font-mono">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                {profile.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                {profile.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Synced: {new Date(profile.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all border shadow-lg ${
                syncStatus === 'success'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:border-cyan-500/50'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
              {isSyncing ? 'Syncing...' : syncStatus === 'success' ? 'Profile Updated!' : 'Re-sync from PersonalWebsite'}
            </button>
          </div>
        </div>

        {/* Target Preferences Strip */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <span className="text-slate-500 block mb-1 text-[11px]">TARGET ROLES</span>
            <span className="text-slate-200 font-medium">{profile.preferences?.targetRoles?.join(', ') || 'Full Stack, Frontend, AI Engineer'}</span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <span className="text-slate-500 block mb-1 text-[11px]">LOCATIONS</span>
            <span className="text-slate-200 font-medium">{profile.preferences?.targetLocations?.join(' | ') || 'Bangkok / Remote'}</span>
          </div>
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <span className="text-slate-500 block mb-1 text-[11px]">TARGET SALARY BASE</span>
            <span className="text-emerald-400 font-bold">฿{profile.preferences?.minSalaryTHB?.toLocaleString() || '50,000'}+ / month</span>
          </div>
        </div>
      </div>

      {/* 3. Bento Grid: Experience, Education, Skills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Experience & Education */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Experience Section */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white tracking-wide">Work Experience</h2>
            </div>

            <div className="space-y-4">
              {profile.experiences.map((exp, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                    <h3 className="font-bold text-slate-100 text-sm">{exp.role}</h3>
                    <span className="text-[11px] font-mono text-cyan-400">
                      {exp.startDate} – {exp.endDate || 'Present'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono mb-2">
                    {exp.company} • {exp.location} ({exp.employmentType})
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                    {exp.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Education Section */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-bold text-white tracking-wide">Education</h2>
            </div>

            <div className="space-y-3">
              {profile.education.map((edu, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/60 flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-100 text-sm">{edu.degree} in {edu.fieldOfStudy}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{edu.institution}</p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    {edu.startDate} – {edu.endDate || 'Present'}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right 1 Col: Technical Skills & Socials */}
        <div className="space-y-6">
          
          {/* Technical Skills */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <Code className="w-4 h-4 text-purple-400" />
              <h2 className="text-base font-bold text-white tracking-wide">Technical Skills</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-purple-950/30 border border-purple-800/40 text-purple-300 text-xs font-mono font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Verified Social Channels */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-bold text-white tracking-wide">Verified Links</h2>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {profile.socials.map((social, idx) => (
                <a
                  key={idx}
                  href={social.url.startsWith('http') ? social.url : `mailto:${social.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/60 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 flex items-center justify-between transition-all"
                >
                  <span>{social.platform}</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* 4. Portfolio Projects Showcase (Imported from PersonalWebsite) */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              Portfolio Projects ({profile.projects.length})
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">Imported from PersonalWebsite</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.projects.map((proj, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:border-cyan-500/40 transition-all flex flex-col justify-between"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-100 mb-1">{proj.title}</h3>
                <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed mb-3">
                  {proj.description.replace(/[-*#]/g, '')}
                </p>
              </div>
              {proj.tags && (
                <div className="pt-2 border-t border-slate-800/50 flex flex-wrap gap-1.5">
                  {proj.tags.split(',').slice(0, 4).map((tag, tIdx) => (
                    <span key={tIdx} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Roadmap Prompt */}
      <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-center justify-between gap-4">
        <div className="text-xs font-mono">
          <span className="text-cyan-400 font-bold block">Next Feature Ready to Build:</span>
          <span className="text-slate-400">Feature 2: Live Job Sourcing Engine (Greenhouse, Ashby, JobsDB, RemoteOK)</span>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold">
          Feature 1 Complete ✓
        </div>
      </div>

    </div>
  );
}
