'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, BellRing } from 'lucide-react';
import { callApi, BTN_PRIMARY, BTN_SECONDARY, INPUT, PANEL } from './api';
import { SKIP_REASON_LABELS, STATUS_LABELS } from './format';

export interface BoardApplication {
  id: string;
  companyName: string;
  jobTitle: string;
  location: string | null;
  status: string;
  needsInput: boolean;
}

/** Left to right, per the plan's Global Constraints. */
const COLUMNS = [
  { id: 'needs_input', title: 'Needs your input' },
  { id: 'maybe', title: 'Maybe' },
  { id: 'wishlist', title: 'Wishlist' },
  { id: 'applied', title: 'Applied' },
  { id: 'interviewing', title: 'Interviewing' },
  { id: 'offer', title: 'Offer' },
  { id: 'rejected', title: 'Rejected' },
] as const;

const MOVE_TARGETS = ['maybe', 'wishlist', 'applied', 'interviewing', 'offer', 'rejected'] as const;
const SKIP_REASONS = ['too_senior', 'bad_pay', 'not_interested_company', 'wrong_location', 'other'] as const;

function columnOf(app: BoardApplication): string | null {
  if (app.status === 'skipped') return null;
  // "Needs your input" is derived from open inbox items, not stored on the application.
  if (app.needsInput) return 'needs_input';
  return app.status;
}

function Card({ app, showStatus }: { app: BoardApplication; showStatus: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState<string>(SKIP_REASONS[0]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  async function patch(body: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage('');
    const res = await callApi(`/api/applications/${encodeURIComponent(app.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.refresh();
      // Skipped cards disappear on refresh; moved cards re-render in their new column.
      inFlight.current = false;
      setPending(false);
      setSkipping(false);
      return;
    }
    setMessage(res.status === 404 ? 'That application no longer exists' : (res.error ?? 'Something went wrong'));
    inFlight.current = false;
    setPending(false);
  }

  const selectId = `move-${app.id}`;
  const reasonId = `skip-reason-${app.id}`;
  const noteId = `skip-note-${app.id}`;

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-950/70 p-3" data-testid="board-card">
      <p className="break-words text-sm font-medium text-slate-100">{app.jobTitle}</p>
      <p className="break-words text-xs text-slate-300">{app.companyName}</p>
      {app.location && (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          {app.location}
        </p>
      )}
      {app.needsInput && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
          <BellRing className="h-3 w-3" aria-hidden />
          Needs your input
        </p>
      )}
      {showStatus && (
        <p className="mt-1 text-xs text-slate-500">Status: {STATUS_LABELS[app.status] ?? app.status}</p>
      )}

      <div className="mt-3 space-y-2">
        <div>
          <label htmlFor={selectId} className="mb-1 block text-xs text-slate-400">
            Move to
          </label>
          <select
            id={selectId}
            value={app.status}
            disabled={pending}
            onChange={(e) => {
              if (e.target.value !== app.status) void patch({ status: e.target.value });
            }}
            className={INPUT}
          >
            {MOVE_TARGETS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {!skipping ? (
          <button type="button" className={`${BTN_SECONDARY} w-full`} disabled={pending} onClick={() => setSkipping(true)}>
            Skip
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-slate-800 p-2">
            <label htmlFor={reasonId} className="block text-xs text-slate-400">
              Why skip?
            </label>
            <select
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              className={INPUT}
            >
              {SKIP_REASONS.map((r) => (
                <option key={r} value={r}>
                  {SKIP_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            <label htmlFor={noteId} className="block text-xs text-slate-400">
              Note (optional)
            </label>
            <input
              id={noteId}
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              maxLength={2000}
              className={INPUT}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={`${BTN_PRIMARY} flex-1`}
                disabled={pending}
                onClick={() => patch({ skip: note.trim() ? { reason, note: note.trim() } : { reason } })}
              >
                Confirm skip
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={pending} onClick={() => setSkipping(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <p role="status" aria-live="polite" className="min-h-[1rem] text-xs text-red-300">
          {message}
        </p>
      </div>
    </li>
  );
}

export default function Board({ applications }: { applications: BoardApplication[] }) {
  const byColumn = new Map<string, BoardApplication[]>(COLUMNS.map((c) => [c.id, []]));
  for (const app of applications) {
    const col = columnOf(app);
    if (col) byColumn.get(col)?.push(app);
  }

  return (
    <section aria-labelledby="board-heading" className={`${PANEL} min-w-0`}>
      <h2 id="board-heading" className="text-lg font-semibold text-slate-100">
        Board
      </h2>
      {/* Only this container scrolls horizontally, never the page. */}
      <div className="mt-3 w-full max-w-full overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Applications board, scrolls sideways">
        <div className="flex gap-3">
          {COLUMNS.map((col) => {
            const cards = byColumn.get(col.id) ?? [];
            return (
              <div
                key={col.id}
                className="w-64 shrink-0 rounded-lg border border-slate-800 bg-slate-900/60 p-2"
                data-testid="board-column"
                data-column={col.id}
              >
                <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-medium text-slate-200">
                  {col.title}
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{cards.length}</span>
                </h3>
                {cards.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-slate-500">Empty</p>
                ) : (
                  <ul className="space-y-2">
                    {cards.map((app) => (
                      <Card key={app.id} app={app} showStatus={col.id === 'needs_input'} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
