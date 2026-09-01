-- A3 提示大王 V1.1 只读核验。期望每行 ok 均为 true。
with checks(expected_check,actual,ok) as (
  values
    ('V2 action RPC exists',
      (to_regprocedure('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text,
      to_regprocedure('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)') is not null),
    ('anon can execute V2 action RPC',
      has_function_privilege('anon','public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)','execute')::text,
      has_function_privilege('anon','public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)','execute')),
    ('writing timer is extended from 90 to 120 seconds',
      (position('phaseDeadlineAt' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0 and position('30000' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0)::text,
      position('phaseDeadlineAt' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0 and position('30000' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0),
    ('guesser may try up to three times',
      (position('v_attempts>=3' in replace(pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure),' ',''))>0)::text,
      position('v_attempts>=3' in replace(pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure),' ',''))>0),
    ('wrong guesses are updated without ending early',
      (position('on conflict' in lower(pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure)))>0 and position('还可尝试' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0)::text,
      position('on conflict' in lower(pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure)))>0 and position('还可尝试' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0),
    ('V1 tables and flow are reused',
      (position('apply_clue_action_v1' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0 and position('clue_v1_guesses' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0)::text,
      position('apply_clue_action_v1' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0 and position('clue_v1_guesses' in pg_get_functiondef('public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure))>0)
)
select expected_check,actual,ok from checks;
