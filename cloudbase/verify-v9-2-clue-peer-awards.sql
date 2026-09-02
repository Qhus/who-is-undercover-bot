-- A3 提示大王 V3.2 只读核验。期望每行 ok 均为 true。
with defs as (
  select
    pg_get_functiondef('public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb)'::regprocedure) action_def,
    pg_get_functiondef('public.clue_v32_finish_round(text,jsonb,bigint,text,text,integer,jsonb)'::regprocedure) finish_def,
    pg_get_functiondef('public.get_my_clue_round_v32(text)'::regprocedure) private_def
), checks(expected_check,actual,ok) as (
  select 'V3.2 peer like table exists with RLS',
    (count(*)=1)::text,
    count(*)=1
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='clue_v32_peer_likes' and c.relrowsecurity
  union all select 'V3.2 public RPCs exist',
    ((to_regprocedure('public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb)') is not null
      and to_regprocedure('public.get_my_clue_round_v32(text)') is not null)::text),
    to_regprocedure('public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb)') is not null
      and to_regprocedure('public.get_my_clue_round_v32(text)') is not null
  union all select 'anon can execute V3.2 RPCs',
    ((has_function_privilege('anon','public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb)','execute')
      and has_function_privilege('anon','public.get_my_clue_round_v32(text)','execute'))::text),
    has_function_privilege('anon','public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb)','execute')
      and has_function_privilege('anon','public.get_my_clue_round_v32(text)','execute')
  union all select 'score constraint accepts the unique four point award',
    (position('4' in pg_get_constraintdef(oid))>0)::text,
    position('4' in pg_get_constraintdef(oid))>0
  from pg_constraint
  where conrelid='public.clue_v1_clues'::regclass and conname='clue_v1_clues_score_check'
  union all select 'talkative role requires a 12 to 20 character spoken clue',
    ((rule_text like '%12–20%' and rule_text like '%口语%')::text),
    rule_text like '%12–20%' and rule_text like '%口语%'
  from public.clue_role_bank_v3 where id='R02'
  union all select 'peer like is optional and rejects self votes',
    ((position('submit_peer_like' in action_def)>0
      and position('不能给自己的提示点赞' in action_def)>0
      and position('rating' in action_def)>0
      and position('result' in action_def)>0)::text),
    position('submit_peer_like' in action_def)>0
      and position('不能给自己的提示点赞' in action_def)>0
      and position('rating' in action_def)>0
      and position('result' in action_def)>0 from defs
  union all select 'round result exposes unique and peer awards',
    ((position('isMostUnique' in finish_def)>0
      and position('uniqueAwards' in finish_def)>0
      and position('peerLikeCount' in finish_def)>0
      and position('peerLikes' in finish_def)>0)::text),
    position('isMostUnique' in finish_def)>0
      and position('uniqueAwards' in finish_def)>0
      and position('peerLikeCount' in finish_def)>0
      and position('peerLikes' in finish_def)>0 from defs
  union all select 'private round returns the players own clue id',
    (position('clueId' in private_def)>0)::text,
    position('clueId' in private_def)>0 from defs
  union all select 'peer votes tolerate concurrent version updates',
    ((position('p_action_type=''submit_peer_like''' in replace(action_def,' ',''))>0
      and position('g.version<>p_expected_version' in replace(action_def,' ',''))>0)::text),
    position('p_action_type=''submit_peer_like''' in replace(action_def,' ',''))>0
      and position('g.version<>p_expected_version' in replace(action_def,' ',''))>0 from defs
)
select expected_check,actual,ok from checks;
