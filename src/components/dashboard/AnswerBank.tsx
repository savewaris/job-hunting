'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { callApi, BTN_PRIMARY, BTN_SECONDARY, INPUT, PANEL } from './api';

export interface AnswerView {
  key: string;
  questionText: string;
  answer: string;
  updatedAt: string;
}

function Entry({ entry }: { entry: AnswerView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.answer);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState('');

  async function run(fn: () => ReturnType<typeof callApi>, after: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    const res = await fn();
    if (res.ok || res.status === 404) {
      after();
      router.refresh();
    } else {
      setMessage(res.error ?? 'Something went wrong');
    }
    inFlight.current = false;
    setPending(false);
  }

  const save = () =>
    run(
      () =>
        callApi('/api/answers', {
          method: 'PUT',
          body: JSON.stringify({ questionText: entry.questionText, answer: draft }),
        }),
      () => setEditing(false),
    );

  const remove = () =>
    run(
      () => callApi(`/api/answers/${encodeURIComponent(entry.key)}`, { method: 'DELETE' }),
      () => setConfirmDelete(false),
    );

  const editId = `edit-${entry.key}`;

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 sm:p-4" data-testid="answer-entry">
      <p className="break-words text-sm font-medium text-slate-100">{entry.questionText}</p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <label htmlFor={editId} className="block text-xs text-slate-400">
            Answer
          </label>
          <textarea id={editId} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={pending} className={INPUT} />
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={pending || !draft.trim()} onClick={save}>
              Save
            </button>
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setDraft(entry.answer);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{entry.answer}</p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Updated{' '}
        <time dateTime={entry.updatedAt} suppressHydrationWarning>
          {new Date(entry.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
      </p>
      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-sm text-slate-300">Delete this answer?</span>
              <button type="button" className={BTN_PRIMARY} disabled={pending} onClick={remove}>
                Yes, delete
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => setEditing(true)}>
                Edit
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-1 min-h-[1rem] text-xs text-red-300">
        {message}
      </p>
    </li>
  );
}

export default function AnswerBank({ entries }: { entries: AnswerView[] }) {
  return (
    <section aria-labelledby="answers-heading" className={PANEL}>
      <h1 id="answers-heading" className="text-xl font-semibold text-slate-100">
        Answer bank
      </h1>
      <p className="mt-1 text-sm text-slate-400">Answers saved from the Inbox are reused when the same question comes up again.</p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No saved answers yet</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((e) => (
            <Entry key={e.key} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
