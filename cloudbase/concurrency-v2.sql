-- LFR-39：联机并发优化迁移。
-- 先在测试环境执行并完成双浏览器验收，再在生产环境执行。

create table if not exists public.game_actions (
  game_code text not null references public.games(code) on delete cascade,
  action_id text not null,
  actor_player_id text not null,
  action_type text not null,
  round_no integer,
  ballot_no integer,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_code, action_id)
);

create index if not exists game_actions_created_at_idx on public.game_actions(created_at);
alter table public.game_actions enable row level security;

drop policy if exists game_actions_member_select on public.game_actions;
create policy game_actions_member_select on public.game_actions for select
using (public.is_game_member(game_actions.game_code));

create or replace function public.apply_game_action(
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
  v_players jsonb;
  v_player jsonb;
  v_actor_id text;
  v_prior jsonb;
  v_prior_actor_id text;
  v_now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_round integer;
  v_ballot integer;
  v_status text;
  v_content text;
  v_candidate_id text;
  v_round_key text;
  v_round_map jsonb;
  v_round_contents jsonb;
  v_votes jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_history jsonb;
  v_result jsonb;
  v_tied jsonb := '[]'::jsonb;
  v_skipped jsonb;
  v_order jsonb;
  v_next_turn text;
  v_all_complete boolean;
  v_all_ready boolean;
  v_active_count integer;
  v_vote_count integer;
  v_max_votes integer;
  v_eliminated_id text;
  v_role text;
  v_civilians integer;
  v_undercovers integer;
  v_winner text;
  v_auto boolean;
  v_delay integer;
  v_proposed jsonb;
  v_transition text;
  v_response jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_action_id is null or length(trim(p_action_id)) < 8 then raise exception 'invalid action id'; end if;

  select player_id into v_actor_id
  from public.game_members
  where game_code = upper(p_code) and user_uid = auth.uid();
  if not found then raise exception 'not a room member'; end if;

  select * into v_game
  from public.games
  where code = upper(p_code) and expires_at > now()
  for update;
  if not found then raise exception 'room not found'; end if;

  v_state := v_game.state;
  v_status := v_state->>'status';
  v_round := coalesce((v_state->>'round')::integer, 1);
  v_ballot := coalesce((v_state->>'ballot')::integer, 1);

  select result, actor_player_id into v_prior, v_prior_actor_id
  from public.game_actions
  where game_code = v_game.code and action_id = p_action_id;
  if found then
    if v_prior_actor_id is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'ACTION_ID_CONFLICT', 'message', '操作标识冲突，请重试', 'state', v_state, 'version', v_game.version);
    end if;
    return jsonb_build_object(
      'outcome', 'duplicate', 'code', 'ALREADY_APPLIED', 'message', '操作已经完成',
      'state', v_state, 'version', v_game.version
    );
  end if;

  if p_expected_status is distinct from v_status then
    return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '状态已更新，请重试', 'state', v_state, 'version', v_game.version);
  end if;
  if p_expected_round is distinct from v_round then
    return jsonb_build_object('outcome', 'stale', 'code', 'STALE_ROUND', 'message', '轮次已更新，请重试', 'state', v_state, 'version', v_game.version);
  end if;
  if p_expected_ballot is not null and p_expected_ballot is distinct from v_ballot then
    return jsonb_build_object('outcome', 'stale', 'code', 'STALE_BALLOT', 'message', '投票轮次已更新，请重试', 'state', v_state, 'version', v_game.version);
  end if;

  select value into v_player
  from jsonb_array_elements(coalesce(v_state->'players', '[]'::jsonb))
  where value->>'id' = v_actor_id;
  if not found then raise exception 'player not found in room'; end if;

  if p_action_type = 'confirm_card' then
    if v_status <> 'cards' then
      return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '发牌阶段已经结束', 'state', v_state, 'version', v_game.version);
    end if;
    if not coalesce((v_player->>'alive')::boolean, false) or coalesce((v_player->>'away')::boolean, false) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'PLAYER_INACTIVE', 'message', '当前玩家不能确认', 'state', v_state, 'version', v_game.version);
    end if;
    if coalesce((v_player->>'cardReady')::boolean, false) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'ALREADY_SUBMITTED', 'message', '已经确认自己的词语', 'state', v_state, 'version', v_game.version);
    end if;

    select jsonb_agg(
      case when value->>'id' = v_actor_id then jsonb_set(value, '{cardReady}', 'true'::jsonb, true) else value end
      order by (value->>'seat')::integer
    ) into v_players from jsonb_array_elements(v_state->'players');
    v_state := jsonb_set(v_state, '{players}', v_players, true);

    select bool_and(
      not coalesce((value->>'alive')::boolean, false)
      or coalesce((value->>'away')::boolean, false)
      or coalesce((value->>'cardReady')::boolean, false)
    ) into v_all_ready from jsonb_array_elements(v_players);

    if v_all_ready then
      select coalesce(jsonb_agg(value->>'id' order by (value->>'seat')::integer), '[]'::jsonb)
      into v_order
      from jsonb_array_elements(v_players)
      where coalesce((value->>'alive')::boolean, false) and not coalesce((value->>'away')::boolean, false);
      v_state := jsonb_set(v_state, '{status}', '"discussion"'::jsonb, true);
      v_state := jsonb_set(v_state, '{descriptionOrder}', v_order, true);
      v_state := jsonb_set(v_state, '{descriptionTurnPlayerId}',
        case when coalesce(v_state->>'descriptionRevealMode', 'all_submitted') = 'sequential'
          then coalesce(v_order->0, 'null'::jsonb) else 'null'::jsonb end, true);
      v_state := jsonb_set(v_state, '{discussionDeadlineAt}', to_jsonb(v_now_ms + 120000), true);
      v_state := jsonb_set(v_state, '{descriptionsRevealedAt}', 'null'::jsonb, true);
      v_state := jsonb_set(v_state, '{votingOpensAt}', 'null'::jsonb, true);
      v_state := jsonb_set(v_state, '{skippedDescriptionPlayerIds}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{nextRoundAt}', 'null'::jsonb, true);
      v_round_contents := coalesce(v_state->'roundContents', '{}'::jsonb);
      v_state := jsonb_set(v_state, '{roundContents}', jsonb_set(v_round_contents, array[v_round::text], coalesce(v_round_contents->(v_round::text), '{}'::jsonb), true), true);
      if coalesce(v_state->>'challengeMode', 'off') <> 'off' and nullif(p_payload->>'challengeId', '') is not null then
        v_state := jsonb_set(v_state, '{roundChallenges}', jsonb_set(coalesce(v_state->'roundChallenges', '{}'::jsonb), array[v_round::text], to_jsonb(p_payload->>'challengeId'), true), true);
      end if;
    end if;

  elsif p_action_type = 'submit_description' then
    if v_status <> 'discussion' then
      return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '描述阶段已经结束', 'state', v_state, 'version', v_game.version);
    end if;
    if not coalesce((v_player->>'alive')::boolean, false) or coalesce((v_player->>'away')::boolean, false) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'PLAYER_INACTIVE', 'message', '当前玩家不能提交描述', 'state', v_state, 'version', v_game.version);
    end if;
    v_content := trim(coalesce(p_payload->>'content', ''));
    if length(v_content) < 1 or length(v_content) > 80 then
      return jsonb_build_object('outcome', 'rejected', 'code', 'INVALID_CONTENT', 'message', '本轮内容需为 1～80 字', 'state', v_state, 'version', v_game.version);
    end if;
    v_round_key := v_round::text;
    v_round_contents := coalesce(v_state->'roundContents', '{}'::jsonb);
    v_round_map := coalesce(v_round_contents->v_round_key, '{}'::jsonb);
    if v_round_map ? v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'ALREADY_SUBMITTED', 'message', '本轮内容已经提交', 'state', v_state, 'version', v_game.version);
    end if;
    if coalesce(v_state->>'descriptionRevealMode', 'all_submitted') = 'sequential'
      and v_state->>'descriptionTurnPlayerId' is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'stale', 'code', 'NOT_YOUR_TURN', 'message', '状态已更新，请按当前顺序操作', 'state', v_state, 'version', v_game.version);
    end if;

    v_round_map := jsonb_set(v_round_map, array[v_actor_id], to_jsonb(v_content), true);
    v_round_contents := jsonb_set(v_round_contents, array[v_round_key], v_round_map, true);
    v_state := jsonb_set(v_state, '{roundContents}', v_round_contents, true);
    v_skipped := coalesce(v_state->'skippedDescriptionPlayerIds', '[]'::jsonb);

    select not exists (
      select 1 from jsonb_array_elements(v_state->'players') p
      where coalesce((p->>'alive')::boolean, false)
        and not coalesce((p->>'away')::boolean, false)
        and not (v_round_map ? (p->>'id'))
        and not (v_skipped ? (p->>'id'))
    ) into v_all_complete;

    if v_all_complete then
      v_state := jsonb_set(v_state, '{descriptionTurnPlayerId}', 'null'::jsonb, true);
      v_state := jsonb_set(v_state, '{descriptionsRevealedAt}', to_jsonb(v_now_ms), true);
      v_state := jsonb_set(v_state, '{votingOpensAt}', to_jsonb(v_now_ms + 5000), true);
      v_state := jsonb_set(v_state, '{discussionDeadlineAt}', 'null'::jsonb, true);
    elsif coalesce(v_state->>'descriptionRevealMode', 'all_submitted') = 'sequential' then
      select value #>> '{}'
      into v_next_turn
      from jsonb_array_elements(coalesce(v_state->'descriptionOrder', '[]'::jsonb))
      where not (v_round_map ? (value #>> '{}')) and not (v_skipped ? (value #>> '{}'))
      limit 1;
      v_state := jsonb_set(v_state, '{descriptionTurnPlayerId}', coalesce(to_jsonb(v_next_turn), 'null'::jsonb), true);
      v_state := jsonb_set(v_state, '{discussionDeadlineAt}', to_jsonb(v_now_ms + 120000), true);
    end if;

  elsif p_action_type = 'submit_vote' then
    if v_status <> 'voting' then
      return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '投票阶段已经结束', 'state', v_state, 'version', v_game.version);
    end if;
    if not coalesce((v_player->>'alive')::boolean, false) or coalesce((v_player->>'away')::boolean, false) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'PLAYER_INACTIVE', 'message', '当前玩家不能投票', 'state', v_state, 'version', v_game.version);
    end if;
    v_candidate_id := p_payload->>'candidateId';
    v_votes := coalesce(v_state->'votes', '{}'::jsonb);
    if v_votes ? v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'ALREADY_SUBMITTED', 'message', '本轮投票已经提交', 'state', v_state, 'version', v_game.version);
    end if;
    if v_candidate_id is null or v_candidate_id = v_actor_id or not exists (
      select 1 from jsonb_array_elements(v_state->'players') p
      where p->>'id' = v_candidate_id
        and coalesce((p->>'alive')::boolean, false)
        and not coalesce((p->>'away')::boolean, false)
    ) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'INVALID_CANDIDATE', 'message', '该候选人当前不可选择', 'state', v_state, 'version', v_game.version);
    end if;
    if v_ballot = 2 and not (coalesce(v_state->'runoffCandidateIds', '[]'::jsonb) ? v_candidate_id) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'INVALID_CANDIDATE', 'message', '复投只能选择并列候选人', 'state', v_state, 'version', v_game.version);
    end if;

    v_votes := jsonb_set(v_votes, array[v_actor_id], to_jsonb(v_candidate_id), true);
    v_state := jsonb_set(v_state, '{votes}', v_votes, true);
    select count(*) into v_active_count from jsonb_array_elements(v_state->'players') p
    where coalesce((p->>'alive')::boolean, false) and not coalesce((p->>'away')::boolean, false);
    select count(*) into v_vote_count from jsonb_object_keys(v_votes);

    if v_vote_count = v_active_count then
      select coalesce(jsonb_object_agg(candidate_id, vote_count), '{}'::jsonb), max(vote_count)
      into v_counts, v_max_votes
      from (
        select value #>> '{}' as candidate_id, count(*)::integer as vote_count
        from jsonb_each(v_votes) group by value #>> '{}'
      ) counted;
      select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
      into v_tied from jsonb_each_text(v_counts) where value::integer = v_max_votes;
      v_eliminated_id := case when jsonb_array_length(v_tied) = 1 then v_tied->>0 else null end;
      v_result := jsonb_build_object(
        'round', v_round, 'ballot', v_ballot, 'counts', v_counts,
        'tiedIds', case when jsonb_array_length(v_tied) > 1 then v_tied else '[]'::jsonb end,
        'eliminatedId', v_eliminated_id,
        'noElimination', jsonb_array_length(v_tied) > 1 and v_ballot = 2
      );
      v_history := coalesce(v_state->'history', '[]'::jsonb) || jsonb_build_array(v_result);
      v_state := jsonb_set(v_state, '{history}', v_history, true);
      v_state := jsonb_set(v_state, '{lastResult}', v_result, true);

      if jsonb_array_length(v_tied) > 1 and v_ballot = 1 then
        v_state := jsonb_set(v_state, '{ballot}', '2'::jsonb, true);
        v_state := jsonb_set(v_state, '{runoffCandidateIds}', v_tied, true);
        v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb, true);
      elsif v_eliminated_id is not null
        and v_state->'assignments'->v_eliminated_id->>'role' = 'undercover'
        and coalesce((v_state->>'undercoverComebackEnabled')::boolean, false)
        and not coalesce((v_state->>'undercoverComebackUsed')::boolean, false) then
        v_state := jsonb_set(v_state, '{status}', '"guessing"'::jsonb, true);
        v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb, true);
        v_state := jsonb_set(v_state, '{runoffCandidateIds}', '[]'::jsonb, true);
        v_state := jsonb_set(v_state, '{pendingComebackPlayerId}', to_jsonb(v_eliminated_id), true);
        v_state := jsonb_set(v_state, '{comebackDeadlineAt}', to_jsonb(v_now_ms + 20000), true);
        v_state := jsonb_set(v_state, '{undercoverComebackUsed}', 'true'::jsonb, true);
        v_state := jsonb_set(v_state, '{pendingGuessingReason}', '"elimination"'::jsonb, true);
      else
        if v_eliminated_id is not null then
          select jsonb_agg(
            case when value->>'id' = v_eliminated_id
              then jsonb_set(jsonb_set(value, '{alive}', 'false'::jsonb, true), '{away}', 'false'::jsonb, true)
              else value end order by (value->>'seat')::integer
          ) into v_players from jsonb_array_elements(v_state->'players');
          v_state := jsonb_set(v_state, '{players}', v_players, true);
        else
          v_players := v_state->'players';
        end if;

        select
          count(*) filter (where v_state->'assignments'->(p->>'id')->>'role' = 'undercover'),
          count(*) filter (where coalesce(v_state->'assignments'->(p->>'id')->>'role', 'civilian') <> 'undercover')
        into v_undercovers, v_civilians
        from jsonb_array_elements(v_players) p
        where coalesce((p->>'alive')::boolean, false);
        v_winner := case when v_undercovers = 0 then 'civilian' when v_undercovers >= v_civilians then 'undercover' else null end;
        v_auto := coalesce((v_state->>'autoAdvanceEnabled')::boolean, true);
        v_delay := coalesce((v_state->>'autoAdvanceDelaySeconds')::integer, 7);
        v_state := jsonb_set(v_state, '{winner}', coalesce(to_jsonb(v_winner), 'null'::jsonb), true);
        v_state := jsonb_set(v_state, '{status}', to_jsonb(case when v_winner is null then 'result' else 'finished' end), true);
        v_state := jsonb_set(v_state, '{nextRoundAt}', case when v_winner is null and v_auto then to_jsonb(v_now_ms + v_delay * 1000) else 'null'::jsonb end, true);
        v_state := jsonb_set(v_state, '{votes}', '{}'::jsonb, true);
        v_state := jsonb_set(v_state, '{runoffCandidateIds}', '[]'::jsonb, true);
      end if;
    end if;

  elsif p_action_type in ('advance_phase', 'trigger_buzzer', 'submit_special', 'change_presence') then
    if p_expected_version is distinct from v_game.version then
      return jsonb_build_object('outcome', 'stale', 'code', 'STALE_VERSION', 'message', '状态已更新，请重试', 'state', v_state, 'version', v_game.version);
    end if;
    v_proposed := p_payload->'proposedState';
    v_transition := coalesce(p_payload->>'transition', '');
    if v_proposed is null or jsonb_typeof(v_proposed) <> 'object' or v_proposed->>'code' is distinct from v_game.code then
      return jsonb_build_object('outcome', 'rejected', 'code', 'INVALID_TRANSITION', 'message', '无法应用本次状态变更', 'state', v_state, 'version', v_game.version);
    end if;
    if p_action_type = 'advance_phase'
      and not coalesce((p_payload->>'automatic')::boolean, false)
      and v_state->>'ownerId' is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'OWNER_ONLY', 'message', '只有房主可以执行此操作', 'state', v_state, 'version', v_game.version);
    end if;
    if p_action_type in ('trigger_buzzer', 'submit_special')
      and not coalesce((v_player->>'alive')::boolean, false) then
      return jsonb_build_object('outcome', 'rejected', 'code', 'PLAYER_INACTIVE', 'message', '当前玩家不能执行此操作', 'state', v_state, 'version', v_game.version);
    end if;
    if p_action_type = 'trigger_buzzer' and v_proposed->>'pendingComebackPlayerId' is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'rejected', 'code', 'INVALID_ACTOR', 'message', '只能为自己发起特殊判定', 'state', v_state, 'version', v_game.version);
    end if;
    if p_action_type = 'submit_special' and v_state->>'pendingComebackPlayerId' is distinct from v_actor_id then
      return jsonb_build_object('outcome', 'stale', 'code', 'WRONG_PHASE', 'message', '特殊判定已经结束', 'state', v_state, 'version', v_game.version);
    end if;
    v_state := v_proposed;
  else
    return jsonb_build_object('outcome', 'rejected', 'code', 'UNKNOWN_ACTION', 'message', '不支持的操作', 'state', v_state, 'version', v_game.version);
  end if;

  v_state := jsonb_set(v_state, '{version}', to_jsonb(v_game.version + 1), true);
  v_state := jsonb_set(v_state, '{updatedAt}', to_jsonb(v_now_ms), true);
  update public.games
  set state = v_state, version = v_game.version + 1, updated_at = now()
  where code = v_game.code;

  v_response := jsonb_build_object('outcome', 'applied', 'code', 'OK', 'message', '操作成功', 'state', v_state, 'version', v_game.version + 1);
  insert into public.game_actions(game_code, action_id, actor_player_id, action_type, round_no, ballot_no, result)
  values (v_game.code, p_action_id, v_actor_id, p_action_type, v_round, v_ballot, jsonb_build_object('outcome', 'applied', 'code', 'OK'));
  return v_response;
end;
$$;

revoke all on public.game_actions from anon, authenticated;
revoke all on function public.apply_game_action(text, text, text, text, integer, integer, bigint, jsonb) from public;
grant select on public.game_actions to anon, authenticated;
grant execute on function public.apply_game_action(text, text, text, text, integer, integer, bigint, jsonb) to anon, authenticated;

-- 仅在新前端完成发布并通过验收后执行以下权限收紧：
-- revoke update(state, version, updated_at) on public.games from anon, authenticated;
