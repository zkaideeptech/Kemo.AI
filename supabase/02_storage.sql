-- ============================================================
-- KEMO - Storage Bucket 配置
-- 版本: v1.0.0
-- 日期: 2026-02-06
-- 用法: 在 Supabase SQL Editor 中执行
-- 注意: Supabase Storage 是项目级别的，Free 限制在应用层控制
-- 说明: 所有 policy 先 drop 再 create，支持重复执行
-- ============================================================

-- 创建音频存储桶（如果不存在）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,                         -- 不公开，通过 signed URL 访问
  52428800,                      -- 50MB (Free 用户限制，Pro 在应用层放宽)
  array['audio/mpeg','audio/wav','audio/ogg','audio/flac','audio/mp4','audio/x-m4a','audio/webm','audio/aac','audio/amr']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- Storage RLS: 用户只能操作自己目录下的文件
-- 存储路径格式: {user_id}/{job_id}/{filename}
-- ============================================================

drop policy if exists "audio_upload_own" on storage.objects;
drop policy if exists "audio_select_own" on storage.objects;
drop policy if exists "audio_delete_own" on storage.objects;

-- 允许认证用户上传到自己的目录
create policy "audio_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 允许认证用户读取自己的文件
create policy "audio_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 允许认证用户删除自己的文件
create policy "audio_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
