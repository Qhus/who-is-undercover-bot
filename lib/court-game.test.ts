import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT_CASE_PACKS } from './court-content.ts';
import {
  COURT_DURATIONS,
  createCourtRoom,
  nextCourtStatus,
  rankScores,
  restartCourtGame,
  startCourtRound,
  validateResponse,
  validateStatement,
  validateVote,
} from './court-game.ts';

function threePlayerRoom() {
  const room = createCourtRoom('甲', 0, () => 0.2);
  room.players.push(
    { id: 'b', name: '乙', seat: 2, alive: true, cardReady: false, away: false, eligibleFromRound: 1 },
    { id: 'c', name: '丙', seat: 3, alive: true, cardReady: false, away: false, eligibleFromRound: 1 },
  );
  return room;
}

test('Draft 0.2 至少提供 15 个字段完整且 ID 唯一的案件包', () => {
  assert.ok(COURT_CASE_PACKS.length >= 15);
  assert.equal(new Set(COURT_CASE_PACKS.map((item) => item.id)).size, COURT_CASE_PACKS.length);
  for (const item of COURT_CASE_PACKS) {
    assert.ok(item.title && item.charge && item.evidenceTitle && item.evidence && item.verdictTemplate);
  }
});

test('首次陈词和当庭补述均为 120 秒且最多 80 字', () => {
  assert.equal(COURT_DURATIONS.statement, 120_000);
  assert.equal(COURT_DURATIONS.response, 120_000);
  assert.throws(() => validateStatement(''));
  assert.throws(() => validateStatement('甲'.repeat(81)));
  assert.doesNotThrow(() => validateStatement('我可以解释'));
  assert.throws(() => validateResponse(''));
  assert.throws(() => validateResponse('甲'.repeat(81)));
});

test('每名玩家每轮只能选择一条且不能投自己', () => {
  assert.throws(() => validateVote('mine', null, ['mine', 'other']));
  assert.throws(() => validateVote('mine', 'mine', ['mine', 'other']));
  assert.doesNotThrow(() => validateVote('mine', 'other', ['mine', 'other']));
});

test('同一局三轮不重复案件且新局优先排除上一局案件', () => {
  let room = startCourtRound(threePlayerRoom(), 1, () => 0);
  const first = room.caseId;
  room = startCourtRound({ ...room, status: 'result' }, 2, () => 0);
  assert.notEqual(room.caseId, first);
  const previousCases = [...room.usedCaseIds];
  room = restartCourtGame({ ...room, status: 'finished' }, 3);
  assert.deepEqual(room.previousSessionCaseIds, previousCases);
  room = startCourtRound(room, 4, () => 0);
  assert.ok(!previousCases.includes(room.caseId ?? ''));
});

test('完整状态机包含证据阶段并在第三轮结束', () => {
  let room = startCourtRound(threePlayerRoom(), 1, () => 0);
  assert.equal(room.status, 'statement');
  room = nextCourtStatus(room, 2);
  assert.equal(room.status, 'statement_reveal');
  room = nextCourtStatus(room, 3);
  assert.equal(room.status, 'evidence');
  room = nextCourtStatus(room, 4);
  assert.equal(room.status, 'response');
  room = nextCourtStatus(room, 5);
  assert.equal(room.status, 'voting');
  room = nextCourtStatus(room, 6);
  assert.equal(room.status, 'result');
  assert.equal(nextCourtStatus({ ...room, round: 3 }, 7).status, 'finished');
});

test('再来一局保留成员并递增局次，清空本局结果', () => {
  const room = { ...threePlayerRoom(), status: 'finished' as const, round: 3, sessionNo: 4, usedCaseIds: ['a', 'b', 'c'], totalScores: { b: 2 } };
  const restarted = restartCourtGame(room, 10);
  assert.equal(restarted.sessionNo, 5);
  assert.equal(restarted.status, 'lobby');
  assert.equal(restarted.players.length, 3);
  assert.deepEqual(restarted.previousSessionCaseIds, ['a', 'b', 'c']);
  assert.deepEqual(restarted.usedCaseIds, []);
  assert.deepEqual(restarted.totalScores, {});
  assert.deepEqual(restarted.roundResults, []);
});

test('累计分数平分共享名次', () => {
  assert.deepEqual(rankScores({ a: 4, b: 4, c: 2 }).map((item) => item.rank), [1, 1, 3]);
});
