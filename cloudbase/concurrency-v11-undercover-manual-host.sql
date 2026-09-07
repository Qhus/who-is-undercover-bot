-- 谁是卧底 V1.11 / A2 V3.4：手动填词时，房主只担任出题人。
-- 请使用 CloudBase SQL 编辑器当前的 cloudbase_postgres 角色执行。
-- 本迁移只新增版本化 RPC，不替换、删除旧函数，不修改已有房间。

create or replace function public.join_game_v34(p_code text, p_player_id text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game public.games%rowtype;
  v_players jsonb;
  v_limit integer;
  v_player_count integer;
  v_state jsonb;
  v_seat integer;
  v_existing_player_id text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)), 0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;

  select * into v_game from public.games
    where code = upper(p_code) and expires_at > now()
    for update;
  if not found then raise exception 'room not found'; end if;

  select player_id into v_existing_player_id from public.game_members
    where game_code = v_game.code and user_uid = auth.uid();
  if found then
    return jsonb_build_object('state', v_game.state, 'playerId', v_existing_player_id);
  end if;
  if v_game.state->>'status' <> 'lobby' then raise exception 'game already started'; end if;

  v_players := coalesce(v_game.state->'players', '[]'::jsonb);
  v_limit := (v_game.state->>'playerLimit')::integer;
  select count(*) into v_player_count
    from jsonb_array_elements(v_players) player
    where not coalesce((player->>'hostOnly')::boolean, false);
  if v_player_count >= v_limit then raise exception 'room is full'; end if;

  v_seat := v_player_count + 1;
  v_players := v_players || jsonb_build_array(jsonb_build_object(
    'id', p_player_id, 'name', trim(p_nickname), 'seat', v_seat,
    'alive', true, 'cardReady', false, 'away', false, 'hostOnly', false
  ));
  v_state := jsonb_set(v_game.state, '{players}', v_players, true);
  v_state := jsonb_set(v_state, '{version}', to_jsonb(v_game.version + 1), true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint), true);

  insert into public.game_members(game_code, user_uid, player_id)
    values (v_game.code, auth.uid(), p_player_id);
  update public.games set state = v_state, version = v_game.version + 1, updated_at = now()
    where code = v_game.code;
  return jsonb_build_object('state', v_state, 'playerId', p_player_id);
end;
$$;

create or replace function public.apply_game_action_v34(
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
  v_prior_actor_id text;
  v_version bigint;
  v_player_limit integer;
  v_undercover_count integer;
  v_blank_count integer;
  v_player_count integer;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  -- 除等待房间设置外，继续使用已验证的 V3.1 并发裁判逻辑。
  if p_action_type <> 'update_lobby_settings' then
    return public.apply_game_action_v31(
      p_code, p_action_id, p_action_type, p_expected_status, p_expected_round,
      p_expected_ballot, p_expected_version, p_payload
    );
  end if;

  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_action_id is null or length(trim(p_action_id)) < 8 then raise exception 'invalid action id'; end if;

  select player_id into v_actor_id from public.game_members
    where game_code = upper(p_code) and user_uid = auth.uid();
  if not found then raise exception 'not a room member'; end if;
  select * into v_game from public.games
    where code = upper(p_code) and expires_at > now()
    for update;
  if not found then raise exception 'room not found'; end if;
  v_state := v_game.state;

  select result, actor_player_id into v_prior, v_prior_actor_id from public.game_actions
    where game_code = v_game.code and action_id = p_action_id;
  if found then
    if v_prior_actor_id is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'ACTION_ID_CONFLICT', 'message', '操作编号已被其他玩家使用', 'state', v_state, 'version', v_game.version);
    end if;
    return jsonb_build_object('outcome', 'duplicate', 'code', 'ALREADY_APPLIED', 'message', '操作已经完成', 'state', v_state, 'version', v_game.version);
  end if;
  if p_expected_status is distinct from v_state->>'status'
     or p_expected_round is distinct from coalesce((v_state->>'round')::integer, 1)
     or (p_expected_ballot is not null and p_expected_ballot is distinct from coalesce((v_state->>'ballot')::integer, 1))
     or (p_expected_version is not null and p_expected_version is distinct from v_game.version) then
    return jsonb_build_object('outcome', 'stale', 'code', 'STALE_STATE', 'message', '状态已更新，请重试', 'state', v_state, 'version', v_game.version);
  end if;
  if v_state->>'status' <> 'lobby' then
    return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '只有等待房间可以修改设置', 'state', v_state, 'version', v_game.version);
  end if;
  if v_state->>'ownerId' is distinct from v_actor_id then
    return jsonb_build_object('outcome', 'rejected', 'code', 'OWNER_ONLY', 'message', '只有房主可以修改设置', 'state', v_state, 'version', v_game.version);
  end if;

  v_player_limit := (p_payload->>'playerLimit')::integer;
  v_undercover_count := (p_payload->>'undercoverCount')::integer;
  v_blank_count := coalesce((p_payload->>'blankCardCount')::integer, 0);
  select count(*) into v_player_count
    from jsonb_array_elements(coalesce(v_state->'players', '[]'::jsonb)) player
    where not coalesce((player->>'hostOnly')::boolean, false);

  if v_player_limit is null or v_player_limit < 3 or v_player_limit > 10 then raise exception '玩家人数必须为 3–10 人'; end if;
  if v_player_limit < v_player_count then raise exception '总人数不能少于当前已加入玩家数'; end if;
  if v_undercover_count is null or v_undercover_count < 1 or v_undercover_count > 2
     or v_blank_count < 0 or v_blank_count > 1
     or v_undercover_count + v_blank_count >= v_player_limit - v_undercover_count - v_blank_count then
    raise exception '卧底人数不合法：特殊阵营人数必须少于平民人数';
  end if;

  v_state := jsonb_set(v_state, '{playerLimit}', to_jsonb(v_player_limit), true);
  v_state := jsonb_set(v_state, '{undercoverCount}', to_jsonb(v_undercover_count), true);
  v_state := jsonb_set(v_state, '{blankCardCount}', to_jsonb(v_blank_count), true);
  v_version := v_game.version + 1;
  v_state := jsonb_set(v_state, '{version}', to_jsonb(v_version), true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb(v_now_ms), true);
  update public.games set state = v_state, version = v_version, updated_at = now()
    where code = v_game.code;
  insert into public.game_actions(game_code, action_id, actor_player_id, action_type, round_no, ballot_no, result)
    values (v_game.code, p_action_id, v_actor_id, p_action_type, (v_state->>'round')::integer, (v_state->>'ballot')::integer, jsonb_build_object('outcome', 'applied', 'code', 'OK'));
  return jsonb_build_object('outcome', 'applied', 'code', 'OK', 'message', '操作成功', 'state', v_state, 'version', v_version);
end;
$$;

revoke all on function public.join_game_v34(text, text, text) from public;
revoke all on function public.apply_game_action_v34(text, text, text, text, integer, integer, bigint, jsonb) from public;
grant execute on function public.join_game_v34(text, text, text) to anon, authenticated;
grant execute on function public.apply_game_action_v34(text, text, text, text, integer, integer, bigint, jsonb) to anon, authenticated;
