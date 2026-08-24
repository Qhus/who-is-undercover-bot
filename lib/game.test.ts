import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBallotResult, assignCards, createRoom, determineWinner, resolveBallot, type GameRoom, type Player } from './game.ts';

function players(count = 8): Player[] {
  return Array.from({ length: count }, (_, index) => ({ id: `p${index}`, name: `玩家 ${index + 1}`, seat: index + 1, alive: true, cardReady: true }));
}

function votingRoom(): GameRoom {
  const roster = players(6);
  const room = createRoom({ code: 'ABC234', ownerId: 'p0', ownerName: '玩家 1', playerLimit: 6, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' });
  return {
    ...room,
    status: 'voting',
    players: roster,
    assignments: Object.fromEntries(roster.map((player, index) => [player.id, { role: index === 0 ? 'undercover' as const : 'civilian' as const, word: index === 0 ? '豆浆' : '牛奶' }])),
  };
}

test('8 人发牌连续 1000 次都恰好只有一名卧底', () => {
  const roster = players(8);
  for (let index = 0; index < 1000; index += 1) {
    const assignments = assignCards(roster, 1, '牛奶', '豆浆');
    assert.equal(Object.keys(assignments).length, 8);
    assert.equal(Object.values(assignments).filter((card) => card.role === 'undercover').length, 1);
  }
});

test('唯一最高票玩家被淘汰', () => {
  const room = votingRoom();
  room.votes = { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p0', p4: 'p0', p5: 'p0' };
  const result = resolveBallot(room);
  assert.equal(result.eliminatedId, 'p0');
  const next = applyBallotResult(room, result);
  assert.equal(next.players.find((player) => player.id === 'p0')?.alive, false);
  assert.equal(next.winner, 'civilian');
});

test('首次平票进入只包含并列者的复投', () => {
  const room = votingRoom();
  room.votes = { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p1', p4: 'p0', p5: 'p1' };
  const next = applyBallotResult(room, resolveBallot(room));
  assert.equal(next.status, 'voting');
  assert.equal(next.ballot, 2);
  assert.deepEqual(next.runoffCandidateIds, ['p0', 'p1']);
  assert.deepEqual(next.votes, {});
});

test('第二次仍平票时本轮无人出局', () => {
  const room = { ...votingRoom(), ballot: 2, runoffCandidateIds: ['p0', 'p1'] };
  room.votes = { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p1', p4: 'p0', p5: 'p1' };
  const result = resolveBallot(room);
  assert.equal(result.noElimination, true);
  assert.equal(result.eliminatedId, null);
  const next = applyBallotResult(room, result);
  assert.equal(next.players.every((player) => player.alive), true);
  assert.equal(next.status, 'result');
});

test('卧底人数达到平民人数时卧底获胜', () => {
  const room = votingRoom();
  room.players = room.players.map((player, index) => ({ ...player, alive: index < 2 }));
  assert.equal(determineWinner(room), 'undercover');
});
