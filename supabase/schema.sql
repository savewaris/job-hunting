-- Schema for All-in-One Job Hunting Suite

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE,
  target_title TEXT,
  desired_salary INTEGER,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Job Applications Table
CREATE TABLE IF NOT EXISTS public.job_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT,
  location TEXT,
  job_type TEXT DEFAULT 'Full-time', -- Full-time, Remote, Contract, Hybrid
  salary_range TEXT,
  status TEXT DEFAULT 'wishlist', -- wishlist, applied, interviewing, offer, rejected
  match_score INTEGER DEFAULT 0, -- AI computed match % (0-100)
  job_description TEXT,
  requirements TEXT[],
  applied_date DATE,
  deadline_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Master Profiles Table (Master Resume Data)
CREATE TABLE IF NOT EXISTS public.master_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  summary TEXT,
  skills TEXT[],
  experiences JSONB DEFAULT '[]'::jsonb, -- Array of { company, role, dates, achievements }
  education JSONB DEFAULT '[]'::jsonb,   -- Array of { institution, degree, year }
  projects JSONB DEFAULT '[]'::jsonb,    -- Array of { name, description, techStack, link }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tailored Documents Table (AI Generated Resumes & Cover Letters)
CREATE TABLE IF NOT EXISTS public.tailored_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL, -- resume, cover_letter
  content TEXT NOT NULL,
  missing_skills TEXT[],
  match_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Interviews Table
CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE,
  round_name TEXT NOT NULL, -- Technical Screen, System Design, Hiring Manager, HR
  scheduled_at TIMESTAMPTZ NOT NULL,
  interviewer_names TEXT,
  prep_notes TEXT,
  feedback TEXT,
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Job Offers Table
CREATE TABLE IF NOT EXISTS public.offers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE CASCADE UNIQUE,
  base_salary INTEGER NOT NULL,
  signing_bonus INTEGER DEFAULT 0,
  annual_bonus_percent NUMERIC DEFAULT 0,
  equity_value INTEGER DEFAULT 0,
  benefits_score INTEGER DEFAULT 5, -- 1-10 rating
  remote_flexibility TEXT,
  deadline DATE,
  status TEXT DEFAULT 'pending', -- pending, accepted, declined, negotiating
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Cold Email Queue Table
CREATE TABLE IF NOT EXISTS public.cold_emails (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_application_id UUID REFERENCES public.job_applications(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  job_title TEXT,
  recipient_name TEXT,
  recipient_role TEXT,
  recipient_email TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, reviewed, sent
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can manage their own job applications" ON public.job_applications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their master profile" ON public.master_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their tailored docs" ON public.tailored_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their interviews" ON public.interviews FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their offers" ON public.offers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their cold emails" ON public.cold_emails FOR ALL USING (auth.uid() = user_id);

-- NOTE: This app has no Supabase auth flow yet (single personal user, anon key only).
-- Under the auth.uid()-based policies above, auth.uid() is always NULL, so every
-- insert/select above would silently fail. The permissive policies below intentionally
-- relax RLS to (true) so the app actually works today. This is a conscious tradeoff,
-- acceptable because the anon key is already client-exposed via NEXT_PUBLIC_* env vars
-- and this is a single-user tool. TODO (future tech debt): add real Supabase auth and
-- revert to the per-user policies above once that exists.
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own job applications" ON public.job_applications;
DROP POLICY IF EXISTS "Users can manage their master profile" ON public.master_profiles;
DROP POLICY IF EXISTS "Users can manage their tailored docs" ON public.tailored_documents;
DROP POLICY IF EXISTS "Users can manage their interviews" ON public.interviews;
DROP POLICY IF EXISTS "Users can manage their offers" ON public.offers;
DROP POLICY IF EXISTS "Users can manage their cold emails" ON public.cold_emails;

CREATE POLICY "Permissive (no-auth) access to profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive (no-auth) access to job applications" ON public.job_applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive (no-auth) access to master profiles" ON public.master_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive (no-auth) access to tailored docs" ON public.tailored_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive (no-auth) access to interviews" ON public.interviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive (no-auth) access to offers" ON public.offers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permissive (no-auth) access to cold emails" ON public.cold_emails FOR ALL USING (true) WITH CHECK (true);

