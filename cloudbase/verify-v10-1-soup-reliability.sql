-- 只读检查；不是多人端到端或题库盲测的替代品。所有行 ok 应为 true。
with rpc(signature) as (values
  ('get_my_soup_round_v11(text)'),
  ('save_soup_draft_v11(text,integer,integer,bigint,text)'),
  ('submit_soup_feedback_v11(text,integer,integer,jsonb)'),
  ('apply_soup_action_v11(text,text,text,text,integer,integer,bigint,jsonb)')
), checks(expected_check,actual,ok) as (
  select 'four A5 V1.1 RPCs exist',count(to_regprocedure('public.'||signature))::text,count(to_regprocedure('public.'||signature))=4 from rpc
  union all
  select 'anon can execute all four V1.1 RPCs',coalesce(bool_and(has_function_privilege('anon',to_regprocedure('public.'||signature),'EXECUTE')),false)::text,
    count(to_regprocedure('public.'||signature))=4 and coalesce(bool_and(has_function_privilege('anon',to_regprocedure('public.'||signature),'EXECUTE')),false) from rpc
  union all
  select 'draft revision column exists',count(*)::text,count(*)=1 from information_schema.columns where table_schema='public' and table_name='soup_drafts_v1' and column_name='revision' and data_type='bigint'
  union all
  select 'action request payload column exists',count(*)::text,count(*)=1 from information_schema.columns where table_schema='public' and table_name='soup_actions_v1' and column_name='request_payload' and data_type='jsonb'
  union all
  select 'five private A5 tables retain RLS',count(*)::text,count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('soup_case_bank_v1','soup_round_secrets_v1','soup_drafts_v1','soup_feedback_v1','soup_actions_v1') and c.relrowsecurity
  union all
  select 'draft writes check expected round and revision',coalesce(position('p_expected_revision' in pg_get_functiondef(to_regprocedure('public.save_soup_draft_v11(text,integer,integer,bigint,text)')))>0,false)::text,
    coalesce(position('STALE_ROUND' in pg_get_functiondef(to_regprocedure('public.save_soup_draft_v11(text,integer,integer,bigint,text)')))>0,false)
    and coalesce(position('v_revision is distinct from p_expected_revision' in pg_get_functiondef(to_regprocedure('public.save_soup_draft_v11(text,integer,integer,bigint,text)')))>0,false)
  union all
  select 'V1.1 migration does not approve pilot cards',count(*)::text,count(*)=0 from public.soup_case_bank_v1 where review_status='approved' and play_count<3
)
select expected_check,actual,ok from checks;
