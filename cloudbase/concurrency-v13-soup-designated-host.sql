-- A5 V1.13：每题开始前由负责人指定汤主。前置 V10、V10.1、V12、V12.1。
-- 只新增函数；旧客户端 RPC 保留。先运行本脚本与只读核验，再发布前端。
begin;

create or replace function public.soup_v13_begin_round(p_state jsonb,p_now bigint,p_host_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare active_count integer; host_name text; served jsonb;
begin
  select count(*) into active_count from jsonb_array_elements(p_state->'players')
    where coalesce((value->>'alive')::boolean,true) and not coalesce((value->>'away')::boolean,false);
  if active_count<2 then raise exception '至少需要 2 人才能开始'; end if;
  if coalesce(trim(p_host_id),'')='' then raise exception '请先指定本题汤主'; end if;
  select value->>'name' into host_name from jsonb_array_elements(p_state->'players')
    where value->>'id'=p_host_id and coalesce((value->>'alive')::boolean,true) and not coalesce((value->>'away')::boolean,false);
  if not found then raise exception '指定的汤主不在当前可参与成员中，请重新选择'; end if;
  served:=coalesce(p_state->'servedHostIds','[]'::jsonb);
  if not (served ? p_host_id) then served:=served||to_jsonb(p_host_id); end if;
  return p_state||jsonb_build_object(
    'soupVersion',2,'round',coalesce((p_state->>'round')::integer,0)+1,'status','host_preparing',
    'hostId',p_host_id,'hostName',host_name,'hostSelection','designated','servedHostIds',served,
    'surface',null,'surfaceImageUrl',null,'roundStartedAt',null,
    'effectiveQuestionCount',0,'maxQuestions',20,'extended',false,'hintsUsed',0,'publicHints','[]'::jsonb,
    'publicPosts','[]'::jsonb,'questionQueue','[]'::jsonb,'lastQuestionAtByPlayer','{}'::jsonb,
    'pendingAction',null,'records','[]'::jsonb,'revealedBottom',null,'revealedBottomImageUrl',null,
    'result',null,'feedbackCount',0,'updatedAt',p_now
  );
end $$;

create or replace function public.apply_soup_action_v13(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor text; g public.games%rowtype; prior public.soup_actions_v1%rowtype; s jsonb;
  now_ms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; ver bigint; result jsonb;
begin
  if p_action_type is null then raise exception '操作类型无效'; end if;
  if p_action_type not in ('start_soup_game','next_soup_round') then
    return public.apply_soup_action_v12(p_code,p_action_id,p_action_type,p_expected_status,p_expected_round,p_expected_session,p_expected_version,p_payload);
  end if;
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(p_action_id),0) not between 1 and 160 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '操作参数无效'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType' is distinct from 'soup_detective' or g.state->>'soupVersion' is distinct from '2' then raise exception 'A5 手动出题房间不存在'; end if;
  select * into prior from public.soup_actions_v1 where game_code=g.code and session_no=p_expected_session and action_id=p_action_id;
  if found then
    if prior.actor_uid is distinct from auth.uid() or prior.action_type is distinct from p_action_type or prior.request_payload is distinct from p_payload then raise exception '操作编号已被使用，请重新操作'; end if;
    return prior.result||jsonb_build_object('outcome','duplicate','state',g.state,'version',g.version,'message','此操作已记录');
  end if;
  if (g.state->>'sessionNo')::integer is distinct from p_expected_session or (g.state->>'round')::integer is distinct from p_expected_round
    or g.state->>'status' is distinct from p_expected_status or g.version is distinct from p_expected_version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','state',g.state,'version',g.version,'message','成员或阶段已更新，请确认汤主后重试');
  end if;
  s:=g.state;
  if actor<>s->>'ownerId' then raise exception '仅负责人可以指定汤主并开始'; end if;
  if (p_action_type='start_soup_game' and s->>'status'<>'lobby') or (p_action_type='next_soup_round' and s->>'status'<>'round_result') then raise exception '当前阶段不能开始题目'; end if;
  if jsonb_typeof(p_payload->'hostId') is distinct from 'string' then raise exception '请先指定本题汤主'; end if;
  s:=public.soup_v13_begin_round(s,now_ms,p_payload->>'hostId');
  ver:=g.version+1; s:=jsonb_set(s,'{version}',to_jsonb(ver));
  update public.games set state=s,version=ver,updated_at=now() where code=g.code;
  result:=jsonb_build_object('outcome','applied','code','OK','message','已指定汤主，请汤主准备题目','state',s,'version',ver);
  insert into public.soup_actions_v1(game_code,session_no,action_id,actor_uid,actor_player_id,action_type,result,request_payload)
    values(g.code,p_expected_session,p_action_id,auth.uid(),actor,p_action_type,result,p_payload);
  return result;
end $$;

revoke all on function public.soup_v13_begin_round(jsonb,bigint,text) from public,anon,authenticated;
revoke all on function public.apply_soup_action_v13(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.apply_soup_action_v13(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
commit;
