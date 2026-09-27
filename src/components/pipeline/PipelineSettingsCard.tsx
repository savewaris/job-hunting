'use client';

import React, { useState } from 'react';
import { PipelineSettings } from '@/domain/pipeline/settings';
import { Zap, ZapOff } from 'lucide-react';

interface PipelineSettingsCardProps {
  initialSettings: PipelineSettings;
}

export default function PipelineSettingsCard({ initialSettings }: PipelineSettingsCardProps) {
  const [settings, setSettings] = useState<PipelineSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const toggleAutoTailor = async () => {
    setSaving(true);
    const next = !settings.autoTailor;
    try {
      const res = await fetch('/api/pipeline-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoTailor: next }),
      });
      const data = await res.json();
      if (data.success) setSettings(data.settings);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-4">
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex items-center justify-between">
        <div>
          <p className="text-slate-200 font-medium">AI Tailoring</p>
          <p className="text-slate-500 text-sm">
            {settings.autoTailor
              ? `Auto-tailors every new job (up to ${settings.maxDailyAutoTailor}/day)`
              : 'Manual only — click "Tailor Now" per job'}
          </p>
        </div>
        <button
          onClick={toggleAutoTailor}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition ${
            settings.autoTailor
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-800/60 border-slate-700 text-slate-400'
          }`}
        >
          {settings.autoTailor ? <Zap size={16} /> : <ZapOff size={16} />}
          {settings.autoTailor ? 'Auto' : 'Manual'}
        </button>
      </div>
    </div>
  );
}
