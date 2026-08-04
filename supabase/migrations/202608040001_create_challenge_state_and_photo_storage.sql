create table if not exists public.challenge_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint challenge_states_data_is_object
    check (jsonb_typeof(data) = 'object')
);

alter table public.challenge_states enable row level security;

revoke all on table public.challenge_states from anon;
revoke all on table public.challenge_states from authenticated;
grant select, insert, update on table public.challenge_states to authenticated;

create policy "users_can_read_own_challenge"
on public.challenge_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users_can_create_own_challenge"
on public.challenge_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users_can_update_own_challenge"
on public.challenge_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'checkin-photos',
  'checkin-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users_can_read_own_checkin_photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_can_upload_own_checkin_photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_can_update_own_checkin_photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_can_delete_own_checkin_photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'checkin-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
