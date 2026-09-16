-- A5 V1.12.2：创建私有图片桶，允许匿名登录用户上传并为自己的图片生成 24 小时签名链接。
-- 图片类型：PNG/JPEG/WebP/GIF；单张不超过 5 MB。
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('soup-images','soup-images',false,5*1024*1024,array['image/png','image/jpeg','image/webp','image/gif'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='buckets' and policyname='soup_images_bucket_select') then
    create policy soup_images_bucket_select on storage.buckets for select to anon,authenticated using(id='soup-images');
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='soup_images_select_own') then
    create policy soup_images_select_own on storage.objects for select to anon,authenticated using(bucket_id='soup-images' and owner_id=auth.uid());
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='soup_images_insert_own') then
    create policy soup_images_insert_own on storage.objects for insert to anon,authenticated with check(bucket_id='soup-images' and owner_id=auth.uid());
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='soup_images_delete_own') then
    create policy soup_images_delete_own on storage.objects for delete to anon,authenticated using(bucket_id='soup-images' and owner_id=auth.uid());
  end if;
end $$;

commit;
