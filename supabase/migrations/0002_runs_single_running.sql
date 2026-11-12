-- At most one run may be in the running state; the database enforces it so
-- concurrent startRun calls cannot both win. Idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS runs_single_running ON public.runs ((status)) WHERE status = 'running';
