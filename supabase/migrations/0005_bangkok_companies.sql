-- Bangkok / Thailand developer employers. Each row was checked on 2026-11-17 against its live
-- board or career page with the project's own scanner (Bangkok-located developer roles found).
-- LINE MAN Wongnai's page is client-rendered: it needs CHROMIUM_PATH (see src/lib/renderPage.ts).
INSERT INTO public.target_companies (name, careers_url, ats_type, ats_slug, location_hint)
VALUES
  ('LINE MAN Wongnai', 'https://careers.lmwn.com/development', 'direct_careers', NULL, 'Bangkok, Thailand'),
  ('FlowAccount', 'https://flowaccount.com/en/jobs', 'direct_careers', NULL, 'Bangkok, Thailand'),
  ('Coda', 'https://jobs.lever.co/Coda', 'lever', 'Coda', 'Bangkok, Thailand'),
  ('aCommerce', 'https://boards.greenhouse.io/acommerce', 'greenhouse', 'acommerce', 'Bangkok, Thailand'),
  ('Sertis', 'https://boards.greenhouse.io/sertis', 'greenhouse', 'sertis', 'Bangkok, Thailand'),
  ('BJAK', 'https://jobs.ashbyhq.com/bjakcareer', 'ashby', 'bjakcareer', 'Thailand / Remote')
ON CONFLICT (careers_url) DO NOTHING;
