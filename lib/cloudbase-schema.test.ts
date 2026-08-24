import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../cloudbase/schema.sql', import.meta.url), 'utf8');
const verification = readFileSync(new URL('../cloudbase/verify.sql', import.meta.url), 'utf8');

test('CloudBase auth.uid() 文本标识使用 text 字段', () => {
  assert.match(schema, /owner_uid\s+text\s+not null\s+default auth\.uid\(\)/i);
  assert.match(schema, /user_uid\s+text\s+not null\s+default auth\.uid\(\)/i);
  assert.doesNotMatch(schema, /(?:owner_uid|user_uid)\s+uuid/i);
});

test('CloudBase 只读核验覆盖表、函数、RLS 和策略', () => {
  for (const name of [
    'public.games',
    'public.game_members',
    'public.is_game_member(text)',
    'public.create_game(text,text,jsonb)',
    'public.join_game(text,text,text)',
    'games_member_select',
    'games_member_update',
    'members_same_room_select',
  ]) assert.match(verification, new RegExp(name.replace(/[().]/g, '\\$&')));
  assert.match(verification, /relrowsecurity/i);
  assert.match(verification, /expected\s*=\s*actual\s+as\s+ok/i);
});
