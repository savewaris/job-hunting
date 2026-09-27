'use client';

import React, { useState } from 'react';
import { ColdEmail } from '@/domain/cold-emails';
import { Send, FileText, Check } from 'lucide-react';

interface ColdEmailQueueProps {
  initialEmails: ColdEmail[];
}

export default function ColdEmailQueue({ initialEmails }: ColdEmailQueueProps) {
  const [emails, setEmails] = useState<ColdEmail[]>(initialEmails);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const updateField = (id: string, field: 'subject' | 'body', value: string) => {
    setEmails(prev => prev.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const saveEdit = async (email: ColdEmail): Promise<boolean> => {
    const res = await fetch(`/api/cold-emails/${email.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: email.subject, body: email.body }),
    });
    return res.ok;
  };

  const handleSend = async (id: string) => {
    setSendingId(id);
    try {
      // Blur (which fires saveEdit) and this click can race — awaiting the
      // latest edit here first means Send never ships stale text while the
      // screen shows the edited version.
      const email = emails.find(e => e.id === id);
      if (email) {
        const saved = await saveEdit(email);
        if (!saved) return;
      }

      const res = await fetch(`/api/cold-emails/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setEmails(prev => prev.filter(e => e.id !== id));
      }
    } finally {
      setSendingId(null);
    }
  };

  if (emails.length === 0) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 text-slate-500 text-center">
          No cold-email drafts waiting for review.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      {emails.map(email => (
        <div key={email.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-slate-200 font-medium">{email.jobTitle} @ {email.companyName}</p>
            <a
              href={`/api/tailored-documents/${email.jobApplicationId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-slate-400 text-sm hover:text-slate-200"
            >
              <FileText size={14} /> Preview PDF
            </a>
          </div>
          <input
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-sm"
            value={email.subject}
            onChange={e => updateField(email.id, 'subject', e.target.value)}
            onBlur={() => saveEdit(email)}
          />
          <textarea
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 text-sm min-h-[140px]"
            value={email.body}
            onChange={e => updateField(email.id, 'body', e.target.value)}
            onBlur={() => saveEdit(email)}
          />
          <div className="flex justify-end">
            <button
              onClick={() => handleSend(email.id)}
              disabled={sendingId === email.id}
              className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 px-4 py-2 rounded-xl"
            >
              {sendingId === email.id ? <Check size={16} /> : <Send size={16} />}
              {sendingId === email.id ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
