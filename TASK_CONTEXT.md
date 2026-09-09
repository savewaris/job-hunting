# Task Context: T-0001

**Issue**: savewaris/job-hunting#1 -- Real job scraping, profile editor, resilient AI tailoring, reviewed cold-email queue
**Objective**: Resume job-hunting suite with real scraper, profile editor, resilient AI tailoring via shared battery, and reviewed cold-email queue

## Acceptance Criteria
- Scraper service pulls from Greenhouse/Lever/Ashby + RemoteOK/Arbeitnow with Thailand/remote location filter
- writes to job_applications
- Profile editor UI writes to master_profiles
- ai-tailor route uses shared AI battery package with graceful fallback if not yet published
- Cold-email review queue with explicit per-email Send button
- no automatic sending
- mockData.ts reads replaced with real Supabase queries where env vars exist
- others noted in summary
- npm run build and npm run dev verified with real terminal output

## Allowed Tools
Read, Edit, Write, Bash, Grep, Glob
