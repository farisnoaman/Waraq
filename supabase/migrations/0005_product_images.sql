-- =============================================================================
-- Waraq Pro: product photos in Supabase Storage.
--
-- The catalogue keeps `products.image` as a text column that holds either a
-- /images/... path or an https:// address. Before this, an administrator could
-- only point at one of the built-in photos or paste an address by hand. These
-- changes give them a real upload: the API puts the file in the public
-- 'product-images' bucket and stores the public address in the same column.
--
-- STATUS: written to be run once in the Supabase SQL editor, AFTER 0001 has
-- been applied. Running it twice is safe (the bucket and the policies are
-- created only when they are missing).
--
-- The bucket is public so the catalogue can show a photo without a signed-in
-- session. Only administrators may add, replace or remove a file: the API
-- checks the role on the server, and these policies make sure that a browser
-- holding the anon key cannot write to the bucket either.
-- =============================================================================

begin;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images are public" on storage.objects;
create policy "product images are public" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.app_role() = 'admin'
  );

drop policy if exists "admins replace product images" on storage.objects;
create policy "admins replace product images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.app_role() = 'admin'
  )
  with check (
    bucket_id = 'product-images'
    and public.app_role() = 'admin'
  );

drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.app_role() = 'admin'
  );

commit;

-- -----------------------------------------------------------------------
-- Verify after running:
--
--   select id, name, public from storage.buckets where id = 'product-images';
--
-- It should return one row with public = true.
-- -----------------------------------------------------------------------
