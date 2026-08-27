import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../cloudbase/schema.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../cloudbase/verify.sql', import.meta.url), 'utf8');
const concurrencyBase = readFileSync(new URL('../cloudbase/concurrency-v2.sql', import.meta.url), 'utf8');
const concurrencyMigration = readFileSync(new URL('../cloudbase/concurrency-v3-special-roles.sql', import.meta.url), 'utf8');
const concurrencyHotfix = readFileSync(new URL('../cloudbase/concurrency-v3-1-special-roles-hotfix.sql', import.meta.url), 'utf8');
const concurrencySource = `${concurrencyBase}\n${concurrencyMigration}\n${concurrencyHotfix}`;
const storeSource = readFileSync(new URL('./cloudbase-store.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');

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
});

test('联机客户端使用同一操作 ID 重试并以服务端状态为准', () => {
  assert.match(storeSource, /rpc\('apply_game_action'/);
  assert.match(storeSource, /p_action_id:\s*input\.actionId/);
  assert.match(appSource, /const actionId = makeId\('action'\)/);
  assert.ok((appSource.match(/applyGameAction\(\{ room: sourceRoom, actionId, actionType, payload \}\)/g) ?? []).length >= 2);
  assert.match(appSource, /setRoom\(result\.state\)/);
  assert.match(appSource, /状态已更新，请重试/);
  assert.doesNotMatch(appSource, /getCloudStore\(\)\.saveRoom/);
  assert.doesNotMatch(storeSource, /\.from\('games'\)\.update/);
});
