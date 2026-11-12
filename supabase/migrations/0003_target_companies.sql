-- Target companies for direct career-page / ATS job discovery.
-- Prioritizes direct company career pages (Greenhouse, Lever, Ashby, and direct HTML/JSON career URLs)
-- over third-party job boards.

CREATE TABLE IF NOT EXISTS public.target_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  careers_url text NOT NULL,
  ats_type text NOT NULL CHECK (ats_type IN ('greenhouse', 'lever', 'ashby', 'direct_careers')),
  ats_slug text,
  location_hint text,
  enabled boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_found_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS target_companies_careers_url_key
  ON public.target_companies (careers_url);

ALTER TABLE public.target_companies ENABLE ROW LEVEL SECURITY;

-- Curated starter list of direct company career pages (Bangkok & Remote-friendly engineering teams)
INSERT INTO public.target_companies (name, careers_url, ats_type, ats_slug, location_hint)
VALUES
  ('Agoda', 'https://careersatagoda.com', 'greenhouse', 'agoda', 'Bangkok, Thailand'),
  ('Omise (Opn)', 'https://www.opn.ooo/th-en/careers/', 'lever', 'omise', 'Bangkok, Thailand / Hybrid'),
  ('Supabase', 'https://jobs.ashbyhq.com/supabase', 'ashby', 'supabase', 'Remote (Worldwide)'),
  ('GitLab', 'https://boards.greenhouse.io/gitlab', 'greenhouse', 'gitlab', 'Remote (Worldwide)'),
  ('PostHog', 'https://jobs.ashbyhq.com/posthog', 'ashby', 'posthog', 'Remote (Worldwide)'),
  ('Automattic', 'https://boards.greenhouse.io/automatticcareers', 'greenhouse', 'automatticcareers', 'Remote (Worldwide)'),
  ('Cal.com', 'https://jobs.ashbyhq.com/cal', 'ashby', 'cal', 'Remote (Worldwide)'),
  ('Sourcegraph', 'https://boards.greenhouse.io/sourcegraph91', 'greenhouse', 'sourcegraph91', 'Remote (Worldwide)')
ON CONFLICT (careers_url) DO NOTHING;
