'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ExternalLink, Globe, Loader2, Plus, Radar, Sparkles, Trash2 } from 'lucide-react';
import { callApi, BTN_PRIMARY, BTN_SECONDARY, INPUT, PANEL } from './api';

export interface TargetCompanyView {
  id: string;
  name: string;
  careersUrl: string;
  atsType: 'greenhouse' | 'lever' | 'ashby' | 'direct_careers';
  atsSlug: string | null;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastFoundCount: number;
}

const ATS_BADGE: Record<TargetCompanyView['atsType'], { label: string; style: string }> = {
  greenhouse: {
    label: 'Greenhouse ATS',
    style: 'border-emerald-700/60 bg-emerald-950/60 text-emerald-300',
  },
  lever: {
    label: 'Lever ATS',
    style: 'border-cyan-700/60 bg-cyan-950/60 text-cyan-300',
  },
  ashby: {
    label: 'Ashby ATS',
    style: 'border-indigo-700/60 bg-indigo-950/60 text-indigo-300',
  },
  direct_careers: {
    label: 'Direct Career Site',
    style: 'border-amber-700/60 bg-amber-950/60 text-amber-300',
  },
};

export default function CompaniesPanel({ companies }: { companies: TargetCompanyView[] }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [careersUrl, setCareersUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim() || !careersUrl.trim() || inFlight.current) return;
    inFlight.current = true;
    setAdding(true);
    setError('');
    setNotice('');
    const res = await callApi('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: companyName.trim(), careersUrl: careersUrl.trim() }),
    });
    if (res.ok) {
      setCompanyName('');
      setCareersUrl('');
      setNotice(`Added ${companyName.trim()} career portal.`);
      router.refresh();
    } else {
      setError(res.error ?? 'Failed to add company career URL');
    }
    inFlight.current = false;
    setAdding(false);
  }

  async function handleRemove(id: string, name: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setDeletingId(id);
    setError('');
    setNotice('');
    const res = await callApi(`/api/companies/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setNotice(`Removed ${name}.`);
      router.refresh();
    } else {
      setError(res.error ?? 'Failed to remove company');
    }
    inFlight.current = false;
    setDeletingId(null);
  }

  async function handleScanAndPrepare() {
    if (inFlight.current) return;
    inFlight.current = true;
    setScanning(true);
    setError('');
    setNotice('');
    const res = await callApi('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ mode: 'full' }),
    });
    if (res.ok && res.data?.run) {
      const steps = (res.data.run as { summary?: { steps?: Record<string, Record<string, number>> } })
        ?.summary?.steps;
      const discovered = steps?.discoverCompanyCareers?.discovered ?? 0;
      const drafted = steps?.prepareApplicationDrafts?.drafted ?? 0;
      const asked = steps?.prepareApplicationDrafts?.parkedQuestions ?? 0;
      setNotice(
        `Scanned ${companies.length} company portals: +${discovered} new roles, ${drafted} tailored drafts queued for approval${asked > 0 ? `, ${asked} screening question(s) parked` : ''}.`,
      );
      router.refresh();
    } else {
      setError(res.error ?? 'Failed to scan company career pages');
    }
    inFlight.current = false;
    setScanning(false);
  }

  async function handlePrepareWishlistDrafts() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPreparing(true);
    setError('');
    setNotice('');
    const res = await callApi('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ mode: 'drafts' }),
    });
    if (res.ok && res.data?.run) {
      const steps = (res.data.run as { summary?: { steps?: Record<string, Record<string, number>> } })
        ?.summary?.steps;
      const drafted = steps?.prepareApplicationDrafts?.drafted ?? 0;
      const asked = steps?.prepareApplicationDrafts?.parkedQuestions ?? 0;
      setNotice(
        `Prepared ${drafted} tailored cover letter + PDF resume draft(s) from Wishlist${asked > 0 ? ` (${asked} screening question parked)` : ''}.`,
      );
      router.refresh();
    } else {
      setError(res.error ?? 'Failed to prepare drafts');
    }
    inFlight.current = false;
    setPreparing(false);
  }

  return (
    <section aria-labelledby="companies-heading" className={`${PANEL} space-y-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-cyan-400" aria-hidden />
            <h2 id="companies-heading" className="text-lg font-semibold text-slate-100">
              Direct Company Career Portals
            </h2>
            <span className="rounded-full bg-cyan-950/70 px-2.5 py-0.5 text-xs font-medium text-cyan-300 border border-cyan-800/60">
              {companies.length} tracked
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Prioritizes official company career websites &amp; direct ATS portals (Greenhouse, Lever, Ashby, direct JSON-LD/HTML career pages) over generic job boards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrepareWishlistDrafts}
            disabled={preparing || scanning}
            className={BTN_SECONDARY}
          >
            {preparing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4 text-cyan-300" aria-hidden />
            )}
            {preparing ? 'Preparing Drafts…' : 'Prepare Wishlist Drafts'}
          </button>
          <button
            type="button"
            onClick={handleScanAndPrepare}
            disabled={scanning || preparing}
            className={BTN_PRIMARY}
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Radar className="h-4 w-4" aria-hidden />
            )}
            {scanning ? 'Scanning Career Portals…' : 'Scan Company Careers & Auto-Draft'}
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="text-xs text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {companies.map((c) => {
          const badge = ATS_BADGE[c.atsType] ?? ATS_BADGE.direct_careers;
          return (
            <div
              key={c.id}
              className="flex flex-col justify-between rounded-lg border border-slate-800/90 bg-slate-950/60 p-3 transition hover:border-slate-700"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={c.careersUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-slate-100 hover:text-cyan-300 text-sm"
                  >
                    <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
                    <span className="truncate">{c.name}</span>
                    <ExternalLink className="h-3 w-3 text-slate-500 shrink-0" aria-hidden />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemove(c.id, c.name)}
                    disabled={deletingId === c.id}
                    aria-label={`Remove ${c.name}`}
                    className="text-slate-500 hover:text-red-300 p-1 rounded"
                  >
                    {deletingId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge.style}`}>
                    {badge.label}
                  </span>
                  {c.atsSlug && (
                    <span className="text-[11px] text-slate-500 font-mono truncate">
                      /{c.atsSlug}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/60 pt-2 text-[11px] text-slate-400">
                <span>Roles found: {c.lastFoundCount}</span>
                <span>
                  {c.lastCheckedAt
                    ? `Checked ${new Date(c.lastCheckedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : 'Not scanned yet'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name (e.g. Stripe, Vercel, Agoda)"
          aria-label="Company name"
          className={`${INPUT} sm:max-w-xs text-xs`}
        />
        <input
          type="url"
          value={careersUrl}
          onChange={(e) => setCareersUrl(e.target.value)}
          placeholder="Direct career page URL (https://company.com/careers or boards.greenhouse.io/...)"
          aria-label="Direct career page URL"
          className={`${INPUT} flex-1 text-xs`}
        />
        <button
          type="submit"
          disabled={adding || !companyName.trim() || !careersUrl.trim()}
          className={`${BTN_SECONDARY} shrink-0 text-xs`}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          Add Career Page
        </button>
      </form>
    </section>
  );
}
