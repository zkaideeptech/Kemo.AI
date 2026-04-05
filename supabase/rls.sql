-- Enable RLS
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

-- Policies (user_id = auth.uid())
create policy "jobs_select_own" on public.jobs for select using (user_id = auth.uid());
create policy "jobs_insert_own" on public.jobs for insert with check (user_id = auth.uid());
create policy "jobs_update_own" on public.jobs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "jobs_delete_own" on public.jobs for delete using (user_id = auth.uid());

create policy "audio_assets_select_own" on public.audio_assets for select using (user_id = auth.uid());
create policy "audio_assets_insert_own" on public.audio_assets for insert with check (user_id = auth.uid());
create policy "audio_assets_update_own" on public.audio_assets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "audio_assets_delete_own" on public.audio_assets for delete using (user_id = auth.uid());

create policy "transcripts_select_own" on public.transcripts for select using (user_id = auth.uid());
create policy "transcripts_insert_own" on public.transcripts for insert with check (user_id = auth.uid());
create policy "transcripts_update_own" on public.transcripts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transcripts_delete_own" on public.transcripts for delete using (user_id = auth.uid());

create policy "memos_select_own" on public.memos for select using (user_id = auth.uid());
create policy "memos_insert_own" on public.memos for insert with check (user_id = auth.uid());
create policy "memos_update_own" on public.memos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "memos_delete_own" on public.memos for delete using (user_id = auth.uid());

create policy "glossary_terms_select_own" on public.glossary_terms for select using (user_id = auth.uid());
create policy "glossary_terms_insert_own" on public.glossary_terms for insert with check (user_id = auth.uid());
create policy "glossary_terms_update_own" on public.glossary_terms for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "glossary_terms_delete_own" on public.glossary_terms for delete using (user_id = auth.uid());

create policy "term_occurrences_select_own" on public.term_occurrences for select using (user_id = auth.uid());
create policy "term_occurrences_insert_own" on public.term_occurrences for insert with check (user_id = auth.uid());
create policy "term_occurrences_update_own" on public.term_occurrences for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "term_occurrences_delete_own" on public.term_occurrences for delete using (user_id = auth.uid());

create policy "confirmations_select_own" on public.confirmations for select using (user_id = auth.uid());
create policy "confirmations_insert_own" on public.confirmations for insert with check (user_id = auth.uid());
create policy "confirmations_update_own" on public.confirmations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "confirmations_delete_own" on public.confirmations for delete using (user_id = auth.uid());

create policy "credits_ledger_select_own" on public.credits_ledger for select using (user_id = auth.uid());
create policy "credits_ledger_insert_own" on public.credits_ledger for insert with check (user_id = auth.uid());
create policy "credits_ledger_update_own" on public.credits_ledger for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "credits_ledger_delete_own" on public.credits_ledger for delete using (user_id = auth.uid());

create policy "subscriptions_select_own" on public.subscriptions for select using (user_id = auth.uid());
create policy "subscriptions_insert_own" on public.subscriptions for insert with check (user_id = auth.uid());
create policy "subscriptions_update_own" on public.subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions_delete_own" on public.subscriptions for delete using (user_id = auth.uid());

create policy "usage_counters_select_own" on public.usage_counters for select using (user_id = auth.uid());
create policy "usage_counters_insert_own" on public.usage_counters for insert with check (user_id = auth.uid());
create policy "usage_counters_update_own" on public.usage_counters for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "usage_counters_delete_own" on public.usage_counters for delete using (user_id = auth.uid());

create policy "events_select_own" on public.events for select using (user_id = auth.uid());
create policy "events_insert_own" on public.events for insert with check (user_id = auth.uid());
create policy "events_update_own" on public.events for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "events_delete_own" on public.events for delete using (user_id = auth.uid());

