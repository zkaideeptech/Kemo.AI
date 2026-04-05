-- ============================================================
-- KEMO - Storage Bucket 配置: 头像
-- ============================================================

-- 创建头像存储桶（如果不存在）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,                          -- 头像允许公开，以便在 UI 渲染
  5242880,                       -- 5MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = excluded.public;

-- ============================================================
-- Storage RLS: 用户只能操作自己目录下的头像
-- ============================================================

drop policy if exists "avatars_upload_own" on storage.objects;
drop policy if exists "avatars_select_public" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;

-- 允许认证用户上传自己的头像 (路径: avatars/{user_id}/{filename})
create policy "avatars_upload_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 允许认证用户更新自己的头像
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 头像公开可读
create policy "avatars_select_public" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- 允许认证用户删除自己的头像
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
