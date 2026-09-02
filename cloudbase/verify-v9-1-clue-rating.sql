-- A3 提示大王 V3.1 只读核验。期望每行 ok 均为 true。
with defs as (
  select
    pg_get_functiondef('public.apply_clue_action_v31(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure) as action_def,
    pg_get_functiondef('public.clue_v31_finish_round(text,jsonb,bigint,text,text,integer,jsonb)'::regprocedure) as finish_def
), checks(expected_check,actual,ok) as (
  select 'V3.1 action RPC exists',
    (to_regprocedure('public.apply_clue_action_v31(text,text,text,text,integer,integer,bigint,jsonb)') is not null)::text,
    to_regprocedure('public.apply_clue_action_v31(text,text,text,text,integer,integer,bigint,jsonb)') is not null
  union all select 'anon can execute V3.1 action RPC',
    has_function_privilege('anon','public.apply_clue_action_v31(text,text,text,text,integer,integer,bigint,jsonb)','execute')::text,
    has_function_privilege('anon','public.apply_clue_action_v31(text,text,text,text,integer,integer,bigint,jsonb)','execute')
  union all select 'failed guesses enter rating',
    ((position('v_attempts>=3' in replace(action_def,' ',''))>0
      and position('三次均未命中，答案已公布，请完成提示评分' in action_def)>0
      and position('guessStatus' in action_def)>0
      and position('timeout' in action_def)>0)::text),
    position('v_attempts>=3' in replace(action_def,' ',''))>0
      and position('三次均未命中，答案已公布，请完成提示评分' in action_def)>0
      and position('guessStatus' in action_def)>0
      and position('timeout' in action_def)>0 from defs
  union all select 'rating accepts one optional four point award',
    ((position('^[1-4]$' in action_def)>0
      and position('n>1' in replace(action_def,' ',''))>0
      and position('每轮最多一条提示可以获得 4 分' in action_def)>0)::text),
    position('^[1-4]$' in action_def)>0
      and position('n>1' in replace(action_def,' ',''))>0
      and position('每轮最多一条提示可以获得 4 分' in action_def)>0 from defs
  union all select 'failed rounds still add hint scores',
    ((position('setscore=v_score' in replace(finish_def,' ',''))>0
      and position('hintScores' in finish_def)>0)::text),
    position('setscore=v_score' in replace(finish_def,' ',''))>0
      and position('hintScores' in finish_def)>0 from defs
  union all select 'failed rounds stay out of speed ranking',
    ((position('if v_correct then' in finish_def)>0
      and position('guessTimes' in finish_def)>0
      and position('elapsedMs' in finish_def)>0)::text),
    position('if v_correct then' in finish_def)>0
      and position('guessTimes' in finish_def)>0
      and position('elapsedMs' in finish_def)>0 from defs
)
select expected_check,actual,ok from checks;
