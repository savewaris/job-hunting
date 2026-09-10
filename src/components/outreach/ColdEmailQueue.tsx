'use client';

import React, { useState } from 'react';
import { ColdEmail, JobApplication, MasterProfile } from '@/types';
import { 
  Mail, 
  Send, 
  CheckCircle, 
  Clock, 
  Edit3, 
  Trash2, 
  Sparkles, 
  Copy, 
  Check, 
  ShieldAlert,
  Building,
  User,
  ExternalLink,
  PlusCircle,
  FileText,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface ColdEmailQueueProps {
  emails: ColdEmail[];
  applications: JobApplication[];
  masterProfile: MasterProfile;
  onSaveEmail: (email: ColdEmail) => Promise<void> | void;
  onDeleteEmail: (id: string) => Promise<void> | void;
  onSendEmail: (email: ColdEmail) => Promise<void> | void;
}

export const ColdEmailQueue: React.FC<ColdEmailQueueProps> = ({
  emails,
  applications,
  masterProfile,
  onSaveEmail,
  onDeleteEmail,
  onSendEmail,
}) => {
  const [filter, setFilter] = useState<'all' | 'draft' | 'reviewed' | 'sent'>('all');
  const [selectedEmail, setSelectedEmail] = useState<ColdEmail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editRecipientEmail, setEditRecipientEmail] = useState('');
  const [editRecipientName, setEditRecipientName] = useState('');
  const [editRecipientRole, setEditRecipientRole] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [selectedAppIdForGenerate, setSelectedAppIdForGenerate] = useState<string>(
    applications[0]?.id || ''
  );

  const filteredEmails = emails.filter((email) => {
    if (filter === 'all') return true;
    return email.status === filter;
  });

  const handleCopy = (email: ColdEmail) => {
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
    setCopiedId(email.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleStartEdit = (email: ColdEmail) => {
    setSelectedEmail(email);
    setEditSubject(email.subject);
    setEditBody(email.body);
    setEditRecipientEmail(email.recipientEmail || '');
    setEditRecipientName(email.recipientName || '');
    setEditRecipientRole(email.recipientRole || '');
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmail) return;
    const updated: ColdEmail = {
      ...selectedEmail,
      subject: editSubject,
      body: editBody,
      recipientEmail: editRecipientEmail.trim(),
      recipientName: editRecipientName.trim(),
      recipientRole: editRecipientRole.trim(),
      status: selectedEmail.status === 'sent' ? 'sent' : 'reviewed',
    };
    await onSaveEmail(updated);
    setSendErrors((prev) => {
      const next = { ...prev };
      delete next[selectedEmail.id];
      return next;
    });
    setIsEditing(false);
    setSelectedEmail(null);
  };

  // Explicit per-email Send Action (NO automatic sending) — sends a real email via
  // the backend, with a tailored resume PDF attached, and only flips status on success.
  const handleExplicitSend = async (email: ColdEmail) => {
    if (!email.recipientEmail?.trim()) {
      setSendErrors((prev) => ({
        ...prev,
        [email.id]: 'Add a recipient email (Edit Draft) before sending.',
      }));
      return;
    }

    setSendingId(email.id);
    setSendErrors((prev) => {
      const next = { ...prev };
      delete next[email.id];
      return next;
    });

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, masterProfile }),
      });
      const json = await res.json();

      if (json.success) {
        await onSendEmail({ ...email, status: 'sent', sentAt: json.sentAt });
      } else {
        setSendErrors((prev) => ({ ...prev, [email.id]: json.error || 'Failed to send email.' }));
      }
    } catch (err: any) {
      setSendErrors((prev) => ({ ...prev, [email.id]: err?.message || 'Failed to send email.' }));
    } finally {
      setSendingId(null);
    }
  };

  // Generate new outreach draft for an application
  const handleGenerateDraft = async () => {
    const targetApp = applications.find((a) => a.id === selectedAppIdForGenerate);
    if (!targetApp) return;

    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai-tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterProfile,
          jobDescription: targetApp.jobDescription,
          jobTitle: targetApp.jobTitle,
          companyName: targetApp.companyName,
          requirements: targetApp.requirements,
        }),
      });

      const json = await res.json();
      const coldData = json.data?.coldEmail;

      const newDraft: ColdEmail = {
        id: crypto.randomUUID(),
        jobApplicationId: targetApp.id,
        companyName: targetApp.companyName,
        jobTitle: targetApp.jobTitle,
        recipientName: 'Hiring Team',
        recipientRole: 'Engineering Manager',
        // Left blank deliberately — a guessed address can silently "succeed" at the
        // SMTP level while reaching nobody useful. Edit Draft to add a real recipient.
        recipientEmail: '',
        subject: coldData?.subject || `${targetApp.jobTitle} (Remote) — ${masterProfile.fullName}`,
        body: coldData?.body || `Hi team,\n\nI'm reaching out regarding the ${targetApp.jobTitle} role at ${targetApp.companyName}.\n\nBest regards,\n${masterProfile.fullName}`,
        status: 'draft',
        createdAt: new Date().toISOString(),
        tailoredHighlights: json.data?.matchReasons || ['Strong technical overlap'],
        tailoredSummary: json.data?.tailoredSummary,
        suggestedBullets: json.data?.suggestedBullets,
      };

      await onSaveEmail(newDraft);
    } catch (err) {
      console.error('Failed to generate draft:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Top Banner & Security Policy Notice */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Cold Email Review Queue
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full">
                  Human-in-the-Loop
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Review, edit, and authorize outreach emails with tailored candidate value propositions.
              </p>
            </div>
          </div>

          {/* Quick Generator from Pipeline */}
          <div className="flex items-center space-x-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
            <select
              value={selectedAppIdForGenerate}
              onChange={(e) => setSelectedAppIdForGenerate(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.companyName} — {app.jobTitle}
                </option>
              ))}
            </select>
            <button
              onClick={handleGenerateDraft}
              disabled={isGenerating || applications.length === 0}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg text-xs font-medium transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isGenerating ? 'Generating...' : 'Generate Draft'}</span>
            </button>
          </div>
        </div>

        {/* Explicit Anti-Auto-Send Policy Guard */}
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3 text-xs text-amber-300/90">
          <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold text-amber-300">Strict Human Approval Policy (No Automatic Sending): </span>
            Emails are never sent automatically in the background. Every draft sits safely in this queue until you review the text and explicitly click the <strong>&quot;Send Email&quot;</strong> button.
          </div>
        </div>
      </div>

      {/* Filter Tabs & Counter */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          {(['all', 'draft', 'reviewed', 'sent'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab === 'all' ? 'All Emails' : tab}
              <span className="ml-1.5 px-1.5 py-0.2 bg-slate-900/60 rounded-full text-[10px]">
                {emails.filter((e) => (tab === 'all' ? true : e.status === tab)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Email Queue List */}
      <div className="space-y-4">
        {filteredEmails.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl">
            <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No emails found in this category.</p>
            <p className="text-xs text-slate-500 mt-1">
              Select a job from your pipeline above to generate an AI-tailored cold outreach draft.
            </p>
          </div>
        ) : (
          filteredEmails.map((email) => {
            const isSent = email.status === 'sent';
            return (
              <div
                key={email.id}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700/80 transition-all space-y-4"
              >
                {/* Email Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-slate-800 rounded-lg text-slate-300">
                      <Building className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-white text-sm">{email.companyName}</span>
                        {email.jobTitle && (
                          <span className="text-xs text-slate-400">• {email.jobTitle}</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                        <User className="w-3 h-3 text-slate-500" />
                        <span>To: {email.recipientName} ({email.recipientRole || 'Hiring Manager'})</span>
                        <span className="text-slate-600">|</span>
                        {email.recipientEmail ? (
                          <span className="text-blue-400/80">{email.recipientEmail}</span>
                        ) : (
                          <span className="text-amber-400/80 italic">no recipient set</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center space-x-2">
                    {!email.recipientEmail && (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Missing recipient</span>
                      </span>
                    )}
                    {email.status === 'sent' && (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Sent {email.sentAt ? new Date(email.sentAt).toLocaleDateString() : ''}</span>
                      </span>
                    )}
                    {email.status === 'reviewed' && (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Reviewed & Ready</span>
                      </span>
                    )}
                    {email.status === 'draft' && (
                      <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Draft Needs Review</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Subject Line */}
                <div>
                  <span className="text-xs text-slate-400 block font-medium mb-1">Subject:</span>
                  <div className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800/80 text-xs font-semibold text-slate-200">
                    {email.subject}
                  </div>
                </div>

                {/* Email Body Preview */}
                <div>
                  <span className="text-xs text-slate-400 block font-medium mb-1">Email Body:</span>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed max-h-56 overflow-y-auto">
                    {email.body}
                  </div>
                </div>

                {/* Action Bar (Explicit per-email Send button, Edit, Copy, Delete) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleCopy(email)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700/60 flex items-center space-x-1.5 transition-colors"
                    >
                      {copiedId === email.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleStartEdit(email)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700/60 flex items-center space-x-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Edit Draft</span>
                    </button>

                    <button
                      onClick={() => onDeleteEmail(email.id)}
                      className="text-xs text-slate-500 hover:text-rose-400 p-1.5 transition-colors"
                      title="Delete email"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Explicit Send Button */}
                  <div className="flex flex-col items-end space-y-1.5">
                    <button
                      onClick={() => handleExplicitSend(email)}
                      disabled={sendingId === email.id}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 ${
                        isSent
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25'
                      }`}
                    >
                      {sendingId === email.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {sendingId === email.id
                          ? 'Sending...'
                          : isSent
                          ? 'Send Again'
                          : 'Send Email Now'}
                      </span>
                    </button>
                    {sendErrors[email.id] && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-400 max-w-xs text-right">
                        <span>{sendErrors[email.id]}</span>
                        <button
                          onClick={() =>
                            setSendErrors((prev) => {
                              const next = { ...prev };
                              delete next[email.id];
                              return next;
                            })
                          }
                          className="text-rose-500 hover:text-rose-300"
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Modal */}
      {isEditing && selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Edit3 className="w-4 h-4 text-blue-400" />
              <span>Edit Outreach Draft for {selectedEmail.companyName}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Recipient Email <span className="text-rose-400">*required to send</span>
                </label>
                <input
                  type="email"
                  value={editRecipientEmail}
                  onChange={(e) => setEditRecipientEmail(e.target.value)}
                  placeholder="hiring-manager@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Recipient Role</label>
                <input
                  type="text"
                  value={editRecipientRole}
                  onChange={(e) => setEditRecipientRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-400 mb-1">Recipient Name</label>
                <input
                  type="text"
                  value={editRecipientName}
                  onChange={(e) => setEditRecipientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Subject</label>
              <input
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Body</label>
              <textarea
                rows={10}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
