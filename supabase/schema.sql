-- Extensions
create extension if not exists "pgcrypto";

-- Jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  status text not null default 'pending',
  error_message text,
  audio_asset_id uuid,
  transcript_id uuid,
  memo_id uuid,
  needs_review boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audio assets
create table if not exists public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size bigint not null,
  mime_type text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

-- Transcripts
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete cascade,
  transcript_text text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

-- Memos
create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete cascade,
  ic_qa_text text,
  wechat_article_text text,
  created_at timestamptz not null default now()
);

-- Glossary terms (long-term memory)
create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  term text not null,
  normalized_term text,
  source text default 'user',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Term occurrences for review
create table if not exists public.term_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete cascade,
  term_id uuid references public.glossary_terms(id),
  term_text text not null,
  start_offset integer,
  end_offset integer,
  context text,
  confidence numeric,
  status text default 'pending',
  created_at timestamptz not null default now()
);

-- Confirmations (user review history)
create table if not exists public.confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete cascade,
  term_text text not null,
  confirmed_text text,
  action text not null, -- accept/edit/reject
  source text,
  context text,
  created_at timestamptz not null default now()
);

-- Credits ledger (usage accounting)
create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete set null,
  action text not null, -- debit/credit
  amount numeric not null,
  unit text not null, -- minutes/files/etc
  created_at timestamptz not null default now()
);

-- Subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  plan text default 'free',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Usage counters
create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  minutes_used numeric default 0,
  files_used integer default 0,
  updated_at timestamptz not null default now()
);

-- Events (optional audit)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Basic indexes
create index if not exists idx_jobs_user_id on public.jobs(user_id);
create index if not exists idx_audio_assets_user_id on public.audio_assets(user_id);
create index if not exists idx_transcripts_user_id on public.transcripts(user_id);
create index if not exists idx_memos_user_id on public.memos(user_id);
create index if not exists idx_glossary_terms_user_id on public.glossary_terms(user_id);
create unique index if not exists idx_glossary_terms_user_term on public.glossary_terms(user_id, term);
create index if not exists idx_term_occurrences_job_id on public.term_occurrences(job_id);
create index if not exists idx_confirmations_job_id on public.confirmations(job_id);
