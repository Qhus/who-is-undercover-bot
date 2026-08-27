-- 只读核验：执行 V4.1 后运行，期望所有 ok 都为 true。
with checks(expected,actual,ok) as (
  values
  ('20 court cases',(select count(*)::text from public.court_cases where enabled),(select count(*)>=20 from public.court_cases where enabled)),
  ('30 court twists',(select count(*)::text from public.court_twists where enabled),(select count(*)>=30 from public.court_twists where enabled)),
  ('60 court keywords',(select count(*)::text from public.court_keywords where enabled),(select count(*)>=60 from public.court_keywords where enabled)),
  ('apply_court_action exists',(to_regprocedure('public.apply_court_action(text,text,text,text,integer,bigint,jsonb)') is not null)::text,to_regprocedure('public.apply_court_action(text,text,text,text,integer,bigint,jsonb)') is not null),
  ('anon can execute',has_function_privilege('anon','public.apply_court_action(text,text,text,text,integer,bigint,jsonb)','execute')::text,has_function_privilege('anon','public.apply_court_action(text,text,text,text,integer,bigint,jsonb)','execute')),
  ('private tables use RLS',(select bool_and(relrowsecurity)::text from pg_class where oid in (to_regclass('public.court_private_assignments'),to_regclass('public.court_submissions'),to_regclass('public.court_votes'))),(select bool_and(relrowsecurity) from pg_class where oid in (to_regclass('public.court_private_assignments'),to_regclass('public.court_submissions'),to_regclass('public.court_votes')))),
  ('immediate defense advance',(select (prosrc like '%n>=jsonb_array_length(state->''expectedPlayerIds'') then state:=public.court_reveal_defenses%')::text from pg_proc where oid=to_regprocedure('public.apply_court_action(text,text,text,text,integer,bigint,jsonb)')),(select prosrc like '%n>=jsonb_array_length(state->''expectedPlayerIds'') then state:=public.court_reveal_defenses%' from pg_proc where oid=to_regprocedure('public.apply_court_action(text,text,text,text,integer,bigint,jsonb)'))),
  ('result reveals author',(select (prosrc like '%authorName%')::text from pg_proc where oid=to_regprocedure('public.court_finish_voting(text,jsonb,bigint)')),(select prosrc like '%authorName%' from pg_proc where oid=to_regprocedure('public.court_finish_voting(text,jsonb,bigint)')))
)
select expected,actual,ok from checks;
