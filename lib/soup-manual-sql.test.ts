import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { SoupPrivateRound, SoupRoom } from './soup-game.ts';

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
  await db.exec(sql('concurrency-v12-soup-manual-queue.sql'));
  await db.exec(sql('concurrency-v12-soup-manual-queue.sql'));
  await db.exec(sql('concurrency-v12-1-soup-two-players.sql'));
  await db.exec(sql('concurrency-v12-1-soup-two-players.sql'));
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
let actionNo = 0;
const act = async (room: SoupRoom, actor: string, type: string, payload: unknown = {}) => {
  const result = await rpc<{ state: SoupRoom; outcome: string }>(actor, 'apply_soup_action_v121', [room.code, `manual-${++actionNo}`, type, room.status, room.round, room.sessionNo, room.version, JSON.stringify(payload)]);
  assert.equal(result.outcome, 'applied'); return result.state;
};

test('SQL: manual host prepares a private case and detectives share a one-item-each FIFO queue', async () => {
  let room = await rpc<SoupRoom>('u1', 'create_soup_game_v12', ['MANQAZ', 'p1', '成员1']);
  room = (await rpc<{ state: SoupRoom }>('u2', 'join_soup_game_v12', [room.code, 'p2', '成员2'])).state;
  room = (await rpc<{ state: SoupRoom }>('u3', 'join_soup_game_v12', [room.code, 'p3', '成员3'])).state;
  room = await act(room, 'u1', 'start_soup_game');
  assert.equal(room.status, 'host_preparing'); assert.ok(room.hostId); assert.equal(room.soupVersion, 2);
  const uidByPlayer: Record<string, string> = { p1: 'u1', p2: 'u2', p3: 'u3' };
  const host = room.hostId!; const hostUid = uidByPlayer[host];
  const detectives = room.players.map((p) => p.id).filter((id) => id !== host);
  const before = await rpc<SoupPrivateRound>(hostUid, 'get_my_soup_round_v12', [room.code]);
  assert.equal(before.bottom, null);

  room = await act(room, hostUid, 'prepare_soup_case', {
    surface: '会议结束后，他却说会议还没开始。为什么？', surfaceImageUrl: 'https://example.com/surface.png',
    bottom: '他看的其实是会议录像，真正的现场会议尚未开始。', bottomImageUrl: 'https://example.com/bottom.png',
    keyFacts: '看到的是录像', boundary: '能解释时间错位即可',
  });
  assert.equal(room.status, 'investigating');
  assert.equal(JSON.stringify(room).includes('真正的现场会议'), false);
  const hostPacket = await rpc<SoupPrivateRound>(hostUid, 'get_my_soup_round_v12', [room.code]);
  assert.match(hostPacket.bottom ?? '', /录像/);
  const detectivePacket = await rpc<SoupPrivateRound>(uidByPlayer[detectives[0]], 'get_my_soup_round_v12', [room.code]);
  assert.equal(detectivePacket.bottom, null);

  const draft = await rpc<{ accepted: boolean; privateRound: SoupPrivateRound }>(uidByPlayer[detectives[0]], 'save_soup_draft_v12', [room.code, room.sessionNo, room.round, 0, '这是录像吗？', '他在回看录像']);
  assert.equal(draft.accepted, true); assert.equal(draft.privateRound.solutionDraft, '他在回看录像');

  room = await act(room, uidByPlayer[detectives[0]], 'submit_soup_question', { content: '他看到的是录像吗？' });
  room = await act(room, uidByPlayer[detectives[1]], 'submit_soup_question', { content: '会议在另一个时区吗？' });
  assert.equal(room.questionQueue?.length, 2); assert.equal(room.questionQueue?.[0].playerId, detectives[0]);
  await assert.rejects(act(room, uidByPlayer[detectives[0]], 'submit_soup_question', { content: '重复排队' }), /已有一条/);
  room = await act(room, hostUid, 'judge_soup_question', { verdict: 'yes', note: '方向正确' });
  assert.equal(room.questionQueue?.length, 1); assert.equal(room.questionQueue?.[0].playerId, detectives[1]);
  await assert.rejects(act(room, uidByPlayer[detectives[0]], 'submit_soup_question', { content: '马上再问' }), /冷却/);
  room = await act(room, hostUid, 'judge_soup_question', { verdict: 'no' });
  room = await act(room, hostUid, 'publish_soup_note', { kind: 'evidence', text: '注意时间线', imageUrl: 'https://example.com/evidence.png' });
  assert.equal(room.publicPosts?.length, 1);

  await db.query("update games set state=jsonb_set(state,array['lastQuestionAtByPlayer',$2],to_jsonb(0::bigint),true) where code=$1", [room.code, detectives[0]]);
  room = (await db.query<{ state: SoupRoom }>('select state from games where code=$1', [room.code])).rows[0].state;
  room = await act(room, uidByPlayer[detectives[0]], 'submit_soup_solution', { content: '他看到录像，现场会议还未开始。' });
  room = await act(room, hostUid, 'judge_soup_solution', { verdict: 'success' });
  assert.equal(room.status, 'round_result'); assert.match(room.revealedBottom ?? '', /录像/); assert.equal(room.questionQueue?.length, 0);
  const previousHost = room.hostId;
  room = await act(room, 'u1', 'next_soup_round');
  assert.equal(room.status, 'host_preparing'); assert.notEqual(room.hostId, previousHost);
});

test('SQL: V1.2 read-only verification is executable and every check passes', async () => {
  const results = await db.query<{ expected_check: string; ok: boolean }>(sql('verify-v12-soup-manual-queue.sql'));
  for (const result of results.rows) assert.equal(result.ok, true, result.expected_check);
});

test('SQL: two players can solve a bowl and swap host on the next bowl', async () => {
  let room = await rpc<SoupRoom>('u4', 'create_soup_game_v12', ['TWOQAZ', 'p4', '双人甲']);
  room = (await rpc<{ state: SoupRoom }>('u5', 'join_soup_game_v12', [room.code, 'p5', '双人乙'])).state;
  room = await act(room, 'u4', 'start_soup_game');
  assert.equal(room.status, 'host_preparing');
  assert.ok(room.hostId === 'p4' || room.hostId === 'p5');
  const uidByPlayer: Record<string, string> = { p4: 'u4', p5: 'u5' };
  const firstHost = room.hostId!;
  const detective = firstHost === 'p4' ? 'p5' : 'p4';
  room = await act(room, uidByPlayer[firstHost], 'prepare_soup_case', { surface: '灯亮了，他却开始找开关。', bottom: '亮的是电脑屏幕，不是房间灯。' });
  room = await act(room, uidByPlayer[detective], 'submit_soup_solution', { content: '亮的是屏幕，他在找房间灯的开关。' });
  room = await act(room, uidByPlayer[firstHost], 'judge_soup_solution', { verdict: 'success' });
  assert.equal(room.status, 'round_result');
  room = await act(room, 'u4', 'next_soup_round');
  assert.equal(room.status, 'host_preparing');
  assert.equal(room.hostId, detective);
});

test('SQL: V1.12.1 read-only verification is executable and every check passes', async () => {
  const results = await db.query<{ expected_check: string; ok: boolean }>(sql('verify-v12-1-soup-two-players.sql'));
  for (const result of results.rows) assert.equal(result.ok, true, result.expected_check);
});
