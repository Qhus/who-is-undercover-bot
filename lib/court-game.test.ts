import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT_CASE_PACKS, COURT_V7_SAMPLE_CASES } from './court-content.ts';
import {
  COURT_DURATIONS,
  COURT_TACTICS,
  createCourtRoom,
  nextCourtStatus,
  rankScores,
  restartCourtGame,
  startCourtRound,
  validateResponse,
  validateQuestionChoice,
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

test('内容版至少提供 30 个短口语参考答辩且 ID 唯一的案件包', () => {
  assert.ok(COURT_CASE_PACKS.length >= 30);
  assert.equal(new Set(COURT_CASE_PACKS.map((item) => item.id)).size, COURT_CASE_PACKS.length);
  const formalPhrases = /风险评估|统一基线|治理方案|保障工作|独立性|预判|效率选择|定义顺序|响应时间/;
  for (const item of COURT_CASE_PACKS) {
    assert.ok(item.title && item.charge && item.evidenceTitle && item.evidence && item.referenceStatement && item.referenceResponse && item.verdictTemplate);
    assert.match(item.charge, /^被控/);
    assert.ok(item.referenceStatement.length <= 42);
    assert.ok(item.referenceResponse.length <= 42);
    assert.doesNotMatch(`${item.referenceStatement}${item.referenceResponse}`, formalPhrases);
  }
});

test('攻防版保留两段长输入并提供四十五秒质询', () => {
  assert.equal(COURT_DURATIONS.statement, 300_000);
  assert.equal(COURT_DURATIONS.questioning, 45_000);
  assert.equal(COURT_DURATIONS.response, 300_000);
  assert.equal(COURT_DURATIONS.voting, 120_000);
  assert.throws(() => validateStatement(''));
  assert.throws(() => validateStatement('甲'.repeat(81)));
  assert.doesNotThrow(() => validateStatement('我可以解释'));
  assert.throws(() => validateResponse(''));
  assert.throws(() => validateResponse('甲'.repeat(121)));
  assert.doesNotThrow(() => validateResponse('甲'.repeat(120)));
  assert.throws(() => validateQuestionChoice(null, [{ id: 'a' }]));
  assert.throws(() => validateQuestionChoice('b', [{ id: 'a' }]));
  assert.doesNotThrow(() => validateQuestionChoice('a', [{ id: 'a' }]));
});

test('V7 样板包含六套案件、三选一质询和八种辩护招式', () => {
  assert.equal(COURT_V7_SAMPLE_CASES.length, 6);
  assert.equal(COURT_TACTICS.length, 8);
  for (const item of COURT_V7_SAMPLE_CASES) {
    assert.equal(item.v7Sample?.questionCards.length, 3);
    assert.ok(item.v7Sample?.archiveTactic && item.v7Sample.archiveQuestion);
    assert.equal(new Set(item.v7Sample?.questionCards).size, 3);
  }
});

test('双项投票均必选、不能投自己且允许投给同一条', () => {
  const entries = ['mine', 'other', 'reference'];
  assert.throws(() => validateVote('mine', null, 'other', entries));
  assert.throws(() => validateVote('mine', 'other', null, entries));
  assert.throws(() => validateVote('mine', 'mine', 'other', entries));
  assert.throws(() => validateVote('mine', 'other', 'mine', entries));
  assert.doesNotThrow(() => validateVote('mine', 'other', 'reference', entries));
  assert.doesNotThrow(() => validateVote('mine', 'reference', 'reference', entries));
});

test('两名有效玩家即可开始离谱法堂', () => {
  const room = createCourtRoom('甲', 0, () => 0.2);
  assert.equal(startCourtRound(room, 1, () => 0).status, 'finished');
  room.players.push({ id: 'b', name: '乙', seat: 2, alive: true, cardReady: false, away: false, eligibleFromRound: 1 });
  assert.equal(startCourtRound(room, 1, () => 0).status, 'statement');
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

test('完整状态机包含选择质询与证据阶段并在第三轮结束', () => {
  let room = startCourtRound(threePlayerRoom(), 1, () => 0);
  assert.equal(room.status, 'statement');
  room = nextCourtStatus(room, 2);
  assert.equal(room.status, 'questioning');
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
  const room = { ...threePlayerRoom(), status: 'finished' as const, round: 3, sessionNo: 4, usedCaseIds: ['a', 'b', 'c'], totalBestScores: { b: 2 }, totalTruthScores: { c: 1 } };
  const restarted = restartCourtGame(room, 10);
  assert.equal(restarted.sessionNo, 5);
  assert.equal(restarted.status, 'lobby');
  assert.equal(restarted.players.length, 3);
  assert.deepEqual(restarted.previousSessionCaseIds, ['a', 'b', 'c']);
  assert.deepEqual(restarted.usedCaseIds, []);
  assert.deepEqual(restarted.totalBestScores, {});
  assert.deepEqual(restarted.totalTruthScores, {});
  assert.deepEqual(restarted.roundResults, []);
});

test('累计分数平分共享名次', () => {
  assert.deepEqual(rankScores({ a: 4, b: 4, c: 2 }).map((item) => item.rank), [1, 1, 3]);
});
