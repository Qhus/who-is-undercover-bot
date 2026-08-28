import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../cloudbase/schema.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../cloudbase/verify.sql', import.meta.url), 'utf8');
const concurrencyBase = readFileSync(new URL('../cloudbase/concurrency-v2.sql', import.meta.url), 'utf8');
const concurrencyMigration = readFileSync(new URL('../cloudbase/concurrency-v3-special-roles.sql', import.meta.url), 'utf8');
const concurrencyHotfix = readFileSync(new URL('../cloudbase/concurrency-v3-1-special-roles-hotfix.sql', import.meta.url), 'utf8');
const versionedRpcMigration = readFileSync(new URL('../cloudbase/concurrency-v3-2-versioned-rpc.sql', import.meta.url), 'utf8');
const versionedRpcVerification = readFileSync(new URL('../cloudbase/verify-v3-2-versioned-rpc.sql', import.meta.url), 'utf8');
const courtPlayableMigration = readFileSync(new URL('../cloudbase/concurrency-v4-1-court-playable.sql', import.meta.url), 'utf8');
const courtPlayableVerification = readFileSync(new URL('../cloudbase/verify-v4-1-court-playable.sql', import.meta.url), 'utf8');
const courtV5Migration = readFileSync(new URL('../cloudbase/concurrency-v5-court-draft-02.sql', import.meta.url), 'utf8');
const courtV5Verification = readFileSync(new URL('../cloudbase/verify-v5-court-draft-02.sql', import.meta.url), 'utf8');
const concurrencySource = `${concurrencyBase}\n${concurrencyMigration}\n${concurrencyHotfix}\n${versionedRpcMigration}`;
const storeSource = readFileSync(new URL('./cloudbase-store.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
const courtAppSource = readFileSync(new URL('../app/court-spreadsheet-mode.tsx', import.meta.url), 'utf8');

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

test('离谱法堂客户端仅调用 V5 RPC，页面不再出现私密关键词机制', () => {
  assert.match(storeSource, /rpc\('create_court_game_v5'/);
  assert.match(storeSource, /rpc\('join_court_game_v5'/);
  assert.match(storeSource, /rpc\('apply_court_action_v5'/);
  assert.match(storeSource, /p_expected_session:\s*input\.room\.sessionNo/);
  assert.match(courtAppSource, /确认首次陈词/);
  assert.match(courtAppSource, /确认当庭补述/);
  assert.match(courtAppSource, /再来一局/);
  assert.doesNotMatch(courtAppSource, /私密关键词|本人关键词|关键词读取|getMyCourtAssignment/);
});
