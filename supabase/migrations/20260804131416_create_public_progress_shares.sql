insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'progress-shares',
  'progress-shares',
  true,
  262144,
  array['application/json']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users_can_read_own_progress_shares"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'progress-shares'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_can_upload_own_progress_shares"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'progress-shares'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_can_update_own_progress_shares"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'progress-shares'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'progress-shares'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "users_can_delete_own_progress_shares"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'progress-shares'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
