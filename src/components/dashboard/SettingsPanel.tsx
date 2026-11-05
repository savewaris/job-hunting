'use client';

import { useState } from 'react';
import { callApi, INPUT, PANEL, FOCUS } from './api';

export default function SettingsPanel({
  maxDailyDrafts,
  scheduleEnabled,
}: {
  maxDailyDrafts: number;
  scheduleEnabled: boolean;
}) {
  const [saved, setSaved] = useState(maxDailyDrafts);
  const [value, setValue] = useState(String(maxDailyDrafts));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function save() {
    if (pending) return;
    const trimmed = value.trim();
    if (trimmed !== '' && Number(trimmed) === saved) {
      setError('');
      return;
    }
    setPending(true);
    setError('');
    setNotice('');
    const res = await callApi('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ maxDailyDrafts: trimmed === '' ? null : Number(trimmed) }),
    });
    if (res.ok && res.data?.settings) {
      const next = res.data.settings.maxDailyDrafts as number;
      setSaved(next);
      setValue(String(next));
      setNotice('Saved');
    } else {
      setError(res.error ?? 'Could not save');
    }
    setPending(false);
  }

  return (
    <section aria-labelledby="settings-heading" className={PANEL}>
      <h2 id="settings-heading" className="text-lg font-semibold text-slate-100">
        Settings
      </h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="max-daily-drafts" className="mb-1 block text-sm text-slate-300">
            Max daily drafts
          </label>
          <input
            id="max-daily-drafts"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            step={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setNotice('');
            }}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby="max-daily-drafts-status"
            className={`${INPUT} max-w-[10rem]`}
          />
          <p
            id="max-daily-drafts-status"
            role="status"
            aria-live="polite"
            className={`mt-1 min-h-[1rem] text-xs ${error ? 'text-red-300' : 'text-emerald-300'}`}
          >
            {error || notice}
          </p>
        </div>
        <div>
          <label className="flex items-center gap-3 text-sm text-slate-300" htmlFor="schedule-switch">
            <input
              id="schedule-switch"
              type="checkbox"
              role="switch"
              checked={scheduleEnabled}
              disabled
              readOnly
              aria-describedby="schedule-note"
              className={`h-5 w-9 cursor-not-allowed opacity-50 ${FOCUS}`}
            />
            Run on a schedule
          </label>
          <p id="schedule-note" className="mt-1 text-xs text-slate-500">
            Scheduling isn&apos;t built yet
          </p>
        </div>
      </div>
    </section>
  );
}
