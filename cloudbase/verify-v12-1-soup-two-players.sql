-- A5 V1.12.1 只读核验：执行完 concurrency-v12-1-soup-two-players.sql 后运行。
with checks(expected_check,actual,ok) as (
  select 'V1.12.1 action RPC exists',
    (to_regprocedure('public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text,
    to_regprocedure('public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)') is not null
  union all select 'anon can execute V1.12.1 action RPC',
    has_function_privilege('anon','public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)','execute')::text,
    has_function_privilege('anon','public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  union all select 'round helper accepts two active players',
    (position('jsonb_array_length(active_ids)<2' in replace(pg_get_functiondef(to_regprocedure('public.soup_v121_begin_round(jsonb,bigint)')),' ',''))>0)::text,
    position('jsonb_array_length(active_ids)<2' in replace(pg_get_functiondef(to_regprocedure('public.soup_v121_begin_round(jsonb,bigint)')),' ',''))>0
  union all select 'start action accepts two active players',
    (position('active_count<2' in replace(pg_get_functiondef(to_regprocedure('public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)')),' ',''))>0)::text,
    position('active_count<2' in replace(pg_get_functiondef(to_regprocedure('public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)')),' ',''))>0
  union all select 'next bowl uses the two player round helper',
    (position('soup_v121_begin_round' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)')))>0)::text,
    position('soup_v121_begin_round' in pg_get_functiondef(to_regprocedure('public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb)')))>0
)
select expected_check,actual,ok from checks;
