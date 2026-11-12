-- Core schema for auto-apply: applications, inbox, answer bank, settings, runs.
-- Idempotent: safe on a fresh database and on one where job_applications
-- already exists (created earlier by supabase/schema.sql).
-- New tables have RLS enabled and NO policies, so the Supabase anon/public
-- key cannot read or write them; only the server-side connection can.

CREATE TABLE IF NOT EXISTS public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  job_title text NOT NULL,
  job_url text,
  location text,
  job_type text,
  salary_range text,
  status text NOT NULL DEFAULT 'wishlist',
  match_score integer,
  job_description text,
  requirements text[],
  applied_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS contact_method jsonb;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS raw_post_content text;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS interviewed_at timestamptz;
ALTER TABLE public.job_applications ADD COLUMN IF NOT EXISTS offered_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS job_applications_source_external_id_key
  ON public.job_applications (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('question', 'approval', 'error')),
  prompt text NOT NULL,
  question_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'dismissed')),
  decision text CHECK (decision IN ('answered', 'approved', 'skipped')),
  answer text,
  resumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_items_open_question_key
  ON public.inbox_items (job_application_id, question_key)
  WHERE status = 'open' AND kind = 'question';

CREATE TABLE IF NOT EXISTS public.answer_bank (
  key text PRIMARY KEY,
  question_text text NOT NULL,
  answer text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skip_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_application_id uuid REFERENCES public.job_applications(id) ON DELETE CASCADE,
  reason text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  schedule_enabled boolean NOT NULL DEFAULT false,
  max_daily_drafts integer NOT NULL DEFAULT 20 CHECK (max_daily_drafts BETWEEN 1 AND 200)
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skip_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permissive (no-auth) access to job applications" ON public.job_applications;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
