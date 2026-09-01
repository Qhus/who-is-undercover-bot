-- A3 提示大王 V1.1 体验增量。
-- 新增 V2 操作 RPC：提示填写延长至 120 秒，猜题者在 60 秒内最多尝试 3 次。
-- 复用 V1 表、创建/加入/私密读取 RPC，不删除或覆盖已有房间数据。

create or replace function public.apply_clue_action_v2(
  p_code text,p_action_id text,p_action_type text,p_expected_status text,p_expected_round integer,p_expected_session integer,p_expected_version bigint,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  actor text;
  prior jsonb;
  response jsonb;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  ver bigint;
  v_guess text;
  v_target text;
  v_elapsed integer;
  v_attempts integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor from public.game_members where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select result into prior from public.clue_v1_actions where game_code=upper(p_code) and session_no=p_expected_session and action_id=p_action_id;
  if found then return prior; end if;

  -- 猜题提交与猜题超时由 V2 处理；其他成熟流程继续复用 V1。
  if p_action_type='submit_clue_guess' or (p_action_type='advance_clue_phase' and p_expected_status='guessing') then
    select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
    if not found or g.state->>'gameType'<>'clue_king' or coalesce((g.state->>'clueVersion')::integer,0)<>1 then raise exception 'A3 房间不存在'; end if;
    v_state := g.state;
    if v_state->>'status'<>p_expected_status or (v_state->>'round')::integer<>p_expected_round or (v_state->>'sessionNo')::integer<>p_expected_session or g.version<>p_expected_version then
      return jsonb_build_object('outcome','stale','code','STATE_UPDATED','message','状态已更新，请重试','state',v_state,'version',g.version);
    end if;

    if p_action_type='submit_clue_guess' then
      if v_state->>'status'<>'guessing' or actor<>v_state->>'guesserId' then raise exception '当前不是你的判断阶段'; end if;
      v_guess := trim(coalesce(p_payload->>'guessText',''));
      if length(v_guess) not between 1 and 20 then raise exception '答案须为 1–20 字'; end if;
      v_attempts := coalesce((v_state->>'guessAttemptCount')::integer,0)+1;
      if v_attempts>3 then raise exception '本轮尝试次数已用完'; end if;
      select target_word into v_target from public.clue_v1_round_secrets where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
      v_elapsed := greatest(0,least(60000,(now_ms-((v_state->>'phaseDeadlineAt')::bigint-60000))::integer));
      insert into public.clue_v1_guesses(game_code,session_no,round_no,player_id,guess_text,correct,elapsed_ms)
      values(upper(p_code),p_expected_session,p_expected_round,actor,v_guess,lower(v_guess)=lower(v_target),v_elapsed)
      on conflict(game_code,session_no,round_no) do update set
        player_id=excluded.player_id,guess_text=excluded.guess_text,correct=excluded.correct,elapsed_ms=excluded.elapsed_ms,submitted_at=now();
      v_state := jsonb_set(v_state,'{guessAttemptCount}',to_jsonb(v_attempts),true);
      if lower(v_guess)=lower(v_target) then
        v_state := jsonb_set(v_state,'{status}','"rating"');
        v_state := jsonb_set(v_state,'{guessStatus}','"correct"');
        v_state := jsonb_set(v_state,'{guessElapsedMs}',to_jsonb(v_elapsed));
        v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(now_ms+60000));
      elsif v_attempts>=3 then
        v_state := public.clue_v1_finish_round(upper(p_code),v_state,now_ms,false,v_guess,v_elapsed,'{}'::jsonb);
      else
        v_state := jsonb_set(v_state,'{guessStatus}','"wrong"');
      end if;
    else
      if (v_state->>'phaseDeadlineAt')::bigint>now_ms then raise exception '当前阶段尚未结束'; end if;
      select guess_text,elapsed_ms into v_guess,v_elapsed from public.clue_v1_guesses
      where game_code=upper(p_code) and session_no=p_expected_session and round_no=p_expected_round;
      v_state := public.clue_v1_finish_round(upper(p_code),v_state,now_ms,false,v_guess,coalesce(v_elapsed,0),'{}'::jsonb);
    end if;

    ver := g.version+1;
    v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
    v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
    update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
    response := jsonb_build_object(
      'outcome','applied','code','OK',
      'message',case
        when p_action_type='advance_clue_phase' then '本轮判断时间已结束'
        when v_state->>'guessStatus'='correct' then '判断正确，请完成关联质量评分'
        when v_state->>'status'='guessing' then '暂未命中，还可尝试 '||(3-v_attempts)::text||' 次'
        else '三次均未命中，本轮已结束'
      end,
      'state',v_state,'version',ver
    );
    insert into public.clue_v1_actions(game_code,session_no,action_id,actor_player_id,action_type,round_no,result)
    values(g.code,p_expected_session,p_action_id,actor,p_action_type,p_expected_round,response);
    return response;
  end if;

  response := public.apply_clue_action_v1(
    p_code,p_action_id,p_action_type,p_expected_status,p_expected_round,p_expected_session,p_expected_version,p_payload
  );
  if response->>'outcome'<>'applied' then return response; end if;
  v_state := response->'state';

  -- V1 新轮次原为 90 秒，在响应与房间状态中统一补足为 120 秒。
  if p_action_type in ('start_clue_game','advance_clue_phase') and v_state->>'status'='clue_writing' then
    v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb((v_state->>'phaseDeadlineAt')::bigint+30000));
  end if;
  if v_state->>'status' in ('lobby','clue_writing','guessing') then
    v_state := jsonb_set(v_state,'{guessAttemptCount}','0'::jsonb,true);
  end if;
  response := jsonb_set(response,'{state}',v_state);
  update public.games set state=v_state where code=upper(p_code) and version=(response->>'version')::bigint;
  update public.clue_v1_actions set result=response
  where game_code=upper(p_code) and session_no=p_expected_session and action_id=p_action_id;
  return response;
end $$;

revoke all on function public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.apply_clue_action_v2(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
