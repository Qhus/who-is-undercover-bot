-- 离谱法堂 Draft 0.3 / V6 只读核验。预期每一行 ok 均为 true。

with function_defs as (
  select
    pg_get_functiondef(to_regprocedure('public.create_court_game_v6(text,text,text)')) create_body,
    pg_get_functiondef(to_regprocedure('public.court_v6_begin_round(text,jsonb,integer,bigint)')) begin_body,
    pg_get_functiondef(to_regprocedure('public.court_v6_open_voting(text,jsonb,bigint)')) voting_body,
    pg_get_functiondef(to_regprocedure('public.court_v6_finish_voting(text,jsonb,bigint)')) finish_body,
    pg_get_functiondef(to_regprocedure('public.apply_court_action_v6(text,text,text,text,integer,integer,bigint,jsonb)')) apply_body
), checks(expected_check,actual) as (
  select 'at least 18 case packs have reference defenses',((select count(*) from public.court_case_packs where enabled and reference_statement is not null and reference_response is not null)>=18)::text
  union all select 'V6 private tables exist',(to_regclass('public.court_v6_votes') is not null and to_regclass('public.court_v6_actions') is not null)::text
  union all select 'V6 public RPCs exist',(to_regprocedure('public.create_court_game_v6(text,text,text)') is not null and to_regprocedure('public.join_court_game_v6(text,text,text)') is not null and to_regprocedure('public.get_my_court_submission_v6(text)') is not null and to_regprocedure('public.apply_court_action_v6(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text
  union all select 'anon can execute V6 RPCs',(has_function_privilege('anon','public.create_court_game_v6(text,text,text)','execute') and has_function_privilege('anon','public.join_court_game_v6(text,text,text)','execute') and has_function_privilege('anon','public.get_my_court_submission_v6(text)','execute') and has_function_privilege('anon','public.apply_court_action_v6(text,text,text,text,integer,integer,bigint,jsonb)','execute'))::text
  union all select 'V6 rooms require only two active players',coalesce((begin_body ~ 'jsonb_array_length\(expected\)\s*<\s*2')::text,'false') from function_defs
  union all select 'reference defense appears only when voting opens',coalesce((create_body !~ 'referenceStatement|referenceResponse' and begin_body !~ 'referenceStatement|referenceResponse' and voting_body ~ 'reference_statement' and voting_body ~ 'reference_response')::text,'false') from function_defs
  union all select 'one confirmed dual vote per player and round',((select count(*) from pg_constraint where conrelid='public.court_v6_votes'::regclass and contype='p')=1)::text
  union all select 'both vote categories are required',coalesce((apply_body ~ 'bestSubmissionId' and apply_body ~ 'truthSubmissionId' and apply_body ~ 'best_submission_id' and apply_body ~ 'truth_submission_id')::text,'false') from function_defs
  union all select 'same candidate may receive both category votes',coalesce((apply_body !~ 'best_target\s*(<>|is distinct from)\s*truth_target')::text,'false') from function_defs
  union all select 'reference scores do not enter player totals',coalesce((finish_body ~ 'from public\.court_v5_submissions submission' and finish_body ~ 'totalBestScores' and finish_body ~ 'totalTruthScores')::text,'false') from function_defs
  union all select 'V6 private tables use RLS',((select count(*) from pg_class where oid in ('public.court_v6_votes'::regclass,'public.court_v6_actions'::regclass) and relrowsecurity)=2)::text
)
select expected_check,actual,(actual='true')::text ok from checks;
