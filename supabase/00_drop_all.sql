-- ============================================================
-- KEMO - 删除所有旧表（重建前执行）
-- ⚠️ 警告: 会删除所有业务表！仅在需要重建 schema 时使用
-- ============================================================

drop table if exists public.events cascade;
drop table if exists public.usage_counters cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.credits_ledger cascade;
drop table if exists public.confirmations cascade;
drop table if exists public.term_occurrences cascade;
drop table if exists public.glossary_terms cascade;
drop table if exists public.memos cascade;
drop table if exists public.transcripts cascade;
drop table if exists public.audio_assets cascade;
drop table if exists public.jobs cascade;
drop function if exists public.handle_updated_at() cascade;
