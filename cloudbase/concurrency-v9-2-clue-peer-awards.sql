-- A3 提示大王 V3.2 增量迁移：最独特标记、同行点赞与口语化话痨。
-- 本文件可直接接在 V3 后执行；只新增版本化 RPC/私密表，不覆盖既有函数。

alter table public.clue_v1_clues
  drop constraint if exists clue_v1_clues_score_check;
alter table public.clue_v1_clues
  add constraint clue_v1_clues_score_check check(score is null or score between 1 and 4);

update public.clue_role_bank_v3
set rule_text='像在群里给朋友解释一样，用一句 12–20 字的口语描述',
    example_text='充电宝 → 我每次出门没带它都会特别没有安全感',
    load='medium'
where id='R02';

create table if not exists public.clue_v32_peer_likes (
  game_code text not null references public.games(code) on delete cascade,
  session_no integer not null,
  round_no integer not null,
  voter_player_id text not null,
  clue_id text not null,
  recipient_player_id text not null,
  created_at timestamptz not null default now(),
  primary key(game_code,session_no,round_no,voter_player_id)
);

alter table public.clue_v32_peer_likes enable row level security;
revoke all on public.clue_v32_peer_likes from public,anon,authenticated;

create or replace function public.get_my_clue_round_v32(p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor text;
  v_state jsonb;
  v_secret public.clue_v3_round_secrets%rowtype;
  v_clue public.clue_v1_clues%rowtype;
  v_role public.clue_role_bank_v3%rowtype;
  v_session integer;
  v_round integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor
  from public.game_members
  where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;

  select g.state into v_state
  from public.games g
  where g.code=upper(p_code) and g.expires_at>now();
  if v_state is null
    or v_state->>'gameType'<>'clue_king'
    or coalesce((v_state->>'clueVersion')::integer,0)<>3
  then raise exception 'A3 房间不存在或版本不兼容'; end if;

  v_session := coalesce((v_state->>'sessionNo')::integer,1);
  v_round := coalesce((v_state->>'round')::integer,0);
  if v_round>0 then
    select * into v_secret
    from public.clue_v3_round_secrets
    where game_code=upper(p_code) and session_no=v_session and round_no=v_round;
    select * into v_clue
    from public.clue_v1_clues
    where game_code=upper(p_code) and session_no=v_session and round_no=v_round and player_id=actor;
    select role.* into v_role
    from public.clue_v3_role_assignments assignment_row
    join public.clue_role_bank_v3 role on role.id=assignment_row.role_id
    where assignment_row.game_code=upper(p_code)
      and assignment_row.session_no=v_session
      and assignment_row.round_no=v_round
      and assignment_row.player_id=actor;
  end if;

  return jsonb_build_object(
    'sessionNo',v_session,
    'round',v_round,
    'targetWord',case when v_round>0 and actor<>coalesce(v_secret.guesser_id,'') then v_secret.target_word else null end,
    'clueId',v_clue.clue_id,
    'clueText',coalesce(v_clue.clue_text,''),
    'clueConfirmed',v_clue.confirmed_at is not null,
    'challengeId',v_state->>'publicRuleId',
    'challengeText',v_state->>'publicRuleText',
    'roleId',v_role.id,
    'roleName',v_role.name,
    'roleRule',v_role.rule_text
  );
end $$;

create or replace function public.clue_v32_finish_round(
  p_code text,
  p_state jsonb,
  p_now_ms bigint,
  p_guess_status text,
  p_guess_text text,
  p_elapsed_ms integer,
  p_ratings jsonb default '{}'::jsonb
)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare
  v_state jsonb := p_state;
  v_secret public.clue_v3_round_secrets%rowtype;
  v_entry record;
  v_like record;
  v_entries jsonb;
  v_voters jsonb;
  v_score integer;
  v_guesser_name text;
  v_result jsonb;
  v_correct boolean := p_guess_status='correct';
begin
  select * into v_secret
  from public.clue_v3_round_secrets
  where game_code=p_code
    and session_no=(v_state->>'sessionNo')::integer
    and round_no=(v_state->>'round')::integer;

  for v_entry in
    select * from public.clue_v1_clues
    where game_code=p_code
      and session_no=(v_state->>'sessionNo')::integer
      and round_no=(v_state->>'round')::integer
  loop
    v_score := coalesce((p_ratings->>v_entry.clue_id)::integer,1);
    if v_score not between 1 and 4 then v_score := 1; end if;
    update public.clue_v1_clues
      set score=v_score
      where game_code=p_code
        and session_no=(v_state->>'sessionNo')::integer
        and round_no=(v_state->>'round')::integer
        and player_id=v_entry.player_id;
    v_state := jsonb_set(
      v_state,
      array['hintScores',v_entry.player_id],
      to_jsonb(coalesce((v_state->'hintScores'->>v_entry.player_id)::integer,0)+v_score),
      true
    );
    if v_score=4 then
      v_state := jsonb_set(
        v_state,
        array['uniqueAwards',v_entry.player_id],
        to_jsonb(coalesce((v_state->'uniqueAwards'->>v_entry.player_id)::integer,0)+1),
        true
      );
    end if;
  end loop;

  for v_like in
    select recipient_player_id,count(*)::integer like_count
    from public.clue_v32_peer_likes
    where game_code=p_code
      and session_no=(v_state->>'sessionNo')::integer
      and round_no=(v_state->>'round')::integer
    group by recipient_player_id
  loop
    v_state := jsonb_set(
      v_state,
      array['peerLikes',v_like.recipient_player_id],
      to_jsonb(coalesce((v_state->'peerLikes'->>v_like.recipient_player_id)::integer,0)+v_like.like_count),
      true
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(voter_player_id)),'[]'::jsonb) into v_voters
  from public.clue_v32_peer_likes
  where game_code=p_code
    and session_no=(v_state->>'sessionNo')::integer
    and round_no=(v_state->>'round')::integer;

  select coalesce(jsonb_agg(jsonb_build_object(
    'clueId',clue.clue_id,
    'displayCode','提示 '||chr(64+clue.seq::integer),
    'text',clue.clue_text,
    'roleId',clue.role_id,
    'roleName',clue.role_name,
    'roleRule',clue.role_rule,
    'authorId',clue.player_id,
    'authorName',coalesce((
      select player->>'name'
      from jsonb_array_elements(v_state->'players') as rows(player)
      where player->>'id'=clue.player_id
    ),'未知成员'),
    'score',clue.score,
    'isMostUnique',clue.score=4,
    'peerLikeCount',(
      select count(*)
      from public.clue_v32_peer_likes peer_like
      where peer_like.game_code=p_code
        and peer_like.session_no=(v_state->>'sessionNo')::integer
        and peer_like.round_no=(v_state->>'round')::integer
        and peer_like.clue_id=clue.clue_id
    )
  ) order by clue.seq),'[]'::jsonb) into v_entries
  from (
    select source.*,role.id role_id,role.name role_name,role.rule_text role_rule,
      row_number() over(order by md5(source.clue_id)) seq
    from public.clue_v1_clues source
    left join public.clue_v3_role_assignments assignment_row
      on assignment_row.game_code=source.game_code
      and assignment_row.session_no=source.session_no
      and assignment_row.round_no=source.round_no
      and assignment_row.player_id=source.player_id
    left join public.clue_role_bank_v3 role on role.id=assignment_row.role_id
    where source.game_code=p_code
      and source.session_no=(v_state->>'sessionNo')::integer
      and source.round_no=(v_state->>'round')::integer
  ) clue;

  select player->>'name' into v_guesser_name
  from jsonb_array_elements(v_state->'players') as rows(player)
  where player->>'id'=v_state->>'guesserId';

  v_result := jsonb_build_object(
    'round',(v_state->>'round')::integer,
    'guesserId',v_state->>'guesserId',
    'guesserName',v_guesser_name,
    'targetWord',v_secret.target_word,
    'guessText',p_guess_text,
    'correct',v_correct,
    'elapsedMs',case when v_correct then p_elapsed_ms else null end
  );
  v_state := jsonb_set(v_state,'{publicClues}',v_entries);
  v_state := jsonb_set(v_state,'{peerLikeVoterIds}',v_voters);
  v_state := jsonb_set(v_state,'{revealedWord}',to_jsonb(v_secret.target_word));
  v_state := jsonb_set(v_state,'{guessStatus}',to_jsonb(p_guess_status));
  v_state := jsonb_set(v_state,'{guessElapsedMs}',case when v_correct then to_jsonb(p_elapsed_ms) else 'null'::jsonb end);
  v_state := jsonb_set(v_state,'{roundResults}',coalesce(v_state->'roundResults','[]'::jsonb)||jsonb_build_array(v_result));
  if v_correct then
    v_state := jsonb_set(v_state,array['guessTimes',v_state->>'guesserId'],to_jsonb(p_elapsed_ms),true);
  end if;
  v_state := jsonb_set(v_state,'{status}','"result"');
  return jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(p_now_ms+10000));
