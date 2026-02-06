-- ============================================================
-- KEMO - 完整数据库 Schema
-- 版本: v1.0.0
-- 日期: 2026-02-06
-- 用法: 在 Supabase SQL Editor 中直接执行
-- 注意: 首次执行前请确保 Supabase 项目已创建
-- ============================================================

-- 启用必要扩展
create extension if not exists "pgcrypto";

-- ============================================================
-- 辅助函数：自动更新 updated_at 字段
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 1. Jobs（任务表）
-- 核心表，记录每个转写任务的生命周期
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  status text not null default 'pending'
    check (status in ('pending','queued','transcribing','extracting_terms','needs_review','summarizing','completed','failed')),
  error_message text,
  audio_asset_id uuid,           -- 指向 audio_assets.id（延迟约束，因为需要先建 job 再建 asset）
  transcript_id uuid,            -- 指向 transcripts.id
  memo_id uuid,                  -- 指向 memos.id
  needs_review boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jobs is '任务表：记录每个转写任务的完整生命周期';
comment on column public.jobs.status is '任务状态：pending → queued → transcribing → extracting_terms → needs_review → summarizing → completed / failed';

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 2. Audio Assets（音频资源表）
-- 记录上传的音频文件元数据（宪法第十三条：转录后删除原始文件）
-- ============================================================
create table if not exists public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  storage_path text not null,    -- Supabase Storage 路径，转录后会标记为 deleted:xxx
  file_name text not null,
  file_size bigint not null,     -- 字节数
  mime_type text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

comment on table public.audio_assets is '音频资源表：上传的音频文件元数据，转录完成后原始文件从 Storage 删除';

-- ============================================================
-- 3. Transcripts（转写结果表）
-- ============================================================
create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  transcript_text text not null,
  raw jsonb,                     -- ASR 原始返回数据
  created_at timestamptz not null default now()
);

comment on table public.transcripts is '转写结果表：ASR 转写文本及原始返回数据';

-- ============================================================
-- 4. Memos（摘要输出表）
-- IC Q&A 纪要 + 公众号长文
-- ============================================================
create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  ic_qa_text text,
  wechat_article_text text,
  created_at timestamptz not null default now()
);

comment on table public.memos is '摘要输出表：IC Q&A 纪要和公众号长文';

-- ============================================================
-- 5. Glossary Terms（术语库 - 长期记忆）
-- ============================================================
create table if not exists public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  normalized_term text,          -- 小写归一化
  source text default 'user',    -- user / confirmed / seed
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.glossary_terms is '术语库：用户确认的术语长期记忆';

drop trigger if exists glossary_terms_updated_at on public.glossary_terms;
create trigger glossary_terms_updated_at
  before update on public.glossary_terms
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 6. Term Occurrences（术语出现记录 - 待确认）
-- ============================================================
create table if not exists public.term_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  term_id uuid references public.glossary_terms(id) on delete set null,
  term_text text not null,
  start_offset integer,
  end_offset integer,
  context text,                  -- 术语出现的上下文片段
  confidence numeric,            -- 置信度 0-1
  status text default 'pending'
    check (status in ('pending','confirmed','rejected')),
  created_at timestamptz not null default now()
);

comment on table public.term_occurrences is '术语出现记录：ASR 抽取的候选术语，需用户确认';

-- ============================================================
-- 7. Confirmations（用户确认历史）
-- ============================================================
create table if not exists public.confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  term_text text not null,
  confirmed_text text,
  action text not null check (action in ('accept','edit','reject')),
  source text,                   -- user / auto
  context text,
  created_at timestamptz not null default now()
);

comment on table public.confirmations is '用户确认历史：术语确认/编辑/拒绝的审计记录';

-- ============================================================
-- 8. Credits Ledger（用量账本）
-- ============================================================
create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  action text not null check (action in ('debit','credit')),
  amount numeric not null,
  unit text not null,            -- minutes / files / tokens
  created_at timestamptz not null default now()
);

comment on table public.credits_ledger is '用量账本：记录用户的用量消耗和充值';

-- ============================================================
-- 9. Subscriptions（订阅表）
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text check (status is null or status in ('active','canceled','past_due','trialing')),
  plan text default 'free' check (plan in ('free','pro')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is '订阅表：Stripe 订阅状态管理';

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 10. Usage Counters（用量计数器）
-- ============================================================
create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  minutes_used numeric default 0,
  files_used integer default 0,
  updated_at timestamptz not null default now()
);

comment on table public.usage_counters is '用量计数器：按周期统计用户用量';

drop trigger if exists usage_counters_updated_at on public.usage_counters;
create trigger usage_counters_updated_at
  before update on public.usage_counters
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 11. Events（审计事件表）
-- ============================================================
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table public.events is '审计事件表：系统事件和用户操作日志';

-- ============================================================
-- 索引
-- ============================================================
create index if not exists idx_jobs_user_id on public.jobs(user_id);
create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_audio_assets_user_id on public.audio_assets(user_id);
create index if not exists idx_audio_assets_job_id on public.audio_assets(job_id);
create index if not exists idx_transcripts_user_id on public.transcripts(user_id);
create index if not exists idx_transcripts_job_id on public.transcripts(job_id);
create index if not exists idx_memos_user_id on public.memos(user_id);
create index if not exists idx_memos_job_id on public.memos(job_id);
create index if not exists idx_glossary_terms_user_id on public.glossary_terms(user_id);
create unique index if not exists idx_glossary_terms_user_term on public.glossary_terms(user_id, term);
create index if not exists idx_term_occurrences_job_id on public.term_occurrences(job_id);
create index if not exists idx_term_occurrences_status on public.term_occurrences(status);
create index if not exists idx_confirmations_job_id on public.confirmations(job_id);
create index if not exists idx_credits_ledger_user_id on public.credits_ledger(user_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_usage_counters_user_id on public.usage_counters(user_id);
create index if not exists idx_events_user_id on public.events(user_id);
create index if not exists idx_events_type on public.events(type);
