import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBallotResult, assignCards, autoAdvanceDue, autoVotingDue, canBeginVoting, canTriggerBuzzer, createRoom, determineWinner, discussionComplete, eligibleVoters, exitPlayer, getDescriptionTurnPlayer, getRoundChallenge, getRoundContents, getVotingOpensAt, isRoundContentVisible, PLAYER_LIMIT_OPTIONS, RANDOM_CHALLENGE_RULES, resolveBallot, resolveUndercoverComeback, revealDescriptions, selectChallengeRule, setAutoAdvancePaused, setPlayerAway, skipDescription, startDiscussion, startNextRound, startVoting, submitRoundContent, triggerBuzzer, undercoverOptions, type GameRoom, type Player } from './game.ts';
import { randomWordPairAvoiding, randomWordPairExcluding, WORD_PAIR_ENTRIES, wordPairKey } from './words.ts';

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

test('人数可设置为 3–10 的每个整数', () => {
  assert.deepEqual(PLAYER_LIMIT_OPTIONS, [3, 4, 5, 6, 7, 8, 9, 10]);
  for (const playerLimit of PLAYER_LIMIT_OPTIONS) {
    const room = createRoom({ ownerId: 'p0', ownerName: '房主', playerLimit, undercoverCount: playerLimit >= 9 ? 2 : 1, civilianWord: '牛奶', undercoverWord: '豆浆' });
    assert.equal(room.playerLimit, playerLimit);
  }
  assert.throws(() => createRoom({ ownerId: 'p0', ownerName: '房主', playerLimit: 2, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' }), /3–10/);
  assert.throws(() => createRoom({ ownerId: 'p0', ownerName: '房主', playerLimit: 11, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' }), /3–10/);
});

test('3–4 人仅允许 1 名卧底，5 人起可选择 2 名', () => {
  assert.deepEqual(undercoverOptions(3), [1]);
  assert.deepEqual(undercoverOptions(4), [1]);
  assert.deepEqual(undercoverOptions(5), [1, 2]);
  assert.equal(Object.keys(assignCards(players(3), 1, '牛奶', '豆浆')).length, 3);
  assert.throws(() => assignCards(players(3), 2, '牛奶', '豆浆'), /卧底人数不合法/);
  assert.throws(() => assignCards(players(4), 2, '牛奶', '豆浆'), /卧底人数不合法/);
});

test('再来一局会排除上一局词组，包含正序和反序', () => {
  const first = randomWordPairExcluding(['搬家', '旅行'], () => 0);
  const reversed = randomWordPairExcluding(['旅行', '搬家'], () => 0);
  assert.notEqual(wordPairKey(first), wordPairKey(['搬家', '旅行']));
  assert.notEqual(wordPairKey(reversed), wordPairKey(['搬家', '旅行']));
});

test('词库至少 100 组且没有直白禁用词组、重复或近期重复', () => {
  assert.ok(WORD_PAIR_ENTRIES.length >= 100);
  const keys = WORD_PAIR_ENTRIES.map((entry) => wordPairKey(entry.words));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(WORD_PAIR_ENTRIES.every((entry) => ['medium', 'hard'].includes(entry.difficulty)));
  assert.ok(!keys.includes(wordPairKey(['麻辣烫', '火锅'])));
  assert.ok(!keys.includes(wordPairKey(['耳机', '音响'])));
  const excluded = keys.slice(0, 10);
  assert.ok(!excluded.includes(wordPairKey(randomWordPairAvoiding(excluded, () => 0))));
});

test('本轮内容可逐人提交，全员完成后开放选择', () => {
  const roster = players(3);
  let room = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' });
  room = startDiscussion({ ...room, players: roster }, 1_000);
  assert.equal(room.discussionDeadlineAt, 121_000);
  assert.equal(canBeginVoting(room, 2_000), false);
  room = submitRoundContent(room, 'p0', '像是早餐会喝的东西', 2_000);
  room = submitRoundContent(room, 'p1', '通常装在杯子里', 3_000);
  assert.equal(discussionComplete(room), false);
  room = submitRoundContent(room, 'p2', '颜色比较浅', 4_000);
  assert.equal(getRoundContents(room).p2, '颜色比较浅');
  assert.equal(discussionComplete(room), true);
  assert.equal(canBeginVoting(room, 4_000), true);
});

test('本轮倒计时结束后即使有人未提交也可开放选择', () => {
  const roster = players(3);
  const base = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' });
  const room = startDiscussion({ ...base, players: roster }, 10_000);
  assert.equal(canBeginVoting(room, 129_999), false);
  assert.equal(canBeginVoting(room, 130_000), true);
  assert.throws(() => submitRoundContent(room, 'p0', 'x'.repeat(81)), /不能超过 80 字/);
});

test('全部提交后统一公开描述，提交前只能看到自己的内容', () => {
  let room = startDiscussion({ ...createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' }), players: players(3) }, 1_000);
  room = submitRoundContent(room, 'p0', '早餐常见', 2_000);
  assert.equal(isRoundContentVisible(room, 'p0', 'p0', 2_000), true);
  assert.equal(isRoundContentVisible(room, 'p0', 'p1', 2_000), false);
  room = submitRoundContent(room, 'p1', '装在杯子里', 3_000);
  room = submitRoundContent(room, 'p2', '颜色浅', 4_000);
  assert.equal(room.descriptionsRevealedAt, 4_000);
  assert.equal(room.votingOpensAt, 9_000);
  assert.equal(isRoundContentVisible(room, 'p0', 'p1', 4_000), true);
  assert.equal(canBeginVoting(room, 4_000), true);
});

test('描述公开 5 秒后自动开放投票且重复推进幂等', () => {
  let room = startDiscussion({ ...createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' }), players: players(3) }, 1_000);
  room = submitRoundContent(room, 'p0', '早餐常见', 2_000);
  room = submitRoundContent(room, 'p1', '装在杯子里', 3_000);
  room = submitRoundContent(room, 'p2', '颜色浅', 4_000);
  assert.equal(getVotingOpensAt(room), 9_000);
  assert.equal(autoVotingDue(room, 8_999), false);
  assert.equal(autoVotingDue(room, 9_000), true);
  const voting = startVoting(room, 9_000);
  assert.equal(voting.status, 'voting');
  assert.equal(voting.votingOpensAt, null);
  assert.equal(startVoting(voting, 10_000), voting);
});

test('描述超时后统一公开已有内容并标记未提交成员', () => {
  let room = startDiscussion({ ...createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆' }), players: players(3) }, 1_000);
  room = submitRoundContent(room, 'p0', '早餐常见', 2_000);
  room = revealDescriptions(room, 121_000);
  assert.deepEqual(room.skippedDescriptionPlayerIds, ['p1', 'p2']);
  assert.equal(canBeginVoting(room, 121_000), true);
});

test('按座位顺序提交描述并允许房主跳过当前成员', () => {
  const base = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆', descriptionRevealMode: 'sequential' });
  let room = startDiscussion({ ...base, players: players(3) }, 1_000);
  assert.equal(getDescriptionTurnPlayer(room)?.id, 'p0');
  assert.throws(() => submitRoundContent(room, 'p1', '不能抢先'), /还没有轮到/);
  room = submitRoundContent(room, 'p0', '早餐常见', 2_000);
  assert.equal(getDescriptionTurnPlayer(room)?.id, 'p1');
  assert.equal(room.discussionDeadlineAt, 122_000);
  assert.equal(isRoundContentVisible(room, 'p0', 'p2'), true);
  room = skipDescription(room, 'p1', 3_000);
  assert.equal(getDescriptionTurnPlayer(room)?.id, 'p2');
  assert.equal(room.discussionDeadlineAt, 123_000);
  room = submitRoundContent(room, 'p2', '颜色浅', 4_000);
  assert.equal(room.descriptionsRevealedAt, 4_000);
  assert.equal(canBeginVoting(room, 4_000), true);
});

test('顺序描述每位玩家独立计时，当前玩家超时只跳过本人', () => {
  const base = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '搬家', undercoverWord: '旅行', descriptionRevealMode: 'sequential' });
  let room = startDiscussion({ ...base, players: players(3) }, 1_000);
  room = skipDescription(room, 'p0', 121_000);
  assert.deepEqual(room.skippedDescriptionPlayerIds, ['p0']);
  assert.equal(getDescriptionTurnPlayer(room)?.id, 'p1');
  assert.equal(room.discussionDeadlineAt, 241_000);
  assert.equal(room.descriptionsRevealedAt, null);
});

test('暂退不触发胜负并移出当前参与名单，返回后恢复', () => {
  const roster = players(4);
  let room = votingRoom();
  room = { ...room, players: roster, assignments: { p0: { role: 'undercover', word: '旅行' }, p1: { role: 'civilian', word: '搬家' }, p2: { role: 'civilian', word: '搬家' }, p3: { role: 'civilian', word: '搬家' } } };
  room = setPlayerAway(room, 'p1', true, 1_000);
  assert.equal(room.players.find((player) => player.id === 'p1')?.alive, true);
  assert.equal(determineWinner(room), null);
  assert.deepEqual(eligibleVoters(room).map((player) => player.id), ['p0', 'p2', 'p3']);
  room = setPlayerAway(room, 'p1', false, 2_000);
  assert.ok(eligibleVoters(room).some((player) => player.id === 'p1'));
});

test('永久退出按淘汰处理并立即重新判断胜负', () => {
  const room = votingRoom();
  const next = exitPlayer(room, 'p1', 1_000);
  assert.equal(next.players.find((player) => player.id === 'p1')?.alive, false);
  assert.equal(next.lastResult, null);
  const decisive = exitPlayer({ ...room, players: room.players.slice(0, 3), assignments: { p0: { role: 'undercover', word: '旅行' }, p1: { role: 'civilian', word: '搬家' }, p2: { role: 'civilian', word: '搬家' } } }, 'p1', 2_000);
  assert.equal(decisive.winner, 'undercover');
  assert.equal(decisive.status, 'finished');
  assert.equal(decisive.lastResult?.eliminatedId, 'p1');
});

test('随机挑战包含确认的 9 条规则且连续两轮不重复', () => {
  assert.equal(RANDOM_CHALLENGE_RULES.length, 9);
  assert.deepEqual(RANDOM_CHALLENGE_RULES.map((rule) => rule.text), [
    '最多 3 个字', '恰好 7 个字', '恰好 8 个字', '只能描述使用场景', '只能描述外观或感受',
    '必须使用一个比喻', '必须使用问句', '用一句个人经历表达', '本轮自由表达',
  ]);
  const first = selectChallengeRule('random', null, () => 0);
  const second = selectChallengeRule('random', first?.id, () => 0);
  assert.notEqual(first?.id, second?.id);
});

test('挑战规则按轮次写入公共房间状态', () => {
  const base = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 3, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆', challengeMode: 'random' });
  const first = startDiscussion({ ...base, players: players(3) }, 1_000, () => 0);
  assert.equal(getRoundChallenge(first, 1)?.text, '最多 3 个字');
  const second = startNextRound({ ...first, status: 'result' }, 2_000, () => 0);
  assert.notEqual(getRoundChallenge(second, 2)?.id, getRoundChallenge(first, 1)?.id);
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

test('开启猜词翻盘后卧底被投出会进入 20 秒私密判定', () => {
  const room = { ...votingRoom(), undercoverComebackEnabled: true };
  room.votes = { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p0', p4: 'p0', p5: 'p0' };
  const next = applyBallotResult(room, resolveBallot(room), 10_000);
  assert.equal(next.status, 'guessing');
  assert.equal(next.pendingComebackPlayerId, 'p0');
  assert.equal(next.comebackDeadlineAt, 30_000);
  assert.equal(next.players.find((player) => player.id === 'p0')?.alive, true);
});

test('卧底猜中另一组词立即获胜，猜错则正常退出', () => {
  const base = { ...votingRoom(), undercoverComebackEnabled: true };
  base.votes = { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p0', p4: 'p0', p5: 'p0' };
  const guessing = applyBallotResult(base, resolveBallot(base), 10_000);
  const won = resolveUndercoverComeback(guessing, 'p0', ' 牛奶！ ', 15_000);
  assert.equal(won.status, 'finished');
  assert.equal(won.winner, 'undercover');
  assert.equal(won.lastComebackResult?.correct, true);

  const lost = resolveUndercoverComeback(guessing, 'p0', '咖啡', 15_000);
  assert.equal(lost.players.find((player) => player.id === 'p0')?.alive, false);
  assert.equal(lost.winner, 'civilian');
  assert.equal(lost.lastComebackResult?.correct, false);

  const timedOut = resolveUndercoverComeback(guessing, 'p0', '牛奶', 30_000);
  assert.equal(timedOut.lastComebackResult?.timedOut, true);
  assert.equal(timedOut.winner, 'civilian');
});

test('主动爆灯只在描述公开后可触发且整局一次', () => {
  const roster = players(6);
  const base = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 6, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆', buzzerEnabled: true });
  let room = startDiscussion({ ...base, players: roster, assignments: votingRoom().assignments }, 1_000);
  assert.equal(canTriggerBuzzer(room, 'p0', 2_000), false);
  for (const [index, player] of roster.entries()) room = submitRoundContent(room, player.id, `描述${index}`, 2_000 + index);
  assert.equal(canTriggerBuzzer(room, 'p0', 3_000), true);
  const guessing = triggerBuzzer(room, 'p0', 4_000);
  assert.equal(guessing.pendingGuessingReason, 'buzzer');
  assert.equal(guessing.comebackDeadlineAt, 24_000);
  const won = resolveUndercoverComeback(guessing, 'p0', '牛奶', 5_000);
  assert.equal(won.winner, 'undercover');
  assert.equal(won.buzzerStatus, 'success');
});

test('平民误爆灯或卧底猜错会退出并恢复原阶段', () => {
  const roster = players(6);
  const base = createRoom({ ownerId: 'p0', ownerName: '玩家 1', playerLimit: 6, undercoverCount: 1, civilianWord: '牛奶', undercoverWord: '豆浆', buzzerEnabled: true });
  let room = startDiscussion({ ...base, players: roster, assignments: votingRoom().assignments }, 1_000);
  for (const [index, player] of roster.entries()) room = submitRoundContent(room, player.id, `描述${index}`, 2_000 + index);
  const civilianFailed = resolveUndercoverComeback(triggerBuzzer(room, 'p1', 4_000), 'p1', '牛奶', 5_000);
  assert.equal(civilianFailed.status, 'discussion');
  assert.equal(civilianFailed.players.find((player) => player.id === 'p1')?.alive, false);
  assert.equal(civilianFailed.undercoverComebackUsed, false);

  const undercoverFailed = resolveUndercoverComeback(triggerBuzzer(room, 'p0', 4_000), 'p0', '咖啡', 5_000);
  assert.equal(undercoverFailed.winner, 'civilian');
  assert.equal(undercoverFailed.undercoverComebackUsed, true);
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
  assert.equal(next.nextRoundAt !== null, true);
});

test('结果页十秒后自动进入且暂停时不会推进', () => {
  const room = { ...votingRoom(), ballot: 2, runoffCandidateIds: ['p0', 'p1'], autoAdvanceEnabled: true };
  room.votes = { p0: 'p1', p1: 'p0', p2: 'p0', p3: 'p1', p4: 'p0', p5: 'p1' };
  const resultRoom = applyBallotResult(room, resolveBallot(room), 10_000);
  assert.equal(resultRoom.nextRoundAt, 20_000);
  assert.equal(autoAdvanceDue(resultRoom, 19_999), false);
  assert.equal(autoAdvanceDue(resultRoom, 20_000), true);
  const paused = setAutoAdvancePaused(resultRoom, true, 12_000);
  assert.equal(paused.nextRoundAt, null);
  assert.equal(autoAdvanceDue(paused, 30_000), false);
  const resumed = setAutoAdvancePaused(paused, false, 30_000);
  assert.equal(resumed.nextRoundAt, 40_000);
  const next = startNextRound(resumed, 40_000);
  assert.equal(next.round, 2);
  assert.equal(startNextRound(next, 40_001).round, 2);
});

test('卧底人数达到平民人数时卧底获胜', () => {
  const room = votingRoom();
  room.players = room.players.map((player, index) => ({ ...player, alive: index < 2 }));
  assert.equal(determineWinner(room), 'undercover');
});
