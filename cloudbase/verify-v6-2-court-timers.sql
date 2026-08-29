-- 离谱法堂 V1.6.2 节奏核验。预期每一行 ok 均为 true。

with defs as (
  select
    pg_get_functiondef(to_regprocedure('public.court_v6_begin_round(text,jsonb,integer,bigint)')) begin_body,
    pg_get_functiondef(to_regprocedure('public.court_v5_open_response(text,jsonb,bigint)')) response_body,
    pg_get_functiondef(to_regprocedure('public.court_v6_open_voting(text,jsonb,bigint)')) voting_body
), checks(expected_check,actual) as (
  select 'statement allows five minutes',coalesce((begin_body ~ 'p_now_ms\s*\+\s*300000')::text,'false') from defs
  union all select 'response allows five minutes',coalesce((response_body ~ 'p_now_ms\s*\+\s*300000')::text,'false') from defs
  union all select 'dual voting allows two minutes',coalesce((voting_body ~ 'p_now_ms\s*\+\s*120000')::text,'false') from defs
  union all select 'public V6 action RPC remains available',has_function_privilege('anon','public.apply_court_action_v6(text,text,text,text,integer,integer,bigint,jsonb)','execute')::text
)
select expected_check,actual,(actual='true')::text ok from checks;
