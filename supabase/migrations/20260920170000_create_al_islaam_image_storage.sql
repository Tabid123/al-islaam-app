-- Al-islaam admin image storage.
-- Public storefronts need stable image URLs; only authenticated admins may write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('banners', 'banners', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('provider-logos', 'provider-logos', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Al-islaam public image reads" on storage.objects;
create policy "Al-islaam public image reads"
on storage.objects for select
to public
using (bucket_id in ('banners','provider-logos'));

drop policy if exists "Al-islaam admins upload images" on storage.objects;
create policy "Al-islaam admins upload images"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('banners','provider-logos')
  and public.is_admin()
);

drop policy if exists "Al-islaam admins update images" on storage.objects;
create policy "Al-islaam admins update images"
on storage.objects for update
to authenticated
using (
  bucket_id in ('banners','provider-logos')
  and public.is_admin()
)
with check (
  bucket_id in ('banners','provider-logos')
  and public.is_admin()
);

drop policy if exists "Al-islaam admins delete images" on storage.objects;
create policy "Al-islaam admins delete images"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('banners','provider-logos')
  and public.is_admin()
);
