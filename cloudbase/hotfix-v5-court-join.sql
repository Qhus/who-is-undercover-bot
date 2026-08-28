-- V5 离谱法堂加入房间热修复。
-- 仅替换当前管理员拥有的 public.join_court_game_v5，不修改表、数据、RLS 或其他函数。
-- 修复 DATABASE_42P01：原函数错误地用函数名限定了本地状态变量。

create or replace function public.join_court_game_v5(p_code text,p_player_id text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  players jsonb;
  existing_id text;
  eligible_round integer;
  ver bigint;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce(length(trim(p_nickname)),0) not between 1 and 12 then raise exception '称呼须为 1–12 字'; end if;
  select * into g from public.games where code=upper(p_code) and expires_at>now() for update;
  if not found or g.state->>'gameType'<>'absurd_court' or coalesce((g.state->>'courtVersion')::integer,0)<>5 then raise exception '离谱法堂房间不存在'; end if;
  select player_id into existing_id from public.game_members where game_code=g.code and user_uid=auth.uid();
  if found then return jsonb_build_object('state',g.state,'playerId',existing_id); end if;
  players := coalesce(g.state->'players','[]'::jsonb);
  if jsonb_array_length(players)>=coalesce((g.state->>'playerLimit')::integer,8) then raise exception '房间已满'; end if;
  eligible_round := case when g.state->>'status'='lobby' then 1 else coalesce((g.state->>'round')::integer,0)+1 end;
  players := players || jsonb_build_array(jsonb_build_object(
    'id',p_player_id,'name',trim(p_nickname),'seat',jsonb_array_length(players)+1,
    'alive',true,'cardReady',false,'away',false,'eligibleFromRound',eligible_round
  ));
  ver := g.version+1;
  v_state := jsonb_set(g.state,'{players}',players);
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games set state=v_state,version=ver,updated_at=now() where code=g.code;
  insert into public.game_members(game_code,user_uid,player_id) values(g.code,auth.uid(),p_player_id);
  return jsonb_build_object('state',v_state,'playerId',p_player_id);
end $$;
