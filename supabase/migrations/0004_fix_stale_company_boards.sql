-- Cal.com and Opn no longer expose a public ATS board API (both returned 404),
-- so scan their own career pages instead.
UPDATE public.target_companies
SET ats_type = 'direct_careers', ats_slug = NULL, careers_url = 'https://cal.com/jobs'
WHERE careers_url = 'https://jobs.ashbyhq.com/cal';

UPDATE public.target_companies
SET ats_type = 'direct_careers', ats_slug = NULL
WHERE careers_url = 'https://www.opn.ooo/th-en/careers/';
