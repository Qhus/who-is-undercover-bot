-- A5 V1.1：在已执行 V10 后增量执行。本文件不重建题库，不修改 A2/A3/A4。
-- 使用新 RPC 名称，保留旧客户端入口；整个迁移在同一事务内完成。
begin;

alter table public.soup_drafts_v1 add column if not exists revision bigint not null default 0;
alter table public.soup_actions_v1 add column if not exists request_payload jsonb;

create or replace function public.get_my_soup_round_v11(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text; v_game public.games%rowtype; v_packet jsonb; v_revision bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into v_actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into v_game from public.games where code=upper(p_code) and expires_at>now() for share;
  if not found or v_game.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  v_packet:=public.soup_v1_private_packet(v_game.code,v_actor,v_game.state);
  select d.revision into v_revision from public.soup_drafts_v1 d where d.game_code=v_game.code
    and d.session_no=(v_game.state->>'sessionNo')::integer and d.round_no=(v_game.state->>'round')::integer and d.player_id=v_actor;
  return v_packet||jsonb_build_object('draftRevision',coalesce(v_revision,0),'feedbackSubmitted',exists(
    select 1 from public.soup_feedback_v1 f where f.game_code=v_game.code and f.session_no=(v_game.state->>'sessionNo')::integer
      and f.round_no=(v_game.state->>'round')::integer and f.player_id=v_actor));
end $$;

create or replace function public.save_soup_draft_v11(p_code text,p_expected_session integer,p_expected_round integer,p_expected_revision bigint,p_draft_text text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text; v_game public.games%rowtype; v_revision bigint; v_text text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_draft_text is null or length(p_draft_text)>240 then raise exception '草稿最多 240 字'; end if;
  select player_id into v_actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  -- Shared room lock keeps the round stable while independent players save in parallel.
  select * into v_game from public.games where code=upper(p_code) and expires_at>now() for share;
  if not found or v_game.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  if (v_game.state->>'sessionNo')::integer is distinct from p_expected_session or (v_game.state->>'round')::integer is distinct from p_expected_round then raise exception 'STALE_ROUND'; end if;
  if v_actor=v_game.state->>'hostId' then raise exception '汤主无需填写侦探草稿'; end if;
  if v_game.state->>'status' not in ('host_reading','investigating','judging_question','judging_solution','limit_reached') then raise exception '当前题目不能修改草稿'; end if;
  insert into public.soup_drafts_v1(game_code,session_no,round_no,player_id) values(v_game.code,p_expected_session,p_expected_round,v_actor)
    on conflict on constraint soup_drafts_v1_pkey do nothing;
  select d.revision,d.draft_text into v_revision,v_text from public.soup_drafts_v1 d
    where d.game_code=v_game.code and d.session_no=p_expected_session and d.round_no=p_expected_round and d.player_id=v_actor for update;
  if v_revision is distinct from p_expected_revision then
    return jsonb_build_object('accepted',v_text=p_draft_text,'privateRound',public.get_my_soup_round_v11(v_game.code));
  end if;
  if v_text is distinct from p_draft_text then
    update public.soup_drafts_v1 d set draft_text=p_draft_text,revision=v_revision+1,updated_at=clock_timestamp()
      where d.game_code=v_game.code and d.session_no=p_expected_session and d.round_no=p_expected_round and d.player_id=v_actor;
  end if;
  return jsonb_build_object('accepted',true,'privateRound',public.get_my_soup_round_v11(v_game.code));
end $$;

create or replace function public.submit_soup_feedback_v11(p_code text,p_expected_session integer,p_expected_round integer,p_feedback jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text; v_game public.games%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into v_actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into v_game from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or v_game.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  if (v_game.state->>'sessionNo')::integer is distinct from p_expected_session or (v_game.state->>'round')::integer is distinct from p_expected_round then raise exception 'STALE_ROUND'; end if;
  if v_game.state->>'status'<>'feedback' then raise exception '当前不在题后反馈阶段'; end if;
  if p_feedback is null or jsonb_typeof(p_feedback)<>'object' or coalesce(p_feedback->>'difficulty','') not in ('too_easy','just_right','too_hard') then raise exception '请选择难度感受'; end if;
  if (p_feedback ? 'ambiguous' and jsonb_typeof(p_feedback->'ambiguous')<>'boolean') or (p_feedback ? 'unsuitable' and jsonb_typeof(p_feedback->'unsuitable')<>'boolean') then raise exception '反馈标记须为是或否'; end if;
  if exists(select 1 from public.soup_feedback_v1 f where f.game_code=v_game.code and f.session_no=p_expected_session and f.round_no=p_expected_round and f.player_id=v_actor) then
    return jsonb_build_object('accepted',true);
  end if;
  return public.submit_soup_feedback_v1(v_game.code,p_feedback);
end $$;

create or replace function public.apply_soup_action_v11(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor text; v_game public.games%rowtype; v_prior public.soup_actions_v1%rowtype; v_result jsonb; v_state jsonb;
  v_now bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; v_secret public.soup_round_secrets_v1%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(p_action_id),0) not between 1 and 160 then raise exception '操作编号无效'; end if;
  if p_action_type is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '操作参数无效'; end if;
  select player_id into v_actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  -- Check idempotency AFTER acquiring the room lock, including simultaneous retries.
  select * into v_game from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or v_game.state->>'gameType' is distinct from 'soup_detective' then raise exception 'A5 房间不存在'; end if;
  select * into v_prior from public.soup_actions_v1 a where a.game_code=v_game.code and a.session_no=p_expected_session and a.action_id=p_action_id;
  if found then
    if v_prior.actor_uid is distinct from auth.uid() or v_prior.action_type is distinct from p_action_type
      or (v_prior.request_payload is not null and v_prior.request_payload is distinct from p_payload) then raise exception '操作编号已被使用，请重新操作'; end if;
    return v_prior.result||jsonb_build_object('outcome','duplicate','state',v_game.state,'version',v_game.version,'message','此操作已记录');
  end if;
  if (v_game.state->>'sessionNo')::integer is distinct from p_expected_session or (v_game.state->>'round')::integer is distinct from p_expected_round
    or v_game.state->>'status' is distinct from p_expected_status or v_game.version is distinct from p_expected_version then
    return jsonb_build_object('outcome','stale','code','STALE_STATE','state',v_game.state,'version',v_game.version,'message','状态已更新，请确认当前轮次后重试。');
  end if;
  if p_action_type='judge_soup_question' and coalesce(p_payload->>'verdict','') not in ('yes','no','irrelevant','partial','rephrase') then raise exception '请选择问题判定'; end if;
  if p_action_type='judge_soup_solution' and coalesce(p_payload->>'verdict','') not in ('success','close','wrong') then raise exception '请选择还原判定'; end if;
  if length(coalesce(p_payload->>'note',''))>160 then raise exception '补充说明最多 160 字'; end if;

  if p_action_type='end_soup_game' then
    if v_actor is distinct from v_game.state->>'ownerId' or v_game.state->>'status' in ('lobby','finished') then raise exception '当前不能结束本局'; end if;
    v_state:=v_game.state;
    select * into v_secret from public.soup_round_secrets_v1 s where s.game_code=v_game.code and s.session_no=p_expected_session and s.round_no=p_expected_round;
    if not found then raise exception '本题资料缺失'; end if;
    if v_state->'result' is null or v_state->'result'='null'::jsonb then
      update public.soup_case_bank_v1 set play_count=play_count+1,abandon_count=abandon_count+1,
        effective_question_total=effective_question_total+(v_state->>'effectiveQuestionCount')::integer,
        hint_use_count=hint_use_count+(v_state->>'hintsUsed')::integer where id=v_secret.case_id;
      v_state:=v_state||jsonb_build_object('result',jsonb_build_object('success',false,'validQuestions',(v_state->>'effectiveQuestionCount')::integer,
        'hintsUsed',(v_state->>'hintsUsed')::integer,'solverId',null,'solverName',null,
        'elapsedMs',case when v_state->>'status'='host_reading' then 0 else greatest(0,v_now-(v_state->>'roundStartedAt')::bigint) end,'revealedReason','ended'));
    end if;
    v_state:=v_state||jsonb_build_object('status','finished','pendingAction',null,'revealedBottom',v_secret.bottom,'version',v_game.version+1,'updatedAt',v_now);
    update public.games set state=v_state,version=v_game.version+1,updated_at=now() where code=v_game.code;
    v_result:=jsonb_build_object('outcome','applied','code','OK','message','本局已结束，汤底已公开','state',v_state,'version',v_game.version+1);
    insert into public.soup_actions_v1(game_code,session_no,action_id,actor_uid,actor_player_id,action_type,result,request_payload)
      values(v_game.code,p_expected_session,p_action_id,auth.uid(),v_actor,p_action_type,v_result,p_payload);
  else
    v_result:=public.apply_soup_action_v1(v_game.code,p_action_id,p_action_type,p_expected_status,p_expected_round,p_expected_session,p_expected_version,p_payload);
    if p_action_type='acknowledge_soup_host' then
      v_state:=jsonb_set(v_result->'state','{roundStartedAt}',to_jsonb(v_now));
      update public.games set state=v_state where code=v_game.code;
      v_result:=jsonb_set(v_result,'{state}',v_state);
    end if;
    update public.soup_actions_v1 a set request_payload=p_payload,result=v_result where a.game_code=v_game.code and a.session_no=p_expected_session and a.action_id=p_action_id;
  end if;
  return v_result;
end $$;

revoke all on function public.get_my_soup_round_v11(text) from public;
revoke all on function public.save_soup_draft_v11(text,integer,integer,bigint,text) from public;
revoke all on function public.submit_soup_feedback_v11(text,integer,integer,jsonb) from public;
revoke all on function public.apply_soup_action_v11(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.get_my_soup_round_v11(text) to anon,authenticated,service_role;
grant execute on function public.save_soup_draft_v11(text,integer,integer,bigint,text) to anon,authenticated,service_role;
grant execute on function public.submit_soup_feedback_v11(text,integer,integer,jsonb) to anon,authenticated,service_role;
grant execute on function public.apply_soup_action_v11(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
commit;
