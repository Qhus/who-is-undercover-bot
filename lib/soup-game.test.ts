import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUP_CASES, validateSoupCaseLibrary } from './soup-content.ts';
import {
  acknowledgeSoupHost, createSoupRoom, extendSoupLimit, judgeSoupQuestion, judgeSoupSolution,
  nextSoupRound, revealSoupBottom, skipSoupTurn, startSoupGame, submitSoupQuestion, submitSoupSolution,
  useSoupHint, validateSoupFeedback, type SoupRoom,
} from './soup-game.ts';

function roomWithPlayers(count = 5): SoupRoom {
  const room = createSoupRoom('甲', 1, () => 0);
  room.players = Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, name: `玩家${index + 1}`, seat: index + 1, alive: true, cardReady: false, away: false,
  }));
  room.ownerId = 'p1';
  return room;
}

test('A5 contains twenty structured pilot cards with the required distribution', () => {
  assert.deepEqual(validateSoupCaseLibrary(), []);
  assert.equal(SOUP_CASES.filter((card) => card.reviewStatus === 'approved').length, 0);
  assert.equal(SOUP_CASES.every((card) => card.commonQuestions.length >= 8), true);
});

test('public room never contains the private bottom before reveal', () => {
  const started = startSoupGame(roomWithPlayers(3), 'p1', SOUP_CASES, 10, () => 0.999);
  assert.equal(started.room.status, 'host_reading');
  assert.equal(JSON.stringify(started.room).includes(started.secret.bottom), false);
  assert.equal(JSON.stringify(started.room).includes(SOUP_CASES.find((card) => card.id === started.secret.caseId)!.internalTitle), false);
  assert.match(started.secret.caseId, /^soup-[enh]\d{2}$/);
  assert.equal(started.room.hostId, 'p1');
  assert.equal(started.room.currentDetectiveId, 'p2');
});

test('detectives act in order and only host judgments advance the turn', () => {
  const started = startSoupGame(roomWithPlayers(), 'p1', SOUP_CASES, 10, () => 0.999);
  let room = acknowledgeSoupHost(started.room, 'p1', 11);
  room = submitSoupQuestion(room, 'p2', '他昨晚就在公司吗？', 12);
  assert.equal(room.status, 'judging_question');
  assert.equal(room.currentDetectiveId, 'p2');
  assert.throws(() => judgeSoupQuestion(room, 'p3', 'yes'), /汤主/);
  room = judgeSoupQuestion(room, 'p1', 'yes', '', 13);
  assert.equal(room.currentDetectiveId, 'p3');
  assert.equal(room.effectiveQuestionCount, 1);
  room = skipSoupTurn(room, 'p3', 14);
  assert.equal(room.currentDetectiveId, 'p4');
});

test('rephrase is public but does not consume the effective question limit', () => {
  const started = startSoupGame(roomWithPlayers(3), 'p1', SOUP_CASES, 10, () => 0.999);
  let room = acknowledgeSoupHost(started.room, 'p1', 11);
  room = submitSoupQuestion(room, 'p2', '请讲讲事情经过', 12);
  room = judgeSoupQuestion(room, 'p1', 'rephrase', '请改成能回答是或否的问题', 13);
  assert.equal(room.effectiveQuestionCount, 0);
  assert.equal(room.records[0].counted, false);
  assert.equal(room.currentDetectiveId, 'p3');
});

test('question limit supports exactly one five-question extension', () => {
  const started = startSoupGame(roomWithPlayers(3), 'p1', SOUP_CASES, 10, () => 0.999);
  let room = acknowledgeSoupHost(started.room, 'p1', 11);
  room.effectiveQuestionCount = 19;
  room = submitSoupQuestion(room, 'p2', '与时间有关吗？', 12);
  room = judgeSoupQuestion(room, 'p1', 'yes', '', 13);
  assert.equal(room.status, 'limit_reached');
  room = extendSoupLimit(room, 'p1', 14);
  assert.equal(room.maxQuestions, 25);
  assert.equal(room.status, 'investigating');
  room.status = 'limit_reached';
  assert.throws(() => extendSoupLimit(room, 'p1'), /已经延长/);
});

test('host may use two hints and a successful solution reveals the bottom', () => {
  const started = startSoupGame(roomWithPlayers(3), 'p1', SOUP_CASES, 10, () => 0.999);
  let room = acknowledgeSoupHost(started.room, 'p1', 11);
  room = useSoupHint(room, 'p1', started.secret, 12);
  room = useSoupHint(room, 'p1', started.secret, 13);
  assert.throws(() => useSoupHint(room, 'p1', started.secret), /用完/);
  room = submitSoupSolution(room, room.currentDetectiveId!, '他上的是夜班。', 14);
  room = judgeSoupSolution(room, 'p1', 'success', started.secret, '', 15);
  assert.equal(room.status, 'feedback');
  assert.equal(room.revealedBottom, started.secret.bottom);
  assert.equal(room.result?.solverId, 'p2');
});

test('host rotation avoids repeats until everyone has served and cases do not repeat', () => {
  let started = startSoupGame(roomWithPlayers(3), 'p1', SOUP_CASES, 10, () => 0);
  const firstHost = started.room.hostId;
  const firstCase = started.secret.caseId;
  let room = acknowledgeSoupHost(started.room, firstHost!, 11);
  room = revealSoupBottom(room, firstHost!, started.secret, 12);
  started = nextSoupRound(room, 'p1', SOUP_CASES, 13, () => 0);
  assert.notEqual(started.room.hostId, firstHost);
  assert.notEqual(started.secret.caseId, firstCase);
});

test('feedback validation preserves explicit quality flags', () => {
  assert.deepEqual(validateSoupFeedback({ difficulty: 'just_right', ambiguous: true, unsuitable: false, note: '边界可再清楚些' }), {
    difficulty: 'just_right', ambiguous: true, unsuitable: false, note: '边界可再清楚些',
  });
});
