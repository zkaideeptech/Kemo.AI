-- ============================================================
-- KEMO - Row Level Security (RLS) 策略
-- 版本: v1.0.0
-- 日期: 2026-02-06
-- 用法: 在 00_schema.sql 执行完成后执行本文件
-- 规则: 所有表 user_id = auth.uid()，用户只能访问自己的数据
-- 说明: 所有 policy 先 drop 再 create，支持重复执行
-- ============================================================

-- 启用 RLS
alter table public.jobs enable row level security;
alter table public.audio_assets enable row level security;
alter table public.transcripts enable row level security;
alter table public.memos enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.term_occurrences enable row level security;
alter table public.confirmations enable row level security;
alter table public.credits_ledger enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.events enable row level security;

-- ============================================================
-- Jobs
-- ============================================================
drop policy if exists "jobs_select_own" on public.jobs;
drop policy if exists "jobs_insert_own" on public.jobs;
drop policy if exists "jobs_update_own" on public.jobs;
drop policy if exists "jobs_delete_own" on public.jobs;

create policy "jobs_select_own" on public.jobs
  for select using (user_id = auth.uid());
create policy "jobs_insert_own" on public.jobs
  for insert with check (user_id = auth.uid());
create policy "jobs_update_own" on public.jobs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "jobs_delete_own" on public.jobs
  for delete using (user_id = auth.uid());

-- ============================================================
-- Audio Assets
-- ============================================================
drop policy if exists "audio_assets_select_own" on public.audio_assets;
drop policy if exists "audio_assets_insert_own" on public.audio_assets;
drop policy if exists "audio_assets_update_own" on public.audio_assets;
drop policy if exists "audio_assets_delete_own" on public.audio_assets;

create policy "audio_assets_select_own" on public.audio_assets
  for select using (user_id = auth.uid());
create policy "audio_assets_insert_own" on public.audio_assets
  for insert with check (user_id = auth.uid());
create policy "audio_assets_update_own" on public.audio_assets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audio_assets_delete_own" on public.audio_assets
  for delete using (user_id = auth.uid());

-- ============================================================
-- Transcripts
-- ============================================================
drop policy if exists "transcripts_select_own" on public.transcripts;
drop policy if exists "transcripts_insert_own" on public.transcripts;
drop policy if exists "transcripts_update_own" on public.transcripts;
drop policy if exists "transcripts_delete_own" on public.transcripts;

create policy "transcripts_select_own" on public.transcripts
  for select using (user_id = auth.uid());
create policy "transcripts_insert_own" on public.transcripts
  for insert with check (user_id = auth.uid());
create policy "transcripts_update_own" on public.transcripts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transcripts_delete_own" on public.transcripts
  for delete using (user_id = auth.uid());

-- ============================================================
-- Memos
-- ============================================================
drop policy if exists "memos_select_own" on public.memos;
drop policy if exists "memos_insert_own" on public.memos;
drop policy if exists "memos_update_own" on public.memos;
drop policy if exists "memos_delete_own" on public.memos;

create policy "memos_select_own" on public.memos
  for select using (user_id = auth.uid());
create policy "memos_insert_own" on public.memos
  for insert with check (user_id = auth.uid());
create policy "memos_update_own" on public.memos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "memos_delete_own" on public.memos
  for delete using (user_id = auth.uid());

-- ============================================================
-- Glossary Terms
-- ============================================================
drop policy if exists "glossary_terms_select_own" on public.glossary_terms;
drop policy if exists "glossary_terms_insert_own" on public.glossary_terms;
drop policy if exists "glossary_terms_update_own" on public.glossary_terms;
drop policy if exists "glossary_terms_delete_own" on public.glossary_terms;

create policy "glossary_terms_select_own" on public.glossary_terms
  for select using (user_id = auth.uid());
create policy "glossary_terms_insert_own" on public.glossary_terms
  for insert with check (user_id = auth.uid());
create policy "glossary_terms_update_own" on public.glossary_terms
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "glossary_terms_delete_own" on public.glossary_terms
  for delete using (user_id = auth.uid());

-- ============================================================
-- Term Occurrences
-- ============================================================
drop policy if exists "term_occurrences_select_own" on public.term_occurrences;
drop policy if exists "term_occurrences_insert_own" on public.term_occurrences;
drop policy if exists "term_occurrences_update_own" on public.term_occurrences;
drop policy if exists "term_occurrences_delete_own" on public.term_occurrences;

create policy "term_occurrences_select_own" on public.term_occurrences
  for select using (user_id = auth.uid());
create policy "term_occurrences_insert_own" on public.term_occurrences
  for insert with check (user_id = auth.uid());
create policy "term_occurrences_update_own" on public.term_occurrences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "term_occurrences_delete_own" on public.term_occurrences
  for delete using (user_id = auth.uid());

-- ============================================================
-- Confirmations
-- ============================================================
drop policy if exists "confirmations_select_own" on public.confirmations;
drop policy if exists "confirmations_insert_own" on public.confirmations;
drop policy if exists "confirmations_update_own" on public.confirmations;
drop policy if exists "confirmations_delete_own" on public.confirmations;

create policy "confirmations_select_own" on public.confirmations
  for select using (user_id = auth.uid());
create policy "confirmations_insert_own" on public.confirmations
  for insert with check (user_id = auth.uid());

-- ============================================================
-- Credits Ledger（只读 + 系统写入）
-- ============================================================
drop policy if exists "credits_ledger_select_own" on public.credits_ledger;
drop policy if exists "credits_ledger_insert_own" on public.credits_ledger;
drop policy if exists "credits_ledger_update_own" on public.credits_ledger;
drop policy if exists "credits_ledger_delete_own" on public.credits_ledger;

create policy "credits_ledger_select_own" on public.credits_ledger
  for select using (user_id = auth.uid());

-- ============================================================
-- Subscriptions（只读，Stripe webhook 通过 service_role 写入）
-- ============================================================
drop policy if exists "subscriptions_select_own" on public.subscriptions;
drop policy if exists "subscriptions_insert_own" on public.subscriptions;
drop policy if exists "subscriptions_update_own" on public.subscriptions;
drop policy if exists "subscriptions_delete_own" on public.subscriptions;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (user_id = auth.uid());

-- ============================================================
-- Usage Counters（只读）
-- ============================================================
drop policy if exists "usage_counters_select_own" on public.usage_counters;
drop policy if exists "usage_counters_insert_own" on public.usage_counters;
drop policy if exists "usage_counters_update_own" on public.usage_counters;
drop policy if exists "usage_counters_delete_own" on public.usage_counters;

create policy "usage_counters_select_own" on public.usage_counters
  for select using (user_id = auth.uid());

-- ============================================================
-- Events（只读审计）
-- ============================================================
drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

create policy "events_select_own" on public.events
  for select using (user_id = auth.uid());
