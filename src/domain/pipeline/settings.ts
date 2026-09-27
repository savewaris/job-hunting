import { getSupabaseClient } from '@/lib/supabase';

export interface PipelineSettings {
  autoIngestApiSources: boolean;
  autoTailor: boolean;
  maxDailyAutoTailor: number;
}

function rowToSettings(row: any): PipelineSettings {
  return {
    autoIngestApiSources: row.auto_ingest_api_sources,
    autoTailor: row.auto_tailor,
    maxDailyAutoTailor: row.max_daily_auto_tailor,
  };
}

export async function getPipelineSettings(): Promise<PipelineSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('pipeline_settings').select('*').eq('id', 1).single();
  if (error) throw new Error(`[PIPELINE_SETTINGS_ERROR:get] ${error.message}`);
  return rowToSettings(data);
}

export async function updatePipelineSettings(patch: Partial<PipelineSettings>): Promise<PipelineSettings> {
  const supabase = getSupabaseClient();
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.autoIngestApiSources !== undefined) update.auto_ingest_api_sources = patch.autoIngestApiSources;
  if (patch.autoTailor !== undefined) update.auto_tailor = patch.autoTailor;
  if (patch.maxDailyAutoTailor !== undefined) update.max_daily_auto_tailor = patch.maxDailyAutoTailor;

  const { data, error } = await supabase
    .from('pipeline_settings')
    .update(update)
    .eq('id', 1)
    .select()
    .single();

  if (error) throw new Error(`[PIPELINE_SETTINGS_ERROR:update] ${error.message}`);
  return rowToSettings(data);
}
