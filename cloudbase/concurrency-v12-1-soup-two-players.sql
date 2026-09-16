-- A5 V1.12.1：允许两人开局，并让双人局在“下一碗”时交换汤主。
-- 前置：已执行 V10、V10.1 与 V1.12.0。本迁移不覆盖 V1.12 RPC。
begin;

create or replace function public.soup_v121_begin_round(p_state jsonb,p_now bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare active_ids jsonb; served jsonb; host_id text; host_name text; next_round integer;
begin
  select coalesce(jsonb_agg(value->>'id'),'[]'::jsonb) into active_ids
    from jsonb_array_elements(p_state->'players') where coalesce((value->>'alive')::boolean,true) and not coalesce((value->>'away')::boolean,false);
  if jsonb_array_length(active_ids)<2 then raise exception '至少需要 2 人才能开始'; end if;
  served:=coalesce(p_state->'servedHostIds','[]'::jsonb);
  select value#>>'{}' into host_id from jsonb_array_elements(active_ids) where not (served ? (value#>>'{}')) order by random() limit 1;
  if host_id is null then
    served:='[]'::jsonb;
    select value#>>'{}' into host_id from jsonb_array_elements(active_ids) order by random() limit 1;
  end if;
  select value->>'name' into host_name from jsonb_array_elements(p_state->'players') where value->>'id'=host_id;
  next_round:=coalesce((p_state->>'round')::integer,0)+1;
  return p_state||jsonb_build_object(
    'soupVersion',2,'round',next_round,'status','host_preparing','hostId',host_id,'hostName',host_name,
    'servedHostIds',served||to_jsonb(host_id),'surface',null,'surfaceImageUrl',null,'roundStartedAt',null,
    'effectiveQuestionCount',0,'maxQuestions',20,'extended',false,'hintsUsed',0,'publicHints','[]'::jsonb,
    'publicPosts','[]'::jsonb,'questionQueue','[]'::jsonb,'lastQuestionAtByPlayer','{}'::jsonb,
    'pendingAction',null,'records','[]'::jsonb,'revealedBottom',null,'revealedBottomImageUrl',null,
    'result',null,'feedbackCount',0,'updatedAt',p_now
  );
end $$;

create or replace function public.apply_soup_action_v121(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; g public.games%rowtype; prior public.soup_actions_v1%rowtype; s jsonb; now_ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;
  ver bigint; active_count integer; result jsonb;
begin
  if p_action_type not in ('start_soup_game','next_soup_round') then
    return public.apply_soup_action_v12(p_code,p_action_id,p_action_type,p_expected_status,p_expected_round,p_expected_session,p_expected_version,p_payload);
  end if;
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(p_action_id),0) not between 1 and 160 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '操作参数无效'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  select * into prior from public.soup_actions_v1 where game_code=g.code and session_no=p_expected_session and action_id=p_action_id;
  if found then
    if prior.actor_uid is distinct from auth.uid() or prior.action_type is distinct from p_action_type or prior.request_payload is distinct from p_payload then raise exception '操作编号已被使用，请重新操作'; end if;
    return prior.result||jsonb_build_object('outcome','duplicate','state',g.state,'version',g.version,'message','此操作已记录');
  end if;
  if (g.state->>'sessionNo')::integer is distinct from p_expected_session or (g.state->>'round')::integer is distinct from p_expected_round
    or g.state->>'status' is distinct from p_expected_status or g.version is distinct from p_expected_version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','state',g.state,'version',g.version,'message','状态已更新，请确认后重试');
  end if;
  s:=g.state;
  if p_action_type='start_soup_game' then
    if actor<>s->>'ownerId' or s->>'status'<>'lobby' then raise exception '仅负责人可开始'; end if;
    select count(*) into active_count from jsonb_array_elements(s->'players') where coalesce((value->>'alive')::boolean,true) and not coalesce((value->>'away')::boolean,false);
    if active_count<2 then raise exception '至少需要 2 人才能开始'; end if;
  else
    if actor<>s->>'ownerId' or s->>'status'<>'round_result' then raise exception '仅负责人可开始下一题'; end if;
  end if;
  s:=public.soup_v121_begin_round(s,now_ms);
  ver:=g.version+1; s:=jsonb_set(s,'{version}',to_jsonb(ver)); s:=jsonb_set(s,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=s,version=ver,updated_at=now() where code=g.code;
  result:=jsonb_build_object('outcome','applied','code','OK','message','操作已记录','state',s,'version',ver);
  insert into public.soup_actions_v1(game_code,session_no,action_id,actor_uid,actor_player_id,action_type,result,request_payload)
    values(g.code,p_expected_session,p_action_id,auth.uid(),actor,p_action_type,result,p_payload);
  return result;
end $$;

revoke all on function public.soup_v121_begin_round(jsonb,bigint) from public,anon,authenticated;
revoke all on function public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.apply_soup_action_v121(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;

commit;
