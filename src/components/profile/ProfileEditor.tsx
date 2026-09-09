'use client';

import React, { useState } from 'react';
import { MasterProfile } from '@/types';
import { 
  User, 
  Briefcase, 
  GraduationCap, 
  FolderGit2, 
  Save, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Sparkles, 
  X,
  Code2,
  Mail,
  AlertCircle
} from 'lucide-react';

interface ProfileEditorProps {
  profile: MasterProfile;
  onSaveProfile: (profile: MasterProfile) => Promise<boolean> | void;
}

const POPULAR_SKILLS = [
  'TypeScript', 'React', 'Next.js', 'Node.js', 'Python', 'Tailwind CSS',
  'PostgreSQL', 'Supabase', 'GraphQL', 'Docker', 'AWS', 'System Architecture',
  'AI Agents', 'LLM Integration', 'REST APIs', 'CI/CD', 'Git'
];

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ profile, onSaveProfile }) => {
  const [formData, setFormData] = useState<MasterProfile>(profile);
  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Skill Add / Remove Handlers
  const handleAddSkill = (skillToAdd?: string) => {
    const skill = (skillToAdd || newSkill).trim();
    if (!skill) return;
    if (!formData.skills.includes(skill)) {
      setFormData((prev) => ({
        ...prev,
        skills: [...prev.skills, skill],
      }));
    }
    setNewSkill('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skillToRemove),
    }));
  };

  // Experience Handlers
  const handleAddExperience = () => {
    const newExp = {
      id: `exp-${Date.now()}`,
      company: '',
      role: '',
      dates: '2024 - Present',
      achievements: ['Spearheaded engineering architecture for core platform modules.'],
    };
    setFormData((prev) => ({
      ...prev,
      experiences: [newExp, ...prev.experiences],
    }));
  };

  const handleUpdateExperience = (id: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) =>
        exp.id === id ? { ...exp, [field]: value } : exp
      ),
    }));
  };

  const handleRemoveExperience = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((exp) => exp.id !== id),
    }));
  };

  const handleAddAchievement = (expId: string) => {
    setFormData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) =>
        exp.id === expId
          ? { ...exp, achievements: [...exp.achievements, ''] }
          : exp
      ),
    }));
  };

  const handleUpdateAchievement = (expId: string, idx: number, val: string) => {
    setFormData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => {
        if (exp.id !== expId) return exp;
        const copy = [...exp.achievements];
        copy[idx] = val;
        return { ...exp, achievements: copy };
      }),
    }));
  };

  const handleRemoveAchievement = (expId: string, idx: number) => {
    setFormData((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp) => {
        if (exp.id !== expId) return exp;
        return {
          ...exp,
          achievements: exp.achievements.filter((_, i) => i !== idx),
        };
      }),
    }));
  };

  // Education Handlers
  const handleAddEducation = () => {
    const newEdu = {
      id: `edu-${Date.now()}`,
      institution: '',
      degree: '',
      year: `${new Date().getFullYear()}`,
    };
    setFormData((prev) => ({
      ...prev,
      education: [...prev.education, newEdu],
    }));
  };

  const handleUpdateEducation = (id: string, field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.map((edu) =>
        edu.id === id ? { ...edu, [field]: value } : edu
      ),
    }));
  };

  const handleRemoveEducation = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      education: prev.education.filter((edu) => edu.id !== id),
    }));
  };

  // Projects Handlers
  const handleAddProject = () => {
    const newProj = {
      id: `proj-${Date.now()}`,
      name: '',
      description: '',
      techStack: ['TypeScript', 'Next.js'],
      link: '',
    };
    setFormData((prev) => ({
      ...prev,
      projects: [...prev.projects, newProj],
    }));
  };

  const handleUpdateProject = (id: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) =>
        proj.id === id ? { ...proj, [field]: value } : proj
      ),
    }));
  };

  const handleRemoveProject = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      projects: prev.projects.filter((proj) => proj.id !== id),
    }));
  };

  // Save Master Profile to DB
  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      await onSaveProfile(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save master profile to database');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Master Candidate Profile
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                  writes to master_profiles
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Single source of truth for resume tailoring, cover letter customization, and cold outreach.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>Saved to master_profiles!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Master Profile'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Notifications */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-sm flex items-center space-x-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Profile changes successfully persisted to Supabase <code>master_profiles</code> table.</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Section 1: Personal Overview */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
          <User className="w-4 h-4 text-blue-400" />
          <span>Personal & Target Role Details</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="e.g. Alex Waris"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="alex.waris@example.com"
              />
              <Mail className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Target Job Title</label>
            <input
              type="text"
              value={formData.targetTitle}
              onChange={(e) => setFormData({ ...formData, targetTitle: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="e.g. Senior Full Stack & AI Engineer"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Executive Summary</label>
          <textarea
            rows={4}
            value={formData.summary}
            onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors leading-relaxed"
            placeholder="High impact summary of your technical leadership, years of experience, core domains..."
          />
        </div>
      </section>

      {/* Section 2: Skills Management */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Code2 className="w-4 h-4 text-indigo-400" />
            <span>Master Skills Matrix ({formData.skills.length} skills)</span>
          </h2>
        </div>

        {/* Input box */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
            placeholder="Type a skill and press Enter..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => handleAddSkill()}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-medium flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </div>

        {/* Popular chips */}
        <div className="space-y-1.5">
          <span className="text-xs text-slate-400">Quick add popular tech:</span>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_SKILLS.filter((s) => !formData.skills.includes(s)).slice(0, 10).map((skill) => (
              <button
                key={skill}
                onClick={() => handleAddSkill(skill)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center space-x-1 transition-colors"
              >
                <Plus className="w-3 h-3 text-slate-400" />
                <span>{skill}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Active skills tags */}
        <div className="flex flex-wrap gap-2 pt-2">
          {formData.skills.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs px-3 py-1.5 rounded-xl font-medium"
            >
              <span>{skill}</span>
              <button
                onClick={() => handleRemoveSkill(skill)}
                className="hover:text-rose-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Section 3: Work Experiences */}
      <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Briefcase className="w-4 h-4 text-emerald-400" />
            <span>Work Experiences</span>
          </h2>
          <button
            onClick={handleAddExperience}
            className="flex items-center space-x-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Experience</span>
          </button>
        </div>

        <div className="space-y-6">
          {formData.experiences.map((exp) => (
            <div
              key={exp.id}
              className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3 relative group"
            >
              <button
                onClick={() => handleRemoveExperience(exp.id)}
                className="absolute top-4 right-4 text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-colors"
                title="Remove experience"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-8">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Company</label>
                  <input
                    type="text"
                    value={exp.company}
                    onChange={(e) => handleUpdateExperience(exp.id, 'company', e.target.value)}
                    placeholder="e.g. TechCorp Solutions"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Role / Position</label>
                  <input
                    type="text"
                    value={exp.role}
                    onChange={(e) => handleUpdateExperience(exp.id, 'role', e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Dates</label>
                  <input
                    type="text"
                    value={exp.dates}
                    onChange={(e) => handleUpdateExperience(exp.id, 'dates', e.target.value)}
                    placeholder="e.g. 2023 - Present"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Achievements */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">Key Achievements / Bullets:</span>
                  <button
                    onClick={() => handleAddAchievement(exp.id)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add bullet</span>
                  </button>
                </div>

                {exp.achievements.map((ach, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-slate-600 text-xs">•</span>
                    <input
                      type="text"
                      value={ach}
                      onChange={(e) => handleUpdateAchievement(exp.id, idx, e.target.value)}
                      placeholder="Achieved X as measured by Y by doing Z..."
                      className="flex-1 bg-slate-900 border border-slate-800/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    {exp.achievements.length > 1 && (
                      <button
                        onClick={() => handleRemoveAchievement(exp.id, idx)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: Projects & Education */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Education */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-white flex items-center space-x-2">
              <GraduationCap className="w-4 h-4 text-purple-400" />
              <span>Education</span>
            </h2>
            <button
              onClick={handleAddEducation}
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-3">
            {formData.education.map((edu) => (
              <div key={edu.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 relative">
                <button
                  onClick={() => handleRemoveEducation(edu.id)}
                  className="absolute top-2 right-2 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  value={edu.institution}
                  onChange={(e) => handleUpdateEducation(edu.id, 'institution', e.target.value)}
                  placeholder="Institution name"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={edu.degree}
                    onChange={(e) => handleUpdateEducation(edu.id, 'degree', e.target.value)}
                    placeholder="Degree (e.g. B.S. CS)"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={edu.year}
                    onChange={(e) => handleUpdateEducation(edu.id, 'year', e.target.value)}
                    placeholder="Year (e.g. 2024)"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Featured Projects */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-white flex items-center space-x-2">
              <FolderGit2 className="w-4 h-4 text-cyan-400" />
              <span>Key Projects</span>
            </h2>
            <button
              onClick={handleAddProject}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-3">
            {formData.projects.map((proj) => (
              <div key={proj.id} className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 relative">
                <button
                  onClick={() => handleRemoveProject(proj.id)}
                  className="absolute top-2 right-2 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  value={proj.name}
                  onChange={(e) => handleUpdateProject(proj.id, 'name', e.target.value)}
                  placeholder="Project Name"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="text"
                  value={proj.description}
                  onChange={(e) => handleUpdateProject(proj.id, 'description', e.target.value)}
                  placeholder="Description of architecture and impact"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={proj.techStack.join(', ')}
                    onChange={(e) => handleUpdateProject(proj.id, 'techStack', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                    placeholder="Tech stack (comma separated)"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300"
                  />
                  <input
                    type="text"
                    value={proj.link || ''}
                    onChange={(e) => handleUpdateProject(proj.id, 'link', e.target.value)}
                    placeholder="Link (e.g. github.com/...)"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Bottom Save Bar */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Writing to master_profiles...' : 'Save Master Profile'}</span>
        </button>
      </div>

    </div>
  );
};
