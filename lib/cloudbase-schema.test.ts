import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const schema = readFileSync(new URL('../cloudbase/schema.sql', import.meta.url), 'utf8');

test('CloudBase auth.uid() 文本标识使用 text 字段', () => {
  assert.match(schema, /owner_uid\s+text\s+not null\s+default auth\.uid\(\)/i);
  assert.match(schema, /user_uid\s+text\s+not null\s+default auth\.uid\(\)/i);
  assert.doesNotMatch(schema, /(?:owner_uid|user_uid)\s+uuid/i);
});