end $$;

create or replace function public.apply_clue_action_v32(
  p_code text,
  p_action_id text,
  p_action_type text,
  p_expected_status text,
  p_expected_round integer,
  p_expected_session integer,
  p_expected_version bigint,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  g public.games%rowtype;
  v_state jsonb;
  actor text;
  prior jsonb;
  now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  ver bigint;
  n integer;
  v_clue text;
  v_clue_id text;
  v_recipient text;
  v_guess text;
  v_target text;
  v_elapsed integer;
  v_attempts integer;
  v_ratings jsonb;
  v_guess_status text;
  v_role_id text;
  v_min_length integer;
  v_max_length integer;
  v_entries jsonb;
  clue_row record;
  response jsonb;
  v_message text;
begin
  if p_action_type not in ('confirm_clue','submit_clue_guess','confirm_clue_ratings','submit_peer_like','advance_clue_phase') then
    response := public.apply_clue_action_v3(
      p_code,p_action_id,p_action_type,p_expected_status,p_expected_round,
      p_expected_session,p_expected_version,p_payload
    );
    if response->>'outcome'='applied' and p_action_type in ('start_clue_game','restart_clue_game','skip_clue_result') then
      v_state := response->'state';
      if p_action_type in ('start_clue_game','restart_clue_game') then
        v_state := jsonb_set(v_state,'{uniqueAwards}','{}'::jsonb);
        v_state := jsonb_set(v_state,'{peerLikes}','{}'::jsonb);
        v_state := jsonb_set(v_state,'{peerLikeVoterIds}','[]'::jsonb);
      elsif v_state->>'status'='clue_writing' then
        v_state := jsonb_set(v_state,'{peerLikeVoterIds}','[]'::jsonb);
      end if;
      response := jsonb_set(response,'{state}',v_state);
      update public.games
        set state=v_state
        where code=upper(p_code) and version=(response->>'version')::bigint;
      update public.clue_v1_actions
        set result=response
        where game_code=upper(p_code)
          and session_no=p_expected_session
          and action_id=p_action_id;
    end if;
    return response;
  end if;

  if auth.uid() is null then raise exception 'authentication required'; end if;
  select player_id into actor
  from public.game_members
  where game_code=upper(p_code) and user_uid=auth.uid();
  if not found then raise exception 'not a room member'; end if;

  select result into prior
  from public.clue_v1_actions
  where game_code=upper(p_code)
    and session_no=p_expected_session
    and action_id=p_action_id;
  if found then return prior; end if;

  select * into g
  from public.games
  where code=upper(p_code) and expires_at>now()
  for update;
  if not found
    or g.state->>'gameType'<>'clue_king'
    or coalesce((g.state->>'clueVersion')::integer,0)<>3
  then raise exception 'A3 房间不存在或版本不兼容'; end if;

  v_state := g.state;
  if (v_state->>'round')::integer<>p_expected_round
    or (v_state->>'sessionNo')::integer<>p_expected_session
  then
    return jsonb_build_object(
      'outcome','stale','code','STATE_UPDATED','message','状态已更新，请重试',
      'state',v_state,'version',g.version
    );
  end if;
  if p_action_type='submit_peer_like' then
    if v_state->>'status' not in ('rating','result') then raise exception '当前不能提交同行点赞'; end if;
  elsif p_action_type='confirm_clue_ratings' then
    if v_state->>'status'<>'rating' then raise exception '当前不是评分阶段'; end if;
  elsif v_state->>'status'<>p_expected_status or g.version<>p_expected_version then
    return jsonb_build_object(
      'outcome','stale','code','STATE_UPDATED','message','状态已更新，请重试',
      'state',v_state,'version',g.version
    );
  end if;

  if p_action_type='confirm_clue' then
    if v_state->>'status'<>'clue_writing' or not (v_state->'expectedCluePlayerIds' ? actor) then
      raise exception '本轮无需提交提示';
    end if;
    if v_state->'clueStatuses'->>actor='confirmed' then raise exception '提示已经确认'; end if;
    v_clue := trim(coalesce(p_payload->>'clueText',''));
    select role_id into v_role_id
    from public.clue_v3_role_assignments
    where game_code=upper(p_code)
      and session_no=p_expected_session
      and round_no=p_expected_round
      and player_id=actor;
    v_min_length := case when v_role_id='R02' then 12 else 1 end;
    v_max_length := case when v_role_id='R02' then 20 else 16 end;
    if length(v_clue) not between v_min_length and v_max_length then
      raise exception '提示须为 %–% 字',v_min_length,v_max_length;
    end if;
    select target_word into v_target
    from public.clue_v3_round_secrets
    where game_code=upper(p_code)
      and session_no=p_expected_session
      and round_no=p_expected_round;
    if position(lower(v_target) in lower(v_clue))>0 then raise exception '提示不能直接写出答案'; end if;
    insert into public.clue_v1_clues(game_code,session_no,round_no,player_id,clue_id,clue_text)
    values(upper(p_code),p_expected_session,p_expected_round,actor,'cl3-'||substr(md5(upper(p_code)||p_expected_session||p_expected_round||actor),1,24),v_clue)
    on conflict(game_code,session_no,round_no,player_id) do nothing;
    v_state := jsonb_set(v_state,array['clueStatuses',actor],'"confirmed"'::jsonb,true);
    n := coalesce((v_state->>'clueConfirmedCount')::integer,0)+1;
    v_state := jsonb_set(v_state,'{clueConfirmedCount}',to_jsonb(n));
    if n>=jsonb_array_length(v_state->'expectedCluePlayerIds') then
      v_state := public.clue_v3_open_guessing(upper(p_code),v_state,now_ms);
      v_state := jsonb_set(v_state,'{peerLikeVoterIds}','[]'::jsonb);
    end if;
    v_message := '提示已确认';

  elsif p_action_type='submit_clue_guess' then
    if v_state->>'status'<>'guessing' or actor<>v_state->>'guesserId' then
      raise exception '当前不是你的判断阶段';
    end if;
    v_guess := trim(coalesce(p_payload->>'guessText',''));
    if length(v_guess) not between 1 and 20 then raise exception '答案须为 1–20 字'; end if;
    v_attempts := coalesce((v_state->>'guessAttemptCount')::integer,0)+1;
    if v_attempts>3 then raise exception '本轮尝试次数已用完'; end if;
    select target_word into v_target
    from public.clue_v3_round_secrets
    where game_code=upper(p_code)
      and session_no=p_expected_session
      and round_no=p_expected_round;
    v_elapsed := greatest(0,least(60000,(now_ms-((v_state->>'phaseDeadlineAt')::bigint-60000))::integer));
    insert into public.clue_v1_guesses(game_code,session_no,round_no,player_id,guess_text,correct,elapsed_ms)
    values(upper(p_code),p_expected_session,p_expected_round,actor,v_guess,lower(v_guess)=lower(v_target),v_elapsed)
    on conflict(game_code,session_no,round_no) do update
      set player_id=excluded.player_id,
          guess_text=excluded.guess_text,
          correct=excluded.correct,
          elapsed_ms=excluded.elapsed_ms,
          submitted_at=now();
    v_state := jsonb_set(v_state,'{guessAttemptCount}',to_jsonb(v_attempts));
    if lower(v_guess)=lower(v_target) then
      v_state := jsonb_set(v_state,'{status}','"rating"');
      v_state := jsonb_set(v_state,'{guessStatus}','"correct"');
      v_state := jsonb_set(v_state,'{guessElapsedMs}',to_jsonb(v_elapsed));
      v_state := jsonb_set(v_state,'{revealedWord}',to_jsonb(v_target));
      v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(now_ms+60000));
      v_message := '判断正确，请完成提示评分';
    elsif v_attempts>=3 then
      v_state := jsonb_set(v_state,'{status}','"rating"');
      v_state := jsonb_set(v_state,'{guessStatus}','"wrong"');
      v_state := jsonb_set(v_state,'{guessElapsedMs}','null'::jsonb);
      v_state := jsonb_set(v_state,'{revealedWord}',to_jsonb(v_target));
      v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(now_ms+60000));
      v_message := '三次均未命中，答案已公布，请完成提示评分';
    else
      v_state := jsonb_set(v_state,'{guessStatus}','"wrong"');
      v_message := '暂未命中，还可尝试 '||(3-v_attempts)::text||' 次';
    end if;

  elsif p_action_type='confirm_clue_ratings' then
    if v_state->>'status'<>'rating' or actor<>v_state->>'guesserId' then
      raise exception '当前不是你的评分阶段';
    end if;
    v_ratings := coalesce(p_payload->'ratings','{}'::jsonb);
    n := 0;
    for clue_row in
      select value->>'clueId' clue_id
      from jsonb_array_elements(v_state->'publicClues')
    loop
      if coalesce(v_ratings->>clue_row.clue_id,'') !~ '^[1-4]$' then
        raise exception '请为每条提示选择 1–4 分';
      end if;
      if v_ratings->>clue_row.clue_id='4' then n := n+1; end if;
    end loop;
    if n>1 then raise exception '每轮最多一条提示可以获得 4 分'; end if;
    select guess_text,elapsed_ms into v_guess,v_elapsed
    from public.clue_v1_guesses
    where game_code=upper(p_code)
      and session_no=p_expected_session
      and round_no=p_expected_round;
    v_guess_status := coalesce(v_state->>'guessStatus','timeout');
    v_state := public.clue_v32_finish_round(
      upper(p_code),v_state,now_ms,v_guess_status,v_guess,v_elapsed,v_ratings
    );
    v_message := '评分已确认，作者与趣味标记已揭晓';

  elsif p_action_type='submit_peer_like' then
    if actor=v_state->>'guesserId' or not (v_state->'expectedCluePlayerIds' ? actor) then
      raise exception '本轮仅提示者可以提交同行点赞';
    end if;
    if not exists(
      select 1 from public.clue_v1_clues
      where game_code=upper(p_code)
        and session_no=p_expected_session
        and round_no=p_expected_round
        and player_id=actor
    ) then raise exception '仅已提交提示的成员可以参与同行点赞'; end if;
    if exists(
      select 1 from public.clue_v32_peer_likes
      where game_code=upper(p_code)
        and session_no=p_expected_session
        and round_no=p_expected_round
        and voter_player_id=actor
    ) then raise exception '本轮同行点赞已经提交'; end if;
    v_clue_id := trim(coalesce(p_payload->>'clueId',''));
    select player_id into v_recipient
    from public.clue_v1_clues
    where game_code=upper(p_code)
      and session_no=p_expected_session
      and round_no=p_expected_round
      and clue_id=v_clue_id;
    if not found then raise exception '未找到这条提示'; end if;
    if v_recipient=actor then raise exception '不能给自己的提示点赞'; end if;
    insert into public.clue_v32_peer_likes(
      game_code,session_no,round_no,voter_player_id,clue_id,recipient_player_id
    ) values(
      upper(p_code),p_expected_session,p_expected_round,actor,v_clue_id,v_recipient
    );
    v_state := jsonb_set(
      v_state,
      '{peerLikeVoterIds}',
      coalesce(v_state->'peerLikeVoterIds','[]'::jsonb)||jsonb_build_array(actor)
    );
    if v_state->>'status'='result' then
      v_state := jsonb_set(
        v_state,
        array['peerLikes',v_recipient],
        to_jsonb(coalesce((v_state->'peerLikes'->>v_recipient)::integer,0)+1),
        true
      );
      select coalesce(jsonb_agg(
        case when item->>'clueId'=v_clue_id
          then jsonb_set(item,'{peerLikeCount}',to_jsonb(coalesce((item->>'peerLikeCount')::integer,0)+1))
          else item end
        order by ord
      ),'[]'::jsonb) into v_entries
      from jsonb_array_elements(v_state->'publicClues') with ordinality as rows(item,ord);
      v_state := jsonb_set(v_state,'{publicClues}',v_entries);
    end if;
    v_message := '同行点赞已记录，不影响本轮推进';

  elsif p_action_type='advance_clue_phase' then
    if (v_state->>'phaseDeadlineAt')::bigint>now_ms then raise exception '当前阶段尚未结束'; end if;
    if v_state->>'status'='clue_writing' then
      v_state := public.clue_v3_open_guessing(upper(p_code),v_state,now_ms);
      v_state := jsonb_set(v_state,'{peerLikeVoterIds}','[]'::jsonb);
    elsif v_state->>'status'='guessing' then
      select guess_text,elapsed_ms into v_guess,v_elapsed
      from public.clue_v1_guesses
      where game_code=upper(p_code)
        and session_no=p_expected_session
        and round_no=p_expected_round;
      select target_word into v_target
      from public.clue_v3_round_secrets
      where game_code=upper(p_code)
        and session_no=p_expected_session
        and round_no=p_expected_round;
      v_state := jsonb_set(v_state,'{status}','"rating"');
      v_state := jsonb_set(v_state,'{guessStatus}','"timeout"');
      v_state := jsonb_set(v_state,'{guessElapsedMs}','null'::jsonb);
      v_state := jsonb_set(v_state,'{revealedWord}',to_jsonb(v_target));
      v_state := jsonb_set(v_state,'{phaseDeadlineAt}',to_jsonb(now_ms+60000));
    elsif v_state->>'status'='rating' then
      select guess_text,elapsed_ms into v_guess,v_elapsed
      from public.clue_v1_guesses
      where game_code=upper(p_code)
        and session_no=p_expected_session
        and round_no=p_expected_round;
      v_guess_status := coalesce(v_state->>'guessStatus','timeout');
      v_state := public.clue_v32_finish_round(
        upper(p_code),v_state,now_ms,v_guess_status,v_guess,v_elapsed,'{}'::jsonb
      );
    elsif v_state->>'status'='result' then
      if (v_state->>'round')::integer>=(v_state->>'totalRounds')::integer then
        v_state := jsonb_set(v_state,'{status}','"finished"');
        v_state := jsonb_set(v_state,'{phaseDeadlineAt}','null'::jsonb);
      else
        v_state := public.clue_v3_begin_round(
          upper(p_code),v_state,(v_state->>'round')::integer+1,now_ms
        );
        v_state := jsonb_set(v_state,'{peerLikeVoterIds}','[]'::jsonb);
      end if;
    else
      raise exception '当前阶段无需推进';
    end if;
    v_message := '阶段已推进';
  end if;

  ver := g.version+1;
  v_state := jsonb_set(v_state,'{version}',to_jsonb(ver));
  v_state := jsonb_set(v_state,'{updatedAt}',to_jsonb(now_ms));
  update public.games
    set state=v_state,version=ver,updated_at=now()
    where code=g.code;
  response := jsonb_build_object(
    'outcome','applied','code','OK','message',v_message,
    'state',v_state,'version',ver
  );
  insert into public.clue_v1_actions(
    game_code,session_no,action_id,actor_player_id,action_type,round_no,result
  ) values(
    g.code,p_expected_session,p_action_id,actor,p_action_type,p_expected_round,response
  );
  return response;
end $$;

revoke all on function public.get_my_clue_round_v32(text) from public;
revoke all on function public.clue_v32_finish_round(text,jsonb,bigint,text,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb) from public;
grant execute on function public.get_my_clue_round_v32(text) to anon,authenticated,service_role;
grant execute on function public.apply_clue_action_v32(text,text,text,text,integer,integer,bigint,jsonb) to anon,authenticated,service_role;
notify pgrst,'reload schema';
