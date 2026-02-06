-- ============================================================
-- KEMO - 开发环境重置脚本
-- ⚠️ 警告: 此脚本会删除所有数据！仅用于开发环境！
-- 用法: 需要重置数据库时在 Supabase SQL Editor 中执行
-- ============================================================

-- 清空所有业务表数据（保留表结构）
truncate public.events cascade;
truncate public.usage_counters cascade;
truncate public.subscriptions cascade;
truncate public.credits_ledger cascade;
truncate public.confirmations cascade;
truncate public.term_occurrences cascade;
truncate public.glossary_terms cascade;
truncate public.memos cascade;
truncate public.transcripts cascade;
truncate public.audio_assets cascade;
truncate public.jobs cascade;

-- 清空 Storage 文件（需要单独在 Supabase Dashboard 操作或通过 API 删除）
-- 此 SQL 无法直接删除 Storage 文件，请在 Dashboard 的 Storage 页面手动清空 audio 桶
