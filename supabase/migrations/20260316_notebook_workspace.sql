create extension if not exists "pgcrypto";

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  accent_color text default '#39FF14',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

alter table public.jobs
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists guest_name text,
  add column if not exists interviewer_name text,
  add column if not exists source_type text default 'audio_upload',
  add column if not exists capture_mode text default 'upload',
  add column if not exists live_transcript_snapshot text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists is_archived boolean not null default false;

alter table public.audio_assets
  add column if not exists keep_source boolean not null default true;

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  kind text not null,
  title text not null,
  content text,
  summary text,
  status text not null default 'ready',
  metadata jsonb,
  audio_url text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists artifacts_updated_at on public.artifacts;
create trigger artifacts_updated_at
  before update on public.artifacts
  for each row execute function public.handle_updated_at();

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  artifact_id uuid references public.artifacts(id) on delete cascade,
  item_type text not null,
  label text,
  excerpt text,
  created_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  source_type text not null default 'url',
  title text,
  url text,
  domain text,
  raw_text text,
  extracted_text text,
  status text not null default 'ready',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists sources_updated_at on public.sources;
create trigger sources_updated_at
  before update on public.sources
  for each row execute function public.handle_updated_at();

create unique index if not exists idx_favorites_user_artifact
  on public.favorites(user_id, artifact_id)
  where artifact_id is not null;

create unique index if not exists idx_sources_project_url
  on public.sources(project_id, url)
  where url is not null;

create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_jobs_project_id on public.jobs(project_id);
create index if not exists idx_artifacts_job_id on public.artifacts(job_id);
create index if not exists idx_artifacts_project_id on public.artifacts(project_id);
create index if not exists idx_artifacts_kind on public.artifacts(kind);
create index if not exists idx_favorites_user_id on public.favorites(user_id);
create index if not exists idx_favorites_project_id on public.favorites(project_id);
create index if not exists idx_sources_user_id on public.sources(user_id);
create index if not exists idx_sources_project_id on public.sources(project_id);
create index if not exists idx_sources_source_type on public.sources(source_type);

alter table public.projects enable row level security;
alter table public.artifacts enable row level security;
alter table public.favorites enable row level security;
alter table public.sources enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects
  for select using (user_id = auth.uid());
create policy "projects_insert_own" on public.projects
  for insert with check (user_id = auth.uid());
create policy "projects_update_own" on public.projects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projects_delete_own" on public.projects
  for delete using (user_id = auth.uid());

drop policy if exists "artifacts_select_own" on public.artifacts;
drop policy if exists "artifacts_insert_own" on public.artifacts;
drop policy if exists "artifacts_update_own" on public.artifacts;
drop policy if exists "artifacts_delete_own" on public.artifacts;

create policy "artifacts_select_own" on public.artifacts
  for select using (user_id = auth.uid());
create policy "artifacts_insert_own" on public.artifacts
  for insert with check (user_id = auth.uid());
create policy "artifacts_update_own" on public.artifacts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "artifacts_delete_own" on public.artifacts
  for delete using (user_id = auth.uid());

drop policy if exists "favorites_select_own" on public.favorites;
drop policy if exists "favorites_insert_own" on public.favorites;
drop policy if exists "favorites_update_own" on public.favorites;
drop policy if exists "favorites_delete_own" on public.favorites;

create policy "favorites_select_own" on public.favorites
  for select using (user_id = auth.uid());
create policy "favorites_insert_own" on public.favorites
  for insert with check (user_id = auth.uid());
create policy "favorites_update_own" on public.favorites
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "favorites_delete_own" on public.favorites
  for delete using (user_id = auth.uid());

drop policy if exists "sources_select_own" on public.sources;
drop policy if exists "sources_insert_own" on public.sources;
drop policy if exists "sources_update_own" on public.sources;
drop policy if exists "sources_delete_own" on public.sources;

create policy "sources_select_own" on public.sources
  for select using (user_id = auth.uid());
create policy "sources_insert_own" on public.sources
  for insert with check (user_id = auth.uid());
create policy "sources_update_own" on public.sources
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sources_delete_own" on public.sources
  for delete using (user_id = auth.uid());
