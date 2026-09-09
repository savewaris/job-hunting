'use client';

import React from 'react';
import { 
  Kanban, 
  BarChart3, 
  FileText, 
  Calendar, 
  Calculator, 
  PlusCircle, 
  Briefcase,
  Sparkles,
  Compass,
  User,
  Mail,
  Database
} from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenImportModal: () => void;
  applicationCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenImportModal,
  applicationCount
}) => {
  const isDbReady = isSupabaseConfigured();

  const navItems = [
    { id: 'tracker', label: 'Pipeline Board', icon: Kanban, badge: applicationCount },
    { id: 'scraper', label: 'Scraper Service', icon: Compass },
    { id: 'profile', label: 'Profile Editor', icon: User },
    { id: 'resume', label: 'AI Tailor & Resume', icon: FileText },
    { id: 'outreach', label: 'Cold Email Queue', icon: Mail },
    { id: 'interviews', label: 'Interviews', icon: Calendar },
    { id: 'offers', label: 'Offer Calculator', icon: Calculator },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('tracker')}>
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                  CareerPulse AI
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-semibold border rounded-full flex items-center gap-1 ${
                  isDbReady 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  <Database className="w-2.5 h-2.5" />
                  {isDbReady ? 'DB Connected' : 'Local / Offline'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Full Stack Job Hunting Suite</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-blue-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Action Button */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('scraper')}
              className="hidden sm:flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Scraper</span>
            </button>
            <button
              onClick={onOpenImportModal}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all transform hover:-translate-y-0.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Import URL</span>
            </button>
          </div>

        </div>
      </div>

      {/* Responsive Horizontal Sub-nav for small screens */}
      <div className="lg:hidden flex overflow-x-auto border-t border-slate-800 px-2 py-1.5 space-x-1 bg-slate-900 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center whitespace-nowrap space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
