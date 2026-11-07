'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox as InboxIcon,
  AlertTriangle,
  MessageCircleQuestion,
  FileCheck2,
  Sparkles,
  ExternalLink,
  PencilLine,
} from 'lucide-react';
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

const URL_SPLIT_RE = /(https?:\/\/[^\s)>,]+)/g;

function renderTextWithLinks(text: string) {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((part, idx) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-sky-400 underline decoration-sky-400/50 hover:text-sky-300"
        >
          {part}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function ItemCard({ item }: { item: InboxItemView }) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [saveToBank, setSaveToBank] = useState(true);
  const initialPreview = typeof item.payload.preview === 'string' ? item.payload.preview : '';
  const [draft, setDraft] = useState(initialPreview);
  const [editingDraft, setEditingDraft] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState('');
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

  async function refineFromProfile(customInstruction?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    setIsError(false);
    const res = await callApi(`/api/inbox/${encodeURIComponent(item.id)}/refine`, {
      method: 'POST',
      body: JSON.stringify({
        instruction: customInstruction?.trim() ? customInstruction.trim() : undefined,
      }),
    });
    if (res.ok && res.data?.item) {
      const nextPreview =
        typeof res.data.item.payload?.preview === 'string'
          ? (res.data.item.payload.preview as string)
          : draft;
      setDraft(nextPreview);
      setMessage(
        res.data.usedAi
          ? 'Rewritten with AI from Master Profile (Personal Website & GitHub embedded)'
          : 'Rewritten from Master Profile (Personal Website & GitHub embedded)',
      );
      setIsError(false);
      router.refresh();
      inFlight.current = false;
      setPending(false);
      return;
    }
    if (res.status === 409) {
      setMessage(ALREADY_HANDLED);
      router.refresh();
      return;
    }
    setMessage(res.error ?? 'Could not refine cover letter');
    setIsError(true);
    inFlight.current = false;
    setPending(false);
  }

  async function saveEditedDraft() {
    if (inFlight.current || !draft.trim()) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    setIsError(false);
    const res = await callApi(`/api/inbox/${encodeURIComponent(item.id)}/refine`, {
      method: 'POST',
      body: JSON.stringify({ preview: draft }),
    });
    if (res.ok && res.data?.item) {
      const nextPreview =
        typeof res.data.item.payload?.preview === 'string'
          ? (res.data.item.payload.preview as string)
          : draft;
      setDraft(nextPreview);
      setEditingDraft(false);
      setMessage('Draft updated (Personal Website & GitHub links verified)');
      setIsError(false);
      router.refresh();
      inFlight.current = false;
      setPending(false);
      return;
    }
    if (res.status === 409) {
      setMessage(ALREADY_HANDLED);
      router.refresh();
      return;
    }
    setMessage(res.error ?? 'Could not save draft');
    setIsError(true);
    inFlight.current = false;
    setPending(false);
  }

  const detail = typeof item.payload.detail === 'string' ? item.payload.detail : null;
  const Icon =
    item.kind === 'question'
      ? MessageCircleQuestion
      : item.kind === 'approval'
        ? FileCheck2
        : AlertTriangle;
  const kindLabel =
    item.kind === 'question' ? 'Question' : item.kind === 'approval' ? 'Approval' : 'Error';
  const answerId = `answer-${item.id}`;
  const draftId = `draft-${item.id}`;
  const refineId = `refine-${item.id}`;

  return (
    <li
      className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 sm:p-4"
      data-testid="inbox-item"
      data-kind={item.kind}
    >
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
          {editingDraft ? (
            <div className="space-y-2">
              <label htmlFor={draftId} className="block text-xs text-slate-400">
                Edit cover letter draft (Personal Website &amp; GitHub links will be kept)
              </label>
              <textarea
                id={draftId}
                rows={10}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={pending}
                className={`${INPUT} font-mono text-xs leading-relaxed`}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={pending || !draft.trim()}
                  onClick={saveEditedDraft}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={pending}
                  onClick={() => {
                    setEditingDraft(false);
                    setDraft(initialPreview);
                  }}
                >
                  Cancel edit
                </button>
              </div>
            </div>
          ) : (
            draft && (
              <div className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-200">
                {renderTextWithLinks(draft)}
              </div>
            )
          )}

          {refineOpen && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <label htmlFor={refineId} className="block text-xs text-slate-300">
                Refinement instruction (optional — references Master Profile, Mahidol B.Sc., GISTDA,
                projects, and embeds Website + GitHub links)
              </label>
              <input
                id={refineId}
                type="text"
                placeholder="e.g. Emphasize Next.js, TypeScript, and AI agent projects"
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
                disabled={pending}
                maxLength={1000}
                className={INPUT}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={pending}
                  onClick={() => refineFromProfile(refineInstruction)}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Rewrite now
                </button>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={pending}
                  onClick={() => setRefineOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={pending}
              onClick={() => resolve({ decision: 'approved', answer: draft || undefined })}
            >
              Approve
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={pending}
              onClick={() => refineFromProfile(refineInstruction)}
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-400" aria-hidden />
              Redo from Master Profile
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={pending}
              onClick={() => setRefineOpen((v) => !v)}
            >
              Refine with prompt…
            </button>
            {!editingDraft && (
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={pending}
                onClick={() => setEditingDraft(true)}
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                Edit text
              </button>
            )}
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={pending}
              onClick={() => resolve({ decision: 'skipped' })}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {item.kind === 'error' && (
        <div className="mt-3 space-y-3">
          {detail && <p className="break-words text-sm text-slate-300">{detail}</p>}
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={pending}
            onClick={() => resolve({ decision: 'skipped' })}
          >
            Dismiss
          </button>
        </div>
      )}

      <p
        role="status"
        aria-live="polite"
        className={`mt-2 min-h-[1rem] text-xs ${isError ? 'text-red-300' : 'text-emerald-300'}`}
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
          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-200">
            {items.length}
          </span>
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
