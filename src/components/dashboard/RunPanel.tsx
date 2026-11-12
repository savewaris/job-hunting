'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Loader2 } from 'lucide-react';
import { callApi, BTN_PRIMARY } from './api';
import { resumedText, runErrorText } from './format';

export interface RunView {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  summary: Record<string, unknown>;
}

const STATUS_STYLE: Record<RunView['status'], string> = {
  succeeded: 'text-emerald-300',
  failed: 'text-red-300',
  running: 'text-amber-300',
};

export default function RunPanel({ lastRun }: { lastRun: RunView | null }) {
  const router = useRouter();
  const [latest, setLatest] = useState<RunView | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState('');

  const shown = latest ?? lastRun;
  const resumed = shown ? resumedText(shown) : null;
  const errorText = shown ? runErrorText(shown) : null;

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setNotice('');
    const res = await callApi('/api/runs', { method: 'POST' });
    if (res.ok && res.data?.run) {
      setLatest(res.data.run as RunView);
    } else if (res.status === 409) {
      setNotice('A run is already in progress. Try again in a moment.');
    } else {
      setNotice(res.error ?? 'Run failed to start');
    }
    router.refresh();
    inFlight.current = false;
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <button type="button" onClick={run} disabled={pending} className={BTN_PRIMARY}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
        {pending ? 'Running…' : 'Run'}
      </button>
      <div role="status" aria-live="polite" className="text-sm text-slate-400 sm:text-right">
        {shown ? (
          <p>
            Last run:{' '}
            <span className={`font-medium ${STATUS_STYLE[shown.status]}`}>{shown.status}</span>{' '}
            <time dateTime={shown.startedAt} suppressHydrationWarning>
              {new Date(shown.startedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
          </p>
        ) : (
          <p>No runs yet</p>
        )}
        {resumed && <p className="text-slate-300">{resumed}</p>}
        {errorText && <p className="text-red-300">{errorText}</p>}
        {notice && <p className="text-amber-300">{notice}</p>}
      </div>
    </div>
  );
}
