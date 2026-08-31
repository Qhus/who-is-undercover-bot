import assert from 'node:assert/strict';
import test from 'node:test';
import { createClueRoom, formatGuessTime, rankGuessTimes, rankHintScores, validateClue, validateRatings } from './clue-game.ts';

test('提示大王创建独立公开房间且不包含答案', () => {
  const room = createClueRoom('负责人', 'random', 100, () => 0.25);
  assert.equal(room.gameType, 'clue_king');
  assert.equal(room.clueVersion, 1);
  assert.equal(room.ruleMode, 'random');
  assert.equal(room.status, 'lobby');
  assert.doesNotMatch(JSON.stringify(room), /targetWord/);
});

test('提示校验保留重复可能但执行可选限制', () => {
  assert.equal(validateClue('夜晚', '加班', null), '夜晚');
  assert.throws(() => validateClue('加班', '加班', null), /不能直接写出答案/);
  assert.throws(() => validateClue('星期天下午', '加班', 'max2'), /最多 2 字/);
  assert.throws(() => validateClue('三字词', '加班', 'exact4'), /正好 4 字/);
  assert.throws(() => validateClue('很夜晚', '加班', 'no_fillers'), /不能包含/);
});

test('评分要求每条提示都有一至三分', () => {
  validateRatings({ a: 1, b: 3 }, ['a', 'b']);
  assert.throws(() => validateRatings({ a: 1 }, ['a', 'b']), /每条提示/);
  assert.throws(() => validateRatings({ a: 4 }, ['a']), /1–3 分/);
});

test('提示分和猜题速度分别排行', () => {
  const room = createClueRoom('甲', 'off', 100, () => 0.25);
  room.players.push(
    { id: 'b', name: '乙', seat: 2, alive: true, cardReady: false, away: false },
    { id: 'c', name: '丙', seat: 3, alive: true, cardReady: false, away: false },
  );
  room.hintScores = { [room.ownerId]: 8, b: 8, c: 4 };
  room.guessTimes = { [room.ownerId]: 12500, b: 8300 };
  assert.deepEqual(rankHintScores(room).map((item) => item.rank), [1, 1, 3]);
  assert.deepEqual(rankGuessTimes(room).map((item) => item.name), ['乙', '甲', '丙']);
  assert.equal(formatGuessTime(8300), '8.3 秒');
  assert.equal(formatGuessTime(null), '未猜中');
});
