import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { SoupPrivateRound, SoupRoom } from './soup-game.ts';

// Executes real PL/pgSQL locally, without network/cloud credentials. PGlite has one
// connection: these are transactional RPC tests, not proof of multi-server locking.
const db = new PGlite();
const sql = (name: string) => readFileSync(new URL(`../cloudbase/${name}`, import.meta.url), 'utf8');
before(async () => {
  await db.exec(`create schema auth;
    create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;
    create role anon; create role authenticated; create role service_role;
    grant usage on schema auth to anon,authenticated,service_role;`);
  await db.exec(sql('schema.sql'));
  await db.exec(sql('concurrency-v10-soup-detective.sql'));
  await db.exec(sql('concurrency-v10-1-soup-reliability.sql'));
  // Repeatability must not overwrite case edits, feedback or enabled/review flags.
  await db.exec(sql('concurrency-v10-1-soup-reliability.sql'));
});
after(async () => { await db.close(); });

async function rpc<T>(actor: string, name: string, args: unknown[]): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    const result = await tx.query<{ value: T }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args);
    return result.rows[0].value;
  });
}
async function current(code: string) { return (await db.query<{ state: SoupRoom }>('select state from games where code=$1', [code])).rows[0].state; }
let actionNo = 0;
const rawAction = (room: SoupRoom, actor: string, type: string, payload: unknown = {}, id = `a${++actionNo}`) =>
  rpc<{ state: SoupRoom; outcome: string }>(actor, 'apply_soup_action_v11', [room.code, id, type, room.status, room.round, room.sessionNo, room.version, JSON.stringify(payload)]);
const act = async (room: SoupRoom, actor: string, type: string, payload: unknown = {}) => {
  const result = await rawAction(room, actor, type, payload); assert.equal(result.outcome, 'applied'); return result.state;
};
const packet = (room: SoupRoom, actor: string) => rpc<SoupPrivateRound>(actor, 'get_my_soup_round_v11', [room.code]);
const draft = (room: SoupRoom, actor: string, text: string, revision = 0) => rpc<{ accepted: boolean; privateRound: SoupPrivateRound }>(actor, 'save_soup_draft_v11', [room.code, room.sessionNo, room.round, revision, text]);
const feedback = (room: SoupRoom, actor: string) => rpc(actor, 'submit_soup_feedback_v11', [room.code, room.sessionNo, room.round, JSON.stringify({ difficulty: 'just_right', ambiguous: false, unsuitable: false })]);
async function setup(code: string, count: number) {
  let room = await rpc<SoupRoom>('p1', 'create_soup_game_v1', [code, 'p1', '成员1']);
  for (let i = 2; i <= count; i++) room = (await rpc<{ state: SoupRoom }>(`p${i}`, 'join_soup_game_v1', [code, `p${i}`, `成员${i}`])).state;
  return act(room, 'p1', 'start_soup_game');
}

for (const count of [3, 5, 8, 10]) test(`SQL: ${count} players complete private reading, draft, turns, reveal, feedback and next bowl`, async () => {
  let room = await setup(`TEST${String.fromCharCode(65 + count)}Z`, count);
  const host = room.hostId!;
  const secret = await packet(room, host);
  assert.ok(secret.bottom);
  assert.equal(JSON.stringify(room).includes(secret.bottom!), false);
  for (const detective of room.detectiveOrder) {
    const privateView = await packet(room, detective);
    assert.equal(privateView.bottom, null); assert.deepEqual(privateView.keyFacts, []); assert.deepEqual(privateView.hints, []);
    assert.equal((await draft(room, detective, `草稿 ${detective}`)).accepted, true);
  }
  assert.equal((await current(room.code)).version, room.version, 'draft does not change public room version');
  room = await act(room, host, 'acknowledge_soup_host');
  const first = room.currentDetectiveId!;
  await assert.rejects(act(room, host, 'submit_soup_question', { content: '越权?' }), /轮到/);
  for (const detective of room.detectiveOrder) room = await act(room, detective, 'skip_soup_turn');
  assert.equal(room.currentDetectiveId, first); assert.equal(room.actionCycle, 2);
  room = await act(room, first, 'submit_soup_question', { content: '请告诉我发生了什么' });
  room = await act(room, host, 'judge_soup_question', { verdict: 'rephrase', note: '请换成是非题' });
  assert.equal(room.effectiveQuestionCount, 0);
  room = await act(room, room.currentDetectiveId!, 'submit_soup_solution', { content: '完整还原' });
  room = await act(room, host, 'judge_soup_solution', { verdict: 'success' });
  assert.equal(room.status, 'feedback'); assert.equal(room.revealedBottom, secret.bottom); assert.equal(room.pendingAction, null);
  await assert.rejects(draft(room, first, '结束后修改'), /不能修改/);
  await assert.rejects(act(room, first, 'submit_soup_question', { content: '还可以吗' }), /轮到/);
  for (let i = 1; i <= count; i++) await feedback(room, `p${i}`);
  room = await current(room.code);
  const version = room.version;
  await feedback(room, 'p1'); assert.equal((await current(room.code)).version, version);
  assert.equal((await packet(room, 'p1')).feedbackSubmitted, true);
  assert.equal(room.feedbackCount, count);
  const previous = room;
  room = await act(room, 'p1', 'next_soup_round');
  assert.notEqual(room.hostId, host); assert.equal(new Set(room.usedCaseIds).size, 2);
  await assert.rejects(draft(previous, first, '迟到的上一题草稿'), /STALE_ROUND/);
  await assert.rejects(feedback(previous, 'p1'), /STALE_ROUND/);
  assert.equal((await packet(room, room.currentDetectiveId!)).draftText, '');
});

