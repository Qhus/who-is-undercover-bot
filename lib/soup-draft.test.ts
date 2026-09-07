import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptSoupRoom, canEditSoupDraft, createSoupDraftController, soupRoundScope, type SoupDraftSnapshot } from './soup-draft.ts';
import { createSoupRoom, type SoupPrivateRound } from './soup-game.ts';

const packet = (draftText = '', draftRevision = 0): SoupPrivateRound => ({
  sessionNo: 1, round: 1, isHost: false, bottom: null, keyFacts: [], equivalentAnswers: [], boundary: null,
  commonQuestions: [], hints: [], draftText, draftRevision, draftUpdatedAt: null,
});

test('draft queue serializes saves and never overwrites newer local typing', async () => {
  const seen: string[] = [];
  const pending: ((value: { accepted: boolean; privateRound: SoupPrivateRound }) => void)[] = [];
  let state: SoupDraftSnapshot | undefined;
  const controller = createSoupDraftController({
    save: (text) => { seen.push(text); return new Promise((resolve) => pending.push(resolve)); },
    onChange: (value) => { state = value; }, cache: () => {},
  });
  controller.hydrate(packet());
  controller.update('第一句');
  const saving = controller.flush();
  controller.update('第一句加上新内容');
  await controller.flush();
  assert.deepEqual(seen, ['第一句']);
  pending.shift()!({ accepted: true, privateRound: packet('第一句', 1) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state?.text, '第一句加上新内容');
  assert.deepEqual(seen, ['第一句', '第一句加上新内容']);
  pending.shift()!({ accepted: true, privateRound: packet('第一句加上新内容', 2) });
  await saving;
  assert.equal(state?.status, 'saved');
});

test('discarded round cannot apply a late draft response', async () => {
  let finish!: (value: { accepted: boolean; privateRound: SoupPrivateRound }) => void;
  const seen: SoupDraftSnapshot[] = [];
  const controller = createSoupDraftController({ save: () => new Promise((resolve) => { finish = resolve; }), onChange: (v) => seen.push(v), cache: () => {} });
  controller.hydrate(packet()); controller.update('旧题');
  const saving = controller.flush(); controller.dispose();
  const count = seen.length;
  finish({ accepted: true, privateRound: packet('旧题', 1) });
  await saving;
  assert.equal(seen.length, count);
});

test('conflicting remote draft stays intact until an explicit choice', async () => {
  let state: SoupDraftSnapshot | undefined;
  let calls = 0;
  const controller = createSoupDraftController({ save: async () => { calls++; return { accepted: false, privateRound: packet('另一窗口', 2) }; }, onChange: (v) => { state = v; }, cache: () => {} });
  controller.hydrate(packet()); controller.update('我的草稿'); await controller.flush();
  assert.equal(state?.status, 'conflict'); assert.equal(state?.text, '我的草稿');
  await controller.flush(); assert.equal(calls, 1);
  controller.resolveConflict(false); assert.equal(state?.text, '另一窗口'); assert.equal(state?.status, 'saved');
});

test('offline draft survives save failure and can be retried', async () => {
  let online = false;
  let cached: string | null = null;
  let state: SoupDraftSnapshot | undefined;
  const controller = createSoupDraftController({ save: async (text) => { if (!online) throw new Error('offline'); return { accepted: true, privateRound: packet(text, 1) }; }, onChange: (v) => { state = v; }, cache: (v) => { cached = v; } });
  controller.hydrate(packet()); controller.update('保留'); await controller.flush();
  assert.equal(state?.status, 'error'); assert.equal(cached, '保留');
  online = true; await controller.flush();
  assert.equal(state?.status, 'saved'); assert.equal(cached, null);
});

test('room synchronization and draft scopes reject obsolete context', () => {
  const room = createSoupRoom('甲'); room.version = 5; room.round = 1; room.status = 'investigating';
  assert.equal(acceptSoupRoom(room, { ...room, version: 4 }), room);
  assert.notEqual(soupRoundScope(room, 'p1'), soupRoundScope({ ...room, round: 2 }, 'p1'));
  assert.notEqual(soupRoundScope(room, 'p1'), soupRoundScope(room, 'p2'));
  assert.equal(canEditSoupDraft(room, room.ownerId), true);
  assert.equal(canEditSoupDraft({ ...room, status: 'feedback' }, room.ownerId), false);
});
