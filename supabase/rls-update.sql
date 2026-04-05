-- Drop existing policies if they exist
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

drop policy if exists "favorites_select_own" on public.favorites;
drop policy if exists "favorites_insert_own" on public.favorites;
drop policy if exists "favorites_update_own" on public.favorites;
drop policy if exists "favorites_delete_own" on public.favorites;

drop policy if exists "sources_select_own" on public.sources;
drop policy if exists "sources_insert_own" on public.sources;
drop policy if exists "sources_update_own" on public.sources;
drop policy if exists "sources_delete_own" on public.sources;

-- Enable RLS
alter table public.projects enable row level security;
alter table public.favorites enable row level security;
alter table public.sources enable row level security;

-- Create new policies
create policy "projects_select_own" on public.projects for select using (user_id = auth.uid());
create policy "projects_insert_own" on public.projects for insert with check (user_id = auth.uid());
create policy "projects_update_own" on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projects_delete_own" on public.projects for delete using (user_id = auth.uid());