test('SQL: stale draft revisions cannot replace newer text and independent players stay isolated', async () => {
  const room = await setup('DRAFT2', 3);
  const [p1, p2] = room.detectiveOrder;
  assert.equal((await draft(room, p1, 'first')).accepted, true);
  assert.equal((await draft(room, p1, 'newest', 1)).accepted, true);
  const stale = await draft(room, p1, 'delayed first', 1);
  assert.equal(stale.accepted, false); assert.equal(stale.privateRound.draftText, 'newest');
  assert.equal((await draft(room, p1, 'newest', 1)).accepted, true, 'lost acknowledgement may retry the same text');
  await draft(room, p2, 'independent');
  assert.equal((await packet(room, p1)).draftText, 'newest'); assert.equal((await packet(room, p2)).draftText, 'independent');
  await assert.rejects(draft(room, room.hostId!, 'host'), /无需/);
  await assert.rejects(packet(room, 'outsider'), /not a room member/);
});

test('SQL: retries are idempotent, actor-bound and return latest public state', async () => {
  let room = await setup('REPLAY', 3); room = await act(room, room.hostId!, 'acknowledge_soup_host');
  const previous = room; const actor = room.currentDetectiveId!;
  const one = await rawAction(previous, actor, 'submit_soup_question', { content: '是吗？' }, 'repeat');
  const two = await rawAction(previous, actor, 'submit_soup_question', { content: '是吗？' }, 'repeat');
  assert.equal(two.outcome, 'duplicate'); assert.equal(one.state.version, two.state.version);
  await assert.rejects(rawAction(previous, previous.hostId!, 'submit_soup_question', { content: '是吗？' }, 'repeat'), /编号已被使用/);
  await assert.rejects(rawAction(previous, actor, 'submit_soup_question', { content: '改内容' }, 'repeat'), /编号已被使用/);
  room = await act(one.state, one.state.hostId!, 'judge_soup_question', { verdict: 'yes' });
  assert.equal((await rawAction(previous, actor, 'submit_soup_question', { content: '是吗？' }, 'repeat')).state.version, room.version);
  assert.equal((await rawAction(previous, actor, 'skip_soup_turn')).outcome, 'stale');
  assert.equal(room.records.length, 1);
});

test('SQL: null judgments reject cleanly and 20+5 limit and hints are enforced', async () => {
  let room = await setup('LIMIT2', 3); const host = room.hostId!; room = await act(room, host, 'acknowledge_soup_host');
  room = await act(room, host, 'use_soup_hint'); room = await act(room, host, 'use_soup_hint');
  await assert.rejects(act(room, host, 'use_soup_hint'), /用完/);
  for (let i = 1; i <= 25; i++) {
    room = await act(room, room.currentDetectiveId!, 'submit_soup_question', { content: `问题 ${i}？` });
    if (i === 1) { await assert.rejects(act(room, host, 'judge_soup_question', {}), /请选择/); assert.equal((await current(room.code)).version, room.version); }
    room = await act(room, host, 'judge_soup_question', { verdict: 'yes' });
    assert.equal(room.effectiveQuestionCount, i);
    if (i === 20) { assert.equal(room.status, 'limit_reached'); room = await act(room, host, 'extend_soup_limit'); }
  }
  assert.equal(room.status, 'limit_reached'); assert.equal(room.maxQuestions, 25);
  await assert.rejects(act(room, host, 'extend_soup_limit'), /不能延长/);
  room = await act(room, host, 'reveal_soup_bottom'); assert.equal(room.status, 'feedback');
});

test('SQL: ending with a pending action reveals once and clears the pending record', async () => {
  let room = await setup('ENDED2', 3); room = await act(room, room.hostId!, 'acknowledge_soup_host');
  room = await act(room, room.currentDetectiveId!, 'submit_soup_solution', { content: '还原' });
  const beforeEnd = room;
  const result = await rawAction(room, 'p1', 'end_soup_game', {}, 'end-once'); room = result.state;
  assert.equal(room.status, 'finished'); assert.equal(room.pendingAction, null); assert.ok(room.revealedBottom); assert.equal(room.result?.revealedReason, 'ended');
  assert.equal((await rawAction(beforeEnd, 'p1', 'end_soup_game', {}, 'end-once')).outcome, 'duplicate');
});

test('SQL: anonymous clients cannot directly read A5 secrets, drafts or case bank', async () => {
  for (const table of ['soup_case_bank_v1', 'soup_round_secrets_v1', 'soup_drafts_v1', 'soup_feedback_v1', 'soup_actions_v1']) {
    await assert.rejects(db.transaction(async (tx) => { await tx.exec('set local role anon'); await tx.query(`select * from public.${table}`); }), /permission denied/);
  }
});

test('SQL: V1.1 read-only verification is executable and every check passes', async () => {
  const results = await db.query<{ expected_check: string; ok: boolean }>(sql('verify-v10-1-soup-reliability.sql'));
  for (const result of results.rows) assert.equal(result.ok, true, result.expected_check);
});
