-- 谁是卧底 V1.7.1 体验增量：将创建者和加入者称呼上限由 12 字提高到 24 字。
-- 请使用拥有 public.create_game / public.join_game 的 cloudbase_postgres 角色执行。
-- 本迁移不修改现有房间数据，不涉及离谱法堂对象。

create or replace function public.create_game(p_code text, p_owner_player_id text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
  if coalesce(length(trim(p_state->'players'->0->>'name')), 0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  insert into public.games(code, owner_uid, owner_player_id, state, version)
    values (p_code, auth.uid(), p_owner_player_id, p_state, coalesce((p_state->>'version')::bigint, 1));
  insert into public.game_members(game_code, user_uid, player_id)
    values (p_code, auth.uid(), p_owner_player_id);
  return p_state;
end;
$$;

create or replace function public.join_game(p_code text, p_player_id text, p_nickname text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_game public.games%rowtype;
  v_players jsonb;
  v_limit integer;
  v_state jsonb;
  v_seat integer;
  v_existing_player_id text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)), 0) not between 1 and 24 then raise exception '称呼须为 1–24 字'; end if;
  select * into v_game from public.games where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'room not found'; end if;

  select player_id into v_existing_player_id from public.game_members where game_code = v_game.code and user_uid = auth.uid();
  if found then
    return jsonb_build_object('state', v_game.state, 'playerId', v_existing_player_id);
  end if;
  if v_game.state->>'status' <> 'lobby' then raise exception 'game already started'; end if;
  v_players := coalesce(v_game.state->'players', '[]'::jsonb);
  v_limit := (v_game.state->>'playerLimit')::integer;
  if jsonb_array_length(v_players) >= v_limit then raise exception 'room is full'; end if;

  v_seat := jsonb_array_length(v_players) + 1;
  v_players := v_players || jsonb_build_array(jsonb_build_object(
    'id', p_player_id, 'name', trim(p_nickname), 'seat', v_seat,
    'alive', true, 'cardReady', false, 'away', false
  ));
  v_state := jsonb_set(v_game.state, '{players}', v_players, true);
  v_state := jsonb_set(v_state, '{version}', to_jsonb(v_game.version + 1), true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint), true);

  insert into public.game_members(game_code, user_uid, player_id) values (v_game.code, auth.uid(), p_player_id);
  update public.games set state = v_state, version = v_game.version + 1, updated_at = now() where code = v_game.code;
  return jsonb_build_object('state', v_state, 'playerId', p_player_id);
end;
$$;

revoke all on function public.create_game(text, text, jsonb) from public;
revoke all on function public.join_game(text, text, text) from public;
grant execute on function public.create_game(text, text, jsonb) to anon, authenticated;
grant execute on function public.join_game(text, text, text) to anon, authenticated;
