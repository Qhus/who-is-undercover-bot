-- 在 CloudBase PostgreSQL 的 SQL 编辑器中一次性执行。
-- 匿名用户只能读取/更新自己已加入的房间；加入房间必须通过受控函数完成。
-- 完成本文件后还需执行 concurrency-v2.sql，才能启用 LFR-39 并发操作接口。

create table if not exists public.games (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  owner_uid text not null default auth.uid(),
  owner_player_id text not null,
  state jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.game_members (
  game_code text not null references public.games(code) on delete cascade,
  user_uid text not null default auth.uid(),
  player_id text not null,
  joined_at timestamptz not null default now(),
  primary key (game_code, user_uid),
  unique (game_code, player_id)
);

alter table public.games enable row level security;
alter table public.game_members enable row level security;

create or replace function public.is_game_member(p_code text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.game_members where game_code = p_code and user_uid = auth.uid());
$$;

drop policy if exists games_member_select on public.games;
create policy games_member_select on public.games for select
using (public.is_game_member(games.code));

drop policy if exists games_member_update on public.games;
create policy games_member_update on public.games for update
using (public.is_game_member(games.code))
with check (public.is_game_member(games.code));

drop policy if exists members_same_room_select on public.game_members;
create policy members_same_room_select on public.game_members for select
using (public.is_game_member(game_members.game_code));

create or replace function public.create_game(p_code text, p_owner_player_id text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_code !~ '^[A-Z2-9]{6}$' then raise exception 'invalid room code'; end if;
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
    'id', p_player_id, 'name', left(trim(p_nickname), 12), 'seat', v_seat,
    'alive', true, 'cardReady', false
  ));
  v_state := jsonb_set(v_game.state, '{players}', v_players, true);
  v_state := jsonb_set(v_state, '{version}', to_jsonb(v_game.version + 1), true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint), true);

  insert into public.game_members(game_code, user_uid, player_id) values (v_game.code, auth.uid(), p_player_id);
  update public.games set state = v_state, version = v_game.version + 1, updated_at = now() where code = v_game.code;
  return jsonb_build_object('state', v_state, 'playerId', p_player_id);
end;
$$;

revoke all on public.games, public.game_members from anon, authenticated;
revoke all on function public.is_game_member(text) from public;
revoke all on function public.create_game(text, text, jsonb) from public;
revoke all on function public.join_game(text, text, text) from public;
grant select on public.games, public.game_members to anon, authenticated;
grant update(state, version, updated_at) on public.games to anon, authenticated;
grant execute on function public.is_game_member(text) to anon, authenticated;
grant execute on function public.create_game(text, text, jsonb) to anon, authenticated;
grant execute on function public.join_game(text, text, text) to anon, authenticated;
