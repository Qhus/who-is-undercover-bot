-- 只读核验：执行 V5 增量迁移后运行，期望所有 ok 均为 true。
with checks(expected,actual,ok) as (
  values
  ('at least 15 complete case packs',
    (select count(*)::text from public.court_case_packs where enabled),
    (select count(*)>=15 from public.court_case_packs where enabled)),
  ('v5 private tables exist',
    (select count(*)::text from pg_class where oid in (
      to_regclass('public.court_v5_submissions'),
      to_regclass('public.court_v5_votes'),
      to_regclass('public.court_v5_actions')
    )),
    (select count(*)=3 from pg_class where oid in (
      to_regclass('public.court_v5_submissions'),
      to_regclass('public.court_v5_votes'),
      to_regclass('public.court_v5_actions')
    ))),
  ('v5 apply RPC exists',
    (to_regprocedure('public.apply_court_action_v5(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text,
    to_regprocedure('public.apply_court_action_v5(text,text,text,text,integer,integer,bigint,jsonb)') is not null),
  ('v5 create and join RPCs exist',
    ((to_regprocedure('public.create_court_game_v5(text,text,text)') is not null)
      and (to_regprocedure('public.join_court_game_v5(text,text,text)') is not null))::text,
    (to_regprocedure('public.create_court_game_v5(text,text,text)') is not null)
      and (to_regprocedure('public.join_court_game_v5(text,text,text)') is not null)),
  ('anon can execute v5 RPCs',
    (has_function_privilege('anon','public.create_court_game_v5(text,text,text)','execute')
      and has_function_privilege('anon','public.join_court_game_v5(text,text,text)','execute')
      and has_function_privilege('anon','public.get_my_court_submission_v5(text)','execute')
      and has_function_privilege('anon','public.apply_court_action_v5(text,text,text,text,integer,integer,bigint,jsonb)','execute'))::text,
    has_function_privilege('anon','public.create_court_game_v5(text,text,text)','execute')
      and has_function_privilege('anon','public.join_court_game_v5(text,text,text)','execute')
      and has_function_privilege('anon','public.get_my_court_submission_v5(text)','execute')
      and has_function_privilege('anon','public.apply_court_action_v5(text,text,text,text,integer,integer,bigint,jsonb)','execute')),
  ('v5 private tables use RLS',
    (select bool_and(relrowsecurity)::text from pg_class where oid in (
      to_regclass('public.court_v5_submissions'),
      to_regclass('public.court_v5_votes'),
      to_regclass('public.court_v5_actions')
    )),
    (select bool_and(relrowsecurity) from pg_class where oid in (
      to_regclass('public.court_v5_submissions'),
      to_regclass('public.court_v5_votes'),
      to_regclass('public.court_v5_actions')
    ))),
  ('both writing stages use 120 seconds',
    ((select prosrc like '%p_now_ms+120000%' from pg_proc where oid=to_regprocedure('public.court_v5_begin_round(text,jsonb,integer,bigint)'))
      and (select prosrc like '%p_now_ms+120000%' from pg_proc where oid=to_regprocedure('public.court_v5_open_response(text,jsonb,bigint)')))::text,
    (select prosrc like '%p_now_ms+120000%' from pg_proc where oid=to_regprocedure('public.court_v5_begin_round(text,jsonb,integer,bigint)'))
      and (select prosrc like '%p_now_ms+120000%' from pg_proc where oid=to_regprocedure('public.court_v5_open_response(text,jsonb,bigint)'))),
  ('one confirmed vote per player and round',
    (select (pg_get_constraintdef(oid) ilike '%game_code, session_no, round_no, player_id%')::text
      from pg_constraint where conrelid=to_regclass('public.court_v5_votes') and contype='p'),
    (select pg_get_constraintdef(oid) ilike '%game_code, session_no, round_no, player_id%'
      from pg_constraint where conrelid=to_regclass('public.court_v5_votes') and contype='p')),
  ('restart creates a new session',
    (select (prosrc like '%sessionNo%+1%' and prosrc like '%previousSessionCaseIds%' and prosrc like '%totalScores%')::text
      from pg_proc where oid=to_regprocedure('public.court_v5_restart(jsonb,bigint)')),
    (select prosrc like '%sessionNo%+1%' and prosrc like '%previousSessionCaseIds%' and prosrc like '%totalScores%'
      from pg_proc where oid=to_regprocedure('public.court_v5_restart(jsonb,bigint)'))),
  ('v5 actions include session in idempotency key',
    (select (pg_get_constraintdef(oid) ilike '%game_code, session_no, action_id%')::text
      from pg_constraint where conrelid=to_regclass('public.court_v5_actions') and contype='p'),
    (select pg_get_constraintdef(oid) ilike '%game_code, session_no, action_id%'
      from pg_constraint where conrelid=to_regclass('public.court_v5_actions') and contype='p'))
)
select expected,actual,ok from checks;
