import assert from 'node:assert/strict';
import test from 'node:test';
import { CLUE_DURATIONS, CLUE_MAX_GUESS_ATTEMPTS, createClueRoom, formatGuessTime, rankGuessTimes, rankHintScores, validateClue, validateRatings } from './clue-game.ts';
import { CLUE_PUBLIC_RULES, CLUE_ROLES, clueInputMaxLength, clueInputMinLength, clueInputPrompt } from './clue-content.ts';

test('提示大王创建独立公开房间且不包含答案', () => {
  const room = createClueRoom('负责人', 'role_play', 'hard', 100, () => 0.25);
  assert.equal(room.gameType, 'clue_king');
  assert.equal(room.clueVersion, 3);
  assert.equal(room.mode, 'role_play');
  assert.equal(room.difficulty, 'hard');
  assert.equal(room.status, 'lobby');
  assert.doesNotMatch(JSON.stringify(room), /targetWord/);
});

test('提示只做必要的长度和完整答案校验', () => {
  assert.equal(validateClue('夜晚', '加班', 8), '夜晚');
  assert.throws(() => validateClue('加班', '加班', 8), /不能直接写出答案/);
  assert.throws(() => validateClue('星期天下午也要继续开会', '加班', 8), /1–8 字/);
  assert.throws(() => validateClue('有点短', '充电宝', 20, 12), /12–20 字/);
  assert.equal(validateClue('我每次出门没带它都会特别没有安全感', '充电宝', 20, 12), '我每次出门没带它都会特别没有安全感');
  assert.equal(validateClue('班车', '加班', 8), '班车');
});

test('特殊规则只进入当前题占位提示，自由模式不重复默认规则', () => {
  assert.equal(CLUE_PUBLIC_RULES.length, 11);
  assert.equal(CLUE_ROLES.length, 12);
  assert.equal(clueInputPrompt({ mode: 'free' }), '填写本轮关联词');
  assert.match(clueInputPrompt({ mode: 'public_rule', publicRuleName: '问号局', publicRuleText: '把提示写成一个问句' }), /问号局/);
  assert.match(clueInputPrompt({ mode: 'role_play', roleName: '诗人', roleRule: '使用比喻或意象' }), /诗人/);
  assert.equal(clueInputMaxLength({ mode: 'role_play', roleId: 'R02' }), 20);
  assert.equal(clueInputMinLength({ mode: 'role_play', roleId: 'R02' }), 12);
  assert.equal(clueInputMinLength({ mode: 'free' }), 1);
});

test('评分允许每轮唯一的四分特别奖', () => {
  validateRatings({ a: 1, b: 4, c: 3 }, ['a', 'b', 'c']);
  validateRatings({ a: 2, b: 3 }, ['a', 'b']);
  assert.throws(() => validateRatings({ a: 1 }, ['a', 'b']), /每条提示/);
  assert.throws(() => validateRatings({ a: 5 }, ['a']), /1–4 分/);
  assert.throws(() => validateRatings({ a: 4, b: 4 }, ['a', 'b']), /最多一条/);
});

test('体验增量提供两分钟填写和三次判断机会', () => {
  assert.equal(CLUE_DURATIONS.clue_writing, 120_000);
  assert.equal(CLUE_MAX_GUESS_ATTEMPTS, 3);
});

test('提示分和猜题速度分别排行', () => {
  const room = createClueRoom('甲', 'free', 'normal', 100, () => 0.25);
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
