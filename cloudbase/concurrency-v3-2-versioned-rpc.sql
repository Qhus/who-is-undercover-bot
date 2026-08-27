-- V3.2 版本化裁判 RPC：适用于 apply_game_action 由 cloudbase_admin 拥有、不可覆盖的 CloudBase PG 环境。
-- 不修改旧 apply_game_action，也不依赖 apply_game_action_v2。
-- 新函数由当前 cloudbase_postgres 创建；它复用旧函数的锁、幂等和既有动作逻辑，
-- 并补充空白牌结算、等待房间设置和平民爆灯指认。

create or replace function public.apply_game_action_v31(
  p_code text,
  p_action_id text,
  p_action_type text,
  p_expected_status text,
  p_expected_round integer,
  p_expected_ballot integer default null,
  p_expected_version bigint default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game public.games%rowtype;
  v_state jsonb;
  v_actor_id text;
  v_prior jsonb;
  v_player jsonb;
  v_target jsonb;
  v_players jsonb;
  v_target_id text;
  v_role text;
  v_correct boolean;
  v_eliminated_id text;
  v_winner text;
  v_special integer;
  v_civilians integer;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_result jsonb;
  v_delegate jsonb;
  v_version bigint;
  v_player_limit integer;
  v_undercover_count integer;
  v_blank_count integer;
  v_auto boolean;
  v_delay integer;
begin
  -- 旧函数负责锁、幂等和计票；本函数在同一事务内修正空白牌的特殊阵营结算。
  if p_action_type = 'submit_vote' then
    v_delegate := public.apply_game_action(p_code, p_action_id, p_action_type, p_expected_status, p_expected_round, p_expected_ballot, p_expected_version, p_payload);
    v_state := v_delegate->'state';
    if v_state is null or coalesce(v_delegate->>'outcome', '') <> 'applied' then return v_delegate; end if;

    v_eliminated_id := v_state #>> '{lastResult,eliminatedId}';
    if v_eliminated_id is not null
       and v_state->'assignments'->v_eliminated_id->>'role' = 'blank'
       and coalesce((v_state->>'undercoverComebackEnabled')::boolean, false)
       and not coalesce((v_state->>'undercoverComebackUsed')::boolean, false) then
      select jsonb_agg(
        case when value->>'id' = v_eliminated_id
          then jsonb_set(jsonb_set(value, '{alive}', 'true'::jsonb, true), '{away}', 'false'::jsonb, true)
          else value end order by (value->>'seat')::integer
      ) into v_players from jsonb_array_elements(v_state->'players');
      v_state := jsonb_set(v_state, '{players}', v_players, true);
      v_state := jsonb_set(v_state, '{status}', '"guessing"'::jsonb, true);
      v_state := jsonb_set(v_state, '{winner}', 'null'::jsonb, true);
      v_state := jsonb_set(v_state, '{nextRoundAt}', 'null'::jsonb, true);
      v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb, true);
      v_state := jsonb_set(v_state, '{runoffCandidateIds}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{pendingComebackPlayerId}', to_jsonb(v_eliminated_id), true);
      v_state := jsonb_set(v_state, '{comebackDeadlineAt}', to_jsonb(v_now_ms + 20000), true);
      v_state := jsonb_set(v_state, '{undercoverComebackUsed}', 'true'::jsonb, true);
      v_state := jsonb_set(v_state, '{pendingGuessingReason}', '"elimination"'::jsonb, true);
    elsif v_state->>'status' in ('result', 'finished') then
      select
        count(*) filter (where coalesce((p->>'alive')::boolean, false) and v_state->'assignments'->(p->>'id')->>'role' in ('undercover','blank')),
        count(*) filter (where coalesce((p->>'alive')::boolean, false) and v_state->'assignments'->(p->>'id')->>'role' not in ('undercover','blank'))
        into v_special, v_civilians from jsonb_array_elements(v_state->'players') p;
      v_winner := case when v_special = 0 then 'civilian' when v_special >= v_civilians then 'undercover' else null end;
      v_auto := coalesce((v_state->>'autoAdvanceEnabled')::boolean, true);
      v_delay := coalesce((v_state->>'autoAdvanceDelaySeconds')::integer, 10);
      v_state := jsonb_set(v_state, '{winner}', coalesce(to_jsonb(v_winner), 'null'::jsonb), true);
      v_state := jsonb_set(v_state, '{status}', to_jsonb(case when v_winner is null then 'result' else 'finished' end), true);
      v_state := jsonb_set(v_state, '{nextRoundAt}', case when v_winner is null and v_auto then to_jsonb(v_now_ms + v_delay * 1000) else 'null'::jsonb end, true);
    end if;

    update public.games set state = v_state, updated_at = now() where code = upper(p_code);
    return jsonb_set(v_delegate, '{state}', v_state, true);
  end if;

  if p_action_type not in ('update_lobby_settings', 'accuse_undercover') then
    return public.apply_game_action(p_code, p_action_id, p_action_type, p_expected_status, p_expected_round, p_expected_ballot, p_expected_version, p_payload);
  end if;
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_action_id is null or length(trim(p_action_id)) < 8 then raise exception 'invalid action id'; end if;

  select player_id into v_actor_id from public.game_members
    where game_code = upper(p_code) and user_uid = auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into v_game from public.games where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'room not found'; end if;
  v_state := v_game.state;

  select result into v_prior from public.game_actions
    where game_code = v_game.code and action_id = p_action_id;
  if found then
    return jsonb_build_object('outcome', 'duplicate', 'code', 'ALREADY_APPLIED', 'message', '操作已经完成', 'state', v_state, 'version', v_game.version);
  end if;
  if p_expected_status is distinct from v_state->>'status'
     or p_expected_round is distinct from coalesce((v_state->>'round')::integer, 1)
     or (p_expected_ballot is not null and p_expected_ballot is distinct from coalesce((v_state->>'ballot')::integer, 1))
     or (p_expected_version is not null and p_expected_version is distinct from v_game.version) then
    return jsonb_build_object('outcome', 'stale', 'code', 'STALE_STATE', 'message', '状态已更新，请重试', 'state', v_state, 'version', v_game.version);
  end if;
  select value into v_player from jsonb_array_elements(coalesce(v_state->'players', '[]'::jsonb)) where value->>'id' = v_actor_id;
  if not found then raise exception 'player not found in room'; end if;

  if p_action_type = 'update_lobby_settings' then
    if v_state->>'status' <> 'lobby' then
      return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '只有等待房间可以修改设置', 'state', v_state, 'version', v_game.version);
    end if;
    if v_state->>'ownerId' is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'OWNER_ONLY', 'message', '只有房主可以修改设置', 'state', v_state, 'version', v_game.version);
    end if;
    v_player_limit := (p_payload->>'playerLimit')::integer;
    v_undercover_count := (p_payload->>'undercoverCount')::integer;
    v_blank_count := coalesce((p_payload->>'blankCardCount')::integer, 0);
    if v_player_limit is null or v_player_limit < 3 or v_player_limit > 10 then raise exception '玩家人数必须为 3–10 人'; end if;
    if v_player_limit < jsonb_array_length(coalesce(v_state->'players', '[]'::jsonb)) then raise exception '总人数不能少于当前已加入人数'; end if;
    if v_undercover_count is null or v_undercover_count < 1 or v_undercover_count > 2 or v_blank_count < 0 or v_blank_count > 1
       or v_undercover_count + v_blank_count >= v_player_limit - v_undercover_count - v_blank_count then
      raise exception '卧底人数不合法：特殊阵营人数必须少于平民人数';
    end if;
    v_state := jsonb_set(v_state, '{playerLimit}', to_jsonb(v_player_limit), true);
    v_state := jsonb_set(v_state, '{undercoverCount}', to_jsonb(v_undercover_count), true);
    v_state := jsonb_set(v_state, '{blankCardCount}', to_jsonb(v_blank_count), true);
  else
    if not (
      v_state->>'status' = 'voting'
      or (v_state->>'status' = 'discussion' and v_state->>'descriptionsRevealedAt' is not null)
    ) then
      return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '当前不能进行平民爆灯指认', 'state', v_state, 'version', v_game.version);
    end if;
    if not coalesce((v_state->>'civilianAccuseEnabled')::boolean, false) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'FEATURE_DISABLED', 'message', '本局未开启平民爆灯指认', 'state', v_state, 'version', v_game.version);
    end if;
    if v_state->>'civilianAccuseUsedBy' is not null then
      return jsonb_build_object('outcome', 'rejected', 'code', 'ALREADY_USED', 'message', '本局平民爆灯指认机会已经使用', 'state', v_state, 'version', v_game.version);
    end if;
    if not coalesce((v_player->>'alive')::boolean, false) or coalesce((v_player->>'away')::boolean, false) then raise exception '当前玩家不能发起指认'; end if;
    v_target_id := coalesce(p_payload->>'targetPlayerId', p_payload->>'targetId');
    select value into v_target from jsonb_array_elements(coalesce(v_state->'players', '[]'::jsonb)) where value->>'id' = v_target_id;
    if not found or v_target_id = v_actor_id or not coalesce((v_target->>'alive')::boolean, false) or coalesce((v_target->>'away')::boolean, false) then raise exception '该候选人当前不可指认'; end if;
    v_role := v_state->'assignments'->v_target_id->>'role';
    v_correct := (v_state->'assignments'->v_actor_id->>'role' = 'civilian' and v_role in ('undercover', 'blank'));
    v_eliminated_id := case when v_correct then v_target_id else v_actor_id end;
    select jsonb_agg(case when value->>'id' = v_eliminated_id then jsonb_set(jsonb_set(value, '{alive}', 'false'::jsonb, true), '{away}', 'false'::jsonb, true) else value end order by (value->>'seat')::integer)
      into v_players from jsonb_array_elements(v_state->'players');
    v_state := jsonb_set(v_state, '{players}', v_players, true);
    select
      count(*) filter (where coalesce((p->>'alive')::boolean, false) and v_state->'assignments'->(p->>'id')->>'role' in ('undercover','blank')),
      count(*) filter (where coalesce((p->>'alive')::boolean, false) and v_state->'assignments'->(p->>'id')->>'role' not in ('undercover','blank'))
      into v_special, v_civilians from jsonb_array_elements(v_players) p;
    v_winner := case when v_special = 0 then 'civilian' when v_special >= v_civilians then 'undercover' else null end;
    v_result := jsonb_build_object('accuserId', v_actor_id, 'targetId', v_target_id, 'correct', v_correct, 'eliminatedId', v_eliminated_id, 'round', (v_state->>'round')::integer);
    v_state := jsonb_set(v_state, '{civilianAccuseUsedBy}', to_jsonb(v_actor_id), true);
    v_state := jsonb_set(v_state, '{lastCivilianAccuseResult}', v_result, true);
    v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb, true);
    v_state := jsonb_set(v_state, '{ballot}', '1'::jsonb, true);
    v_state := jsonb_set(v_state, '{runoffCandidateIds}', '[]'::jsonb, true);
    v_state := jsonb_set(v_state, '{votingOpensAt}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{winner}', coalesce(to_jsonb(v_winner), 'null'::jsonb), true);
    v_state := jsonb_set(v_state, '{status}', to_jsonb(case when v_winner is null then 'voting' else 'finished' end), true);
    if v_winner is not null then
      v_state := jsonb_set(v_state, '{lastResult}', jsonb_build_object('round', (v_state->>'round')::integer, 'ballot', 1, 'counts', '{}'::jsonb, 'tiedIds', '[]'::jsonb, 'eliminatedId', v_eliminated_id, 'noElimination', false), true);
    end if;
  end if;

  v_version := v_game.version + 1;
  v_state := jsonb_set(v_state, '{version}', to_jsonb(v_version), true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb(v_now_ms), true);
  update public.games set state = v_state, version = v_version, updated_at = now() where code = v_game.code;
  insert into public.game_actions(game_code, action_id, actor_player_id, action_type, round_no, ballot_no, result)
    values (v_game.code, p_action_id, v_actor_id, p_action_type, (v_state->>'round')::integer, (v_state->>'ballot')::integer, jsonb_build_object('outcome','applied','code','OK'));
  return jsonb_build_object('outcome','applied','code','OK','message','操作成功','state',v_state,'version',v_version);
end;
$$;

revoke all on function public.apply_game_action_v31(text, text, text, text, integer, integer, bigint, jsonb) from public;
grant execute on function public.apply_game_action_v31(text, text, text, text, integer, integer, bigint, jsonb) to anon, authenticated;
