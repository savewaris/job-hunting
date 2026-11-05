'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox as InboxIcon, AlertTriangle, MessageCircleQuestion, FileCheck2 } from 'lucide-react';
import { callApi, BTN_PRIMARY, BTN_SECONDARY, INPUT, PANEL, FOCUS } from './api';

export interface InboxItemView {
  id: string;
  companyName: string | null;
  jobTitle: string | null;
  kind: 'question' | 'approval' | 'error';
  prompt: string;
  payload: Record<string, unknown>;
}

const ALREADY_HANDLED = 'Already handled — refreshed';

function ItemCard({ item }: { item: InboxItemView }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [saveToBank, setSaveToBank] = useState(true);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  async function resolve(body: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    setIsError(false);
    const res = await callApi(`/api/inbox/${encodeURIComponent(item.id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      // Stay disabled: the item leaves the list once the refreshed data arrives.
      router.refresh();
      return;
    }
    if (res.status === 409) {
      setMessage(ALREADY_HANDLED);
      router.refresh();
      return;
    }
    setMessage(res.error ?? 'Something went wrong');
    setIsError(true);
    inFlight.current = false;
    setPending(false);
  }

  const detail = typeof item.payload.detail === 'string' ? item.payload.detail : null;
  const preview = typeof item.payload.preview === 'string' ? item.payload.preview : null;
  const Icon = item.kind === 'question' ? MessageCircleQuestion : item.kind === 'approval' ? FileCheck2 : AlertTriangle;
  const kindLabel = item.kind === 'question' ? 'Question' : item.kind === 'approval' ? 'Approval' : 'Error';
  const answerId = `answer-${item.id}`;

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 sm:p-4" data-testid="inbox-item" data-kind={item.kind}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs text-slate-400">
            <span className="font-medium text-slate-300">{kindLabel}</span>
            {' · '}
            {item.companyName ?? 'Unknown company'} — {item.jobTitle ?? 'Unknown role'}
          </p>
          <p className="mt-1 break-words text-sm font-medium text-slate-100">{item.prompt}</p>
        </div>
      </div>

      {item.kind === 'question' && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={answerId} className="mb-1 block text-xs text-slate-400">
              Your answer
            </label>
            <textarea
              id={answerId}
              rows={2}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={pending}
              className={INPUT}
            />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-300 sm:min-h-0">
            <input
              type="checkbox"
              checked={saveToBank}
              onChange={(e) => setSaveToBank(e.target.checked)}
              disabled={pending}
              className={`h-4 w-4 rounded border-slate-600 bg-slate-900 ${FOCUS}`}
            />
            Save to answer bank
          </label>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={pending || !answer.trim()}
            onClick={() => resolve({ decision: 'answered', answer, saveToBank })}
          >
            Answer
          </button>
        </div>
      )}

      {item.kind === 'approval' && (
        <div className="mt-3 space-y-3">
          {preview && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
              {preview}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={() => resolve({ decision: 'approved' })}>
              Approve
            </button>
            <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => resolve({ decision: 'skipped' })}>
              Skip
            </button>
          </div>
        </div>
      )}

      {item.kind === 'error' && (
        <div className="mt-3 space-y-3">
          {detail && <p className="break-words text-sm text-slate-300">{detail}</p>}
          <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => resolve({ decision: 'skipped' })}>
            Dismiss
          </button>
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-[1rem] text-xs ${isError ? 'text-red-300' : 'text-amber-300'}`}
      >
        {message}
      </p>
    </li>
  );
}

export default function InboxPanel({ items }: { items: InboxItemView[] }) {
  return (
    <section aria-labelledby="inbox-heading" className={PANEL}>
      <h2 id="inbox-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-100">
        <InboxIcon className="h-5 w-5 text-sky-300" aria-hidden />
        Inbox
        {items.length > 0 && (
          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-200">{items.length}</span>
        )}
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nothing needs you</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
