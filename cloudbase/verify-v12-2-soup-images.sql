-- A5 V1.12.2 只读核验：执行完 storage-v12-2-soup-images.sql 后运行。
with checks(expected_check,actual,ok) as (
  select 'private soup image bucket exists',
    coalesce((select (not public)::text from storage.buckets where id='soup-images'),'false'),
    coalesce((select not public from storage.buckets where id='soup-images'),false)
  union all select 'bucket limits images to five MB',
    coalesce((select file_size_limit::text from storage.buckets where id='soup-images'),'missing'),
    coalesce((select file_size_limit=5*1024*1024 from storage.buckets where id='soup-images'),false)
  union all select 'bucket accepts four image MIME types',
    coalesce((select array_length(allowed_mime_types,1)::text from storage.buckets where id='soup-images'),'0'),
    coalesce((select allowed_mime_types @> array['image/png','image/jpeg','image/webp','image/gif'] from storage.buckets where id='soup-images'),false)
  union all select 'bucket metadata is visible to app roles',
    (select count(*)::text from pg_policies where schemaname='storage' and tablename='buckets' and policyname='soup_images_bucket_select'),
    (select count(*)=1 from pg_policies where schemaname='storage' and tablename='buckets' and policyname='soup_images_bucket_select')
  union all select 'upload and signed URL policies exist',
    (select count(*)::text from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('soup_images_select_own','soup_images_insert_own')),
    (select count(*)=2 from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('soup_images_select_own','soup_images_insert_own'))
)
select expected_check,actual,ok from checks;
