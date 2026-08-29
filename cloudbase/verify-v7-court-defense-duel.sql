-- 离谱法堂 Draft 0.4 / V7 攻防样板核验。预期每一行 ok 均为 true。

with defs as (
  select
    pg_get_functiondef(to_regprocedure('public.court_v7_begin_round(text,jsonb,integer,bigint)')) begin_body,
    pg_get_functiondef(to_regprocedure('public.court_v7_open_questioning(text,jsonb,bigint)')) questioning_body,
    pg_get_functiondef(to_regprocedure('public.court_v7_open_voting(text,jsonb,bigint)')) voting_body,
    pg_get_functiondef(to_regprocedure('public.apply_court_action_v7(text,text,text,text,integer,integer,bigint,jsonb)')) apply_body
), checks(expected_check,actual) as (
  select 'exactly six complete V7 sample cases',(
    select count(*)::text from public.court_v7_case_archive archive
    where (select count(*) from public.court_v7_case_questions question where question.case_id=archive.case_id)=3
  )
  union all select 'at least eight enabled defense tactics',(select count(*)::text from public.court_v7_tactics where enabled)
  union all select 'V7 private tables exist',(
    select count(*)::text from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relname in ('court_v7_tactics','court_v7_case_questions','court_v7_case_archive','court_v7_assignments','court_v7_questions','court_v7_rerolls','court_v7_votes','court_v7_actions')
  )
  union all select 'V7 public RPCs exist',(
    (to_regprocedure('public.create_court_game_v7(text,text,text)') is not null
      and to_regprocedure('public.join_court_game_v7(text,text,text)') is not null
      and to_regprocedure('public.get_my_court_context_v7(text)') is not null
      and to_regprocedure('public.apply_court_action_v7(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text
  )
  union all select 'anon can execute V7 RPCs',(
    has_function_privilege('anon','public.create_court_game_v7(text,text,text)','execute')
      and has_function_privilege('anon','public.join_court_game_v7(text,text,text)','execute')
      and has_function_privilege('anon','public.get_my_court_context_v7(text)','execute')
      and has_function_privilege('anon','public.apply_court_action_v7(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  )::text
  union all select 'V7 private tables use RLS',(
    select bool_and(relation.relrowsecurity)::text from pg_class relation join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relname in ('court_v7_tactics','court_v7_case_questions','court_v7_case_archive','court_v7_assignments','court_v7_questions','court_v7_rerolls','court_v7_votes','court_v7_actions')
  )
  union all select 'V7 flow assigns tactics and opens 45 second questioning',(
    begin_body ~ 'court_v7_assignments' and questioning_body ~ 'p_now_ms\s*\+\s*45000'
  )::text from defs
  union all select 'V7 action supports one reroll and question confirmation',(
    apply_body ~ 'reroll_court_tactic' and apply_body ~ 'confirm_court_question' and apply_body ~ 'court_v7_rerolls'
  )::text from defs
  union all select 'archive candidate appears only for two player rounds',(
    voting_body ~ 'jsonb_array_length\(v_state->''expectedPlayerIds''\)\s*=\s*2'
  )::text from defs
  union all select 'V7 keeps five minute response and two minute voting',(
    pg_get_functiondef(to_regprocedure('public.court_v7_open_response(text,jsonb,bigint)')) ~ 'p_now_ms\s*\+\s*300000'
      and voting_body ~ 'p_now_ms\s*\+\s*120000'
  )::text from defs
)
select expected_check,actual,
  case expected_check
    when 'exactly six complete V7 sample cases' then (actual='6')::text
    when 'at least eight enabled defense tactics' then ((actual::integer)>=8)::text
    when 'V7 private tables exist' then (actual='8')::text
    else (actual='true')::text
  end ok
from checks;
