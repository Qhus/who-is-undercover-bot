import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COURT_CASE_PACKS } from './court-content.ts';

const schema = readFileSync(new URL('../cloudbase/schema.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../cloudbase/verify.sql', import.meta.url), 'utf8');
const concurrencyBase = readFileSync(new URL('../cloudbase/concurrency-v2.sql', import.meta.url), 'utf8');
const concurrencyMigration = readFileSync(new URL('../cloudbase/concurrency-v3-special-roles.sql', import.meta.url), 'utf8');
const concurrencyHotfix = readFileSync(new URL('../cloudbase/concurrency-v3-1-special-roles-hotfix.sql', import.meta.url), 'utf8');
const versionedRpcMigration = readFileSync(new URL('../cloudbase/concurrency-v3-2-versioned-rpc.sql', import.meta.url), 'utf8');
const versionedRpcVerification = readFileSync(new URL('../cloudbase/verify-v3-2-versioned-rpc.sql', import.meta.url), 'utf8');
const undercoverUxMigration = readFileSync(new URL('../cloudbase/experience-v3-3-undercover-ux.sql', import.meta.url), 'utf8');
const undercoverUxVerification = readFileSync(new URL('../cloudbase/verify-v3-3-undercover-ux.sql', import.meta.url), 'utf8');
const courtPlayableMigration = readFileSync(new URL('../cloudbase/concurrency-v4-1-court-playable.sql', import.meta.url), 'utf8');
const courtPlayableVerification = readFileSync(new URL('../cloudbase/verify-v4-1-court-playable.sql', import.meta.url), 'utf8');
const courtV5Migration = readFileSync(new URL('../cloudbase/concurrency-v5-court-draft-02.sql', import.meta.url), 'utf8');
const courtV5Verification = readFileSync(new URL('../cloudbase/verify-v5-court-draft-02.sql', import.meta.url), 'utf8');
const courtV5JoinHotfix = readFileSync(new URL('../cloudbase/hotfix-v5-court-join.sql', import.meta.url), 'utf8');
const courtV5JoinHotfixVerification = readFileSync(new URL('../cloudbase/verify-v5-court-join-hotfix.sql', import.meta.url), 'utf8');
const courtV6Migration = readFileSync(new URL('../cloudbase/concurrency-v6-court-dual-vote.sql', import.meta.url), 'utf8');
const courtV6Verification = readFileSync(new URL('../cloudbase/verify-v6-court-dual-vote.sql', import.meta.url), 'utf8');
const courtCopyMigration = readFileSync(new URL('../cloudbase/content-v6-1-court-copy.sql', import.meta.url), 'utf8');
const courtCopyVerification = readFileSync(new URL('../cloudbase/verify-v6-1-court-copy.sql', import.meta.url), 'utf8');
const courtTimerMigration = readFileSync(new URL('../cloudbase/experience-v6-2-court-timers.sql', import.meta.url), 'utf8');
const courtTimerVerification = readFileSync(new URL('../cloudbase/verify-v6-2-court-timers.sql', import.meta.url), 'utf8');
const clueV1Migration = readFileSync(new URL('../cloudbase/concurrency-v8-clue-king.sql', import.meta.url), 'utf8');
const clueV1Verification = readFileSync(new URL('../cloudbase/verify-v8-clue-king.sql', import.meta.url), 'utf8');
const concurrencySource = `${concurrencyBase}\n${concurrencyMigration}\n${concurrencyHotfix}\n${versionedRpcMigration}`;
const storeSource = readFileSync(new URL('./cloudbase-store.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
const courtAppSource = readFileSync(new URL('../app/court-spreadsheet-mode.tsx', import.meta.url), 'utf8');
const clueAppSource = readFileSync(new URL('../app/clue-spreadsheet-mode.tsx', import.meta.url), 'utf8');

test('CloudBase auth.uid() 文本标识使用 text 字段', () => {
  assert.match(schema, /owner_uid\s+text\s+not null\s+default auth\.uid\(\)/i);
  assert.match(schema, /user_uid\s+text\s+not null\s+default auth\.uid\(\)/i);
  assert.doesNotMatch(schema, /(?:owner_uid|user_uid)\s+uuid/i);
});

test('CloudBase 只读核验覆盖表、函数、RLS 和策略', () => {
  for (const name of [
    'public.games',
    'public.game_members',
    'public.game_actions',
    'public.is_game_member(text)',
    'public.create_game(text,text,jsonb)',
    'public.join_game(text,text,text)',
    'public.apply_game_action(text,text,text,text,integer,integer,bigint,jsonb)',
    'games_member_select',
    'games_member_update',
    'members_same_room_select',
    'game_actions_member_select',
  ]) assert.match(verification, new RegExp(name.replace(/[().]/g, '\\$&')));
  assert.match(verification, /relrowsecurity/i);
  assert.match(verification, /expected\s*=\s*actual\s+as\s+ok/i);
});

test('并发迁移使用房间锁、操作幂等和受控状态合并', () => {
  assert.match(concurrencySource, /primary key\s*\(game_code,\s*action_id\)/i);
  assert.match(concurrencySource, /from public\.games[\s\S]*for update/i);
  assert.match(concurrencySource, /from public\.game_actions[\s\S]*action_id = p_action_id/i);
  for (const action of ['confirm_card', 'submit_description', 'submit_vote', 'advance_phase', 'trigger_buzzer', 'submit_special', 'update_lobby_settings', 'accuse_undercover']) {
    assert.match(concurrencySource, new RegExp(action));
  }
  for (const staleCode of ['WRONG_PHASE', 'STALE_ROUND', 'STALE_BALLOT', 'STALE_VERSION']) {
    assert.match(concurrencySource, new RegExp(staleCode));
  }
  assert.match(concurrencySource, /update public\.games[\s\S]*insert into public\.game_actions/i);
  for (const marker of ['blank', 'civilianAccuseEnabled', 'civilianAccuseUsedBy']) assert.match(concurrencySource, new RegExp(marker));
  assert.match(concurrencySource, /revoke update\(state, version, updated_at\)/i);
  assert.match(concurrencyHotfix, /create or replace function public\.apply_game_action/i);
  assert.doesNotMatch(concurrencyHotfix, /rename to apply_game_action_v2/i);
  assert.match(concurrencyHotfix, /status' = 'discussion'[\s\S]*descriptionsRevealedAt/i);
  assert.match(concurrencyHotfix, /coalesce\(p_payload->>'targetPlayerId', p_payload->>'targetId'\)/i);
  assert.match(concurrencyHotfix, /p_action_type = 'submit_vote'[\s\S]*role' = 'blank'/i);
  assert.match(concurrencyHotfix, /role' in \('undercover','blank'\)/i);
  assert.match(versionedRpcMigration, /create(?:\s+or\s+replace)? function public\.apply_game_action_v31/i);
  assert.match(versionedRpcMigration, /public\.apply_game_action\(p_code/i);
  assert.doesNotMatch(versionedRpcMigration, /public\.apply_game_action_v2\s*\(/i);
  assert.match(versionedRpcVerification, /versioned RPC exists/i);
  assert.match(versionedRpcVerification, /targetPlayerId/i);
  assert.match(versionedRpcVerification, /actual as ok/i);
  assert.doesNotMatch(versionedRpcVerification, /expected\s*=\s*actual/i);
});

test('谁是卧底称呼增量将前后端上限统一为 24 字', () => {
  assert.match(schema, /between 1 and 24/);
  assert.match(schema, /'name', trim\(p_nickname\)/);
  assert.doesNotMatch(schema, /left\(trim\(p_nickname\), 12\)/);
  assert.match(undercoverUxMigration, /create or replace function public\.create_game/);
  assert.match(undercoverUxMigration, /create or replace function public\.join_game/);
  assert.ok((undercoverUxMigration.match(/between 1 and 24/g) ?? []).length >= 2);
  assert.match(undercoverUxVerification, /no longer truncates names to 12 characters/);
  assert.match(undercoverUxVerification, /anon can execute create and join RPCs/);
});

test('联机客户端使用同一操作 ID 重试并以服务端状态为准', () => {
  assert.match(storeSource, /rpc\('apply_game_action_v31'/);
  assert.match(storeSource, /p_action_id:\s*input\.actionId/);
  assert.match(appSource, /const actionId = makeId\('action'\)/);
  assert.ok((appSource.match(/applyGameAction\(\{ room: sourceRoom, actionId, actionType, payload \}\)/g) ?? []).length >= 2);
  assert.match(appSource, /setRoom\(result\.state\)/);
  assert.match(appSource, /状态已更新，请重试/);
  assert.doesNotMatch(appSource, /getCloudStore\(\)\.saveRoom/);
  assert.doesNotMatch(storeSource, /\.from\('games'\)\.update/);
});

test('离谱法堂 V4.1 使用服务端内容池和完整即时推进状态机', () => {
  for (const table of ['court_cases', 'court_twists', 'court_keywords', 'court_private_assignments', 'court_submissions', 'court_votes']) assert.match(courtPlayableMigration, new RegExp(table));
  for (const helper of ['court_begin_round', 'court_reveal_defenses', 'court_open_supplement', 'court_open_voting', 'court_finish_voting']) assert.match(courtPlayableMigration, new RegExp(helper));
  assert.match(courtPlayableMigration, /array_agg\(content order by random\(\)\)/);
  assert.match(courtPlayableMigration, /n>=jsonb_array_length\(state->'expectedPlayerIds'\)[\s\S]*court_reveal_defenses/);
  assert.match(courtPlayableMigration, /n>=eligible[\s\S]*court_open_voting/);
  assert.match(courtPlayableMigration, /court_finish_voting[\s\S]*authorName[\s\S]*roundVotes/);
  assert.doesNotMatch(courtPlayableMigration, /proposedState|p_player_id/);
  for (const expected of ['20 court cases', '30 court twists', '60 court keywords', 'immediate defense advance', 'result reveals author']) assert.match(courtPlayableVerification, new RegExp(expected));
});

test('离谱法堂 V5 是保留 V4 的增量迁移并使用独立版本化 RPC', () => {
  for (const table of ['court_case_packs', 'court_v5_submissions', 'court_v5_votes', 'court_v5_actions']) {
    assert.match(courtV5Migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  for (const rpc of ['create_court_game_v5', 'join_court_game_v5', 'get_my_court_submission_v5', 'apply_court_action_v5']) {
    assert.match(courtV5Migration, new RegExp(rpc));
  }
  assert.doesNotMatch(courtV5Migration, /drop\s+(?:table|function)|truncate\s+/i);
  assert.doesNotMatch(courtV5Migration, /create\s+or\s+replace\s+function\s+public\.apply_court_action\s*\(/i);
  assert.match(courtV5Migration, /primary key \(game_code, session_no, action_id\)/i);
  assert.match(courtV5Migration, /p_expected_session/i);
  assert.match(courtV5Migration, /restart_court_game/i);
  assert.match(courtV5Migration, /previousSessionCaseIds/i);
});

test('离谱法堂 Draft 0.2 服务端实现两段确认、自动推进和每轮一票', () => {
  for (const action of ['confirm_court_statement', 'confirm_court_response', 'confirm_court_vote', 'advance_court_phase']) {
    assert.match(courtV5Migration, new RegExp(action));
  }
  assert.ok((courtV5Migration.match(/p_now_ms\+120000/g) ?? []).length >= 2);
  assert.match(courtV5Migration, /statementStatuses[\s\S]*responseStatuses[\s\S]*voteStatuses/);
  assert.match(courtV5Migration, /eligible>0 and n>=eligible[\s\S]*court_v5_reveal_statements/);
  assert.match(courtV5Migration, /eligible>0 and n>=eligible[\s\S]*court_v5_open_voting/);
  assert.match(courtV5Migration, /court_v5_votes[\s\S]*primary key \(game_code, session_no, round_no, player_id\)/i);
  assert.doesNotMatch(courtV5Migration, /court_private_assignments|court_keywords|submissionIds/);
  for (const expected of ['at least 15 complete case packs', 'both writing stages use 120 seconds', 'restart creates a new session']) {
    assert.match(courtV5Verification, new RegExp(expected));
  }
});

test('离谱法堂客户端仅调用 V6 RPC，页面不再出现私密关键词机制', () => {
  assert.match(storeSource, /rpc\('create_court_game_v6'/);
  assert.match(storeSource, /rpc\('join_court_game_v6'/);
  assert.match(storeSource, /rpc\('apply_court_action_v6'/);
  assert.match(storeSource, /rpc\('get_my_court_submission_v6'/);
  assert.match(storeSource, /p_expected_session:\s*input\.room\.sessionNo/);
  assert.match(courtAppSource, /确认首次陈词/);
  assert.match(courtAppSource, /确认当庭补述/);
  assert.match(courtAppSource, /再来一局/);
  assert.doesNotMatch(courtAppSource, /私密关键词|本人关键词|关键词读取|getMyCourtAssignment/);
});

test('离谱法堂 Draft 0.3 使用 V6 双项选票、卷宗参考答辩和两人局', () => {
  for (const rpc of ['create_court_game_v6', 'join_court_game_v6', 'get_my_court_submission_v6', 'apply_court_action_v6']) assert.match(courtV6Migration, new RegExp(rpc));
  for (const table of ['court_v6_votes', 'court_v6_actions']) assert.match(courtV6Migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(courtV6Migration, /jsonb_array_length\(expected\)<2/);
  assert.match(courtV6Migration, /if n<2 then raise exception '至少需要 2 名未暂离成员'/);
  assert.match(courtV6Migration, /reference_statement[\s\S]*reference_response/);
  assert.match(courtV6Migration, /bestSubmissionId[\s\S]*truthSubmissionId/);
  assert.match(courtV6Migration, /totalBestScores[\s\S]*totalTruthScores/);
  assert.doesNotMatch(courtV6Migration, /best_target\s*(?:<>|is distinct from)\s*truth_target/i);
  assert.doesNotMatch(courtV6Migration, /drop\s+(?:table|function)|truncate\s+/i);
  for (const expected of ['at least 18 case packs have reference defenses', 'V6 rooms require only two active players', 'reference defense appears only when voting opens', 'same candidate may receive both category votes']) assert.match(courtV6Verification, new RegExp(expected));
  assert.match(courtAppSource, /最会狡辩/);
  assert.match(courtAppSource, /最像真的/);
  assert.match(courtAppSource, /确认两项选票/);
});

test('离谱法堂内容增量提供三十套案件和最近二十一轮避重', () => {
  assert.match(courtCopyMigration, /insert into public\.court_case_packs/);
  assert.match(courtCopyMigration, /create or replace function public\.court_v6_restart/);
  assert.match(courtCopyMigration, /limit 21/);
  assert.match(courtCopyMigration, /previousSessionCaseIds[\s\S]*usedCaseIds/);
  assert.match(courtCopyMigration, /where id='borrowed-charger'/);
  assert.doesNotMatch(courtCopyMigration, /create or replace function public\.apply_court_action_v6/i);
  assert.doesNotMatch(courtCopyMigration, /drop\s+(?:table|function)|truncate\s+/i);
  for (const item of COURT_CASE_PACKS) {
    for (const value of [item.id, item.title, item.charge, item.evidenceTitle, item.evidence, item.verdictTemplate, item.referenceStatement, item.referenceResponse]) {
      assert.ok(courtCopyMigration.includes(value.replaceAll("'", "''")), `数据库迁移缺少案件内容：${item.id}`);
    }
  }
  for (const expected of ['at least 30 enabled case packs', 'all live reference lines fit quick input', 'sample restart drops the oldest three cases']) assert.match(courtCopyVerification, new RegExp(expected));
});

test('离谱法堂节奏增量延长两段输入和双项投票但不替换公共 RPC', () => {
  assert.match(courtTimerMigration, /court_v6_begin_round[\s\S]*p_now_ms\+300000/);
  assert.match(courtTimerMigration, /court_v5_open_response[\s\S]*p_now_ms\+300000/);
  assert.match(courtTimerMigration, /court_v6_open_voting[\s\S]*p_now_ms\+120000/);
  assert.doesNotMatch(courtTimerMigration, /create or replace function public\.apply_court_action_v6/i);
  assert.doesNotMatch(courtTimerMigration, /drop\s+(?:table|function)|truncate\s+/i);
  for (const expected of ['statement allows five minutes', 'response allows five minutes', 'dual voting allows two minutes']) assert.match(courtTimerVerification, new RegExp(expected));
});

test('CloudBase 连接初始化并发复用且重复组件注册可安全恢复', () => {
  assert.match(storeSource, /connectionPromise/);
  assert.match(storeSource, /this\.connectionPromise \?\?= this\.initialize\(\)/);
  assert.match(storeSource, /Duplicate component mysql/);
  assert.match(storeSource, /ensureMySqlRegistered/);
  assert.match(courtAppSource, /readableError\(error, '加入房间失败'\)/);
});

test('离谱法堂 V5 加入函数使用无歧义的本地状态变量', () => {
  for (const source of [courtV5Migration, courtV5JoinHotfix]) {
    assert.match(source, /function public\.join_court_game_v5[\s\S]*?declare[\s\S]*?v_state jsonb;[\s\S]*?v_state := jsonb_set/);
    assert.match(source, /function public\.join_court_game_v5[\s\S]*?update public\.games set state=v_state/);
    assert.doesNotMatch(source, /join_court_game_v5\.state/);
  }
  assert.match(courtV5JoinHotfixVerification, /join RPC writes the local v_state variable/);
  assert.match(courtV5JoinHotfixVerification, /body !~ 'join_court_game_v5\\\.state'/);
  assert.match(courtV5JoinHotfixVerification, /has_function_privilege\('anon'/);
});

test('A3 提示大王使用独立私密表、版本化 RPC 与完整轮转状态机', () => {
  for (const table of ['clue_word_bank_v1', 'clue_v1_round_secrets', 'clue_v1_clues', 'clue_v1_guesses', 'clue_v1_actions']) {
    assert.match(clueV1Migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  for (const rpc of ['create_clue_game_v1', 'join_clue_game_v1', 'get_my_clue_round_v1', 'apply_clue_action_v1']) {
    assert.match(clueV1Migration, new RegExp(rpc));
    assert.match(storeSource, new RegExp(`rpc\\('${rpc}'`));
  }
  for (const action of ['start_clue_game', 'confirm_clue', 'submit_clue_guess', 'confirm_clue_ratings', 'advance_clue_phase', 'restart_clue_game']) {
    assert.match(clueV1Migration, new RegExp(action));
  }
  assert.match(clueV1Migration, /p_now_ms\+90000/);
  assert.ok((clueV1Migration.match(/now_ms\+60000/g) ?? []).length >= 2);
  assert.match(clueV1Migration, /p_now_ms\+10000/);
  assert.match(clueV1Migration, /clueId.*clue_id/);
  assert.doesNotMatch(clueV1Migration, /distinct\s+clue_text/i);
  assert.doesNotMatch(clueV1Migration, /drop\s+(?:table|function)|truncate\s+/i);
  for (const expected of ['at least 100 enabled clue words', 'duplicate clue text is preserved as separate clue ids', 'every player becomes guesser once before finish', 'restart creates a new session and clears scores']) {
    assert.match(clueV1Verification, new RegExp(expected));
  }
  assert.match(clueV1Verification, /'writing90s'/);
  assert.match(clueV1Verification, /'guessing60s'/);
  assert.match(clueV1Verification, /'rating60s'/);
  assert.match(clueV1Verification, /'result10s'/);
  assert.doesNotMatch(clueV1Verification, /now_ms \\+ 60000/);
  for (const copy of ['内容相同的提示会分别保留', '提示大王排名', '猜题速度排名', '确认全部评分', '再来一局']) {
    assert.match(clueAppSource, new RegExp(copy));
  }
});
