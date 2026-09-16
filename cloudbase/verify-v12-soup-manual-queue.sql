-- A5 V1.2 只读核验：执行完 concurrency-v12-soup-manual-queue.sql 后运行。
with checks(expected_check,actual,ok) as (
  select 'manual secret table exists with RLS',
    coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('public.soup_manual_secrets_v12')),'false'),
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.soup_manual_secrets_v12')),false)
  union all select 'solution draft column exists',
    (select count(*)::text from information_schema.columns where table_schema='public' and table_name='soup_drafts_v1' and column_name='solution_text'),
    (select count(*)=1 from information_schema.columns where table_schema='public' and table_name='soup_drafts_v1' and column_name='solution_text')
  union all select 'five V1.2 RPCs exist',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_soup_game_v12','join_soup_game_v12','get_my_soup_round_v12','save_soup_draft_v12','apply_soup_action_v12')),
    (select count(*)=5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_soup_game_v12','join_soup_game_v12','get_my_soup_round_v12','save_soup_draft_v12','apply_soup_action_v12'))
  union all select 'anon can execute V1.2 RPCs',
    (has_function_privilege('anon','public.create_soup_game_v12(text,text,text)','execute') and has_function_privilege('anon','public.join_soup_game_v12(text,text,text)','execute') and has_function_privilege('anon','public.get_my_soup_round_v12(text)','execute') and has_function_privilege('anon','public.save_soup_draft_v12(text,integer,integer,bigint,text,text)','execute') and has_function_privilege('anon','public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)','execute'))::text,
    has_function_privilege('anon','public.create_soup_game_v12(text,text,text)','execute') and has_function_privilege('anon','public.join_soup_game_v12(text,text,text)','execute') and has_function_privilege('anon','public.get_my_soup_round_v12(text)','execute') and has_function_privilege('anon','public.save_soup_draft_v12(text,integer,integer,bigint,text,text)','execute') and has_function_privilege('anon','public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  union all select 'queue enforces one unresolved item per player',
    (position('你已有一条内容正在等待汤主回答' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0)::text,
    position('你已有一条内容正在等待汤主回答' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0
  union all select 'questions use ten second cooldown',
    (position('now_ms-last_at<10000' in replace(pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')),' ',''))>0)::text,
    position('now_ms-last_at<10000' in replace(pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')),' ',''))>0
  union all select 'host is randomly selected without immediate cycle repeats',
    (position('order by random()' in lower(pg_get_functiondef(to_regprocedure('public.soup_v12_begin_round(jsonb,bigint)'))))>0 and position('servedHostIds' in pg_get_functiondef(to_regprocedure('public.soup_v12_begin_round(jsonb,bigint)')))>0)::text,
    position('order by random()' in lower(pg_get_functiondef(to_regprocedure('public.soup_v12_begin_round(jsonb,bigint)'))))>0 and position('servedHostIds' in pg_get_functiondef(to_regprocedure('public.soup_v12_begin_round(jsonb,bigint)')))>0
  union all select 'manual mode supports text and clickable image links',
    (position('surfaceImageUrl' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0 and position('bottomImageUrl' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0 and position('imageUrl' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0)::text,
    position('surfaceImageUrl' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0 and position('bottomImageUrl' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0 and position('imageUrl' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v12(text,text,text,text,integer,integer,bigint,jsonb)')))>0
)
select expected_check,actual,ok from checks;
