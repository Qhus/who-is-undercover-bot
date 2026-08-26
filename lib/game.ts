export type Role = 'civilian' | 'undercover' | 'blank';
export type Winner = Role | null;
export type GameStatus = 'lobby' | 'cards' | 'discussion' | 'voting' | 'guessing' | 'result' | 'finished';
export type ChallengeMode = 'off' | 'light' | 'random';
export type DescriptionRevealMode = 'sequential' | 'all_submitted';
export type GuessingReason = 'elimination' | 'buzzer';
export type BuzzerStatus = 'idle' | 'guessing' | 'success' | 'failed';

export interface ChallengeRule {
  id: string;
  text: string;
}

export const LIGHT_CHALLENGE_RULES: readonly ChallengeRule[] = [
  { id: 'max-8', text: '最多 8 个字' },
  { id: 'scene', text: '只能描述使用场景' },
  { id: 'appearance', text: '只能描述外观或感受' },
  { id: 'free', text: '本轮自由表达' },
];

export const RANDOM_CHALLENGE_RULES: readonly ChallengeRule[] = [
  { id: 'max-3', text: '最多 3 个字' },
  { id: 'exact-7', text: '恰好 7 个字' },
  { id: 'exact-8', text: '恰好 8 个字' },
  { id: 'scene', text: '只能描述使用场景' },
  { id: 'appearance', text: '只能描述外观或感受' },
  { id: 'metaphor', text: '必须使用一个比喻' },
  { id: 'question', text: '必须使用问句' },
  { id: 'experience', text: '用一句个人经历表达' },
  { id: 'free', text: '本轮自由表达' },
];

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const ROUND_CONTENT_MAX_LENGTH = 80;
export const DISCUSSION_DURATION_MS = 120_000;
export const COMEBACK_DURATION_MS = 20_000;
export const AUTO_ADVANCE_DELAY_MS = 10_000;
export const AUTO_VOTING_DELAY_MS = 5_000;
export const PLAYER_LIMIT_OPTIONS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => MIN_PLAYERS + index);
export const BLANK_CARD_OPTIONS = [0, 1] as const;

export function undercoverOptions(playerLimit: number): number[] {
  return playerLimit >= 5 ? [1, 2] : [1];
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  cardReady: boolean;
  away?: boolean;
}

export interface Assignment {
  role: Role;
  word: string;
}

export interface VoteRecord {
  voterId: string;
  candidateId: string;
}

export interface RoundResult {
  round: number;
  ballot: number;
  counts: Record<string, number>;
  tiedIds: string[];
  eliminatedId: string | null;
  noElimination: boolean;
}

export interface ComebackResult {
  playerId: string;
  round: number;
  guess: string;
  correct: boolean;
  timedOut: boolean;
  reason?: GuessingReason;
}

export interface GameRoom {
  code: string;
  ownerId: string;
  status: GameStatus;
  playerLimit: number;
  undercoverCount: number;
  blankCardCount?: number;
  civilianAccuseEnabled?: boolean;
  civilianAccuseUsedBy?: string | null;
  lastCivilianAccuseResult?: { accuserId: string; targetId: string; correct: boolean; eliminatedId: string; round: number } | null;
  civilianWord: string;
  undercoverWord: string;
  recentWordPairKeys?: string[];
  challengeMode: ChallengeMode;
  descriptionRevealMode?: DescriptionRevealMode;
  descriptionOrder?: string[];
  descriptionTurnPlayerId?: string | null;
  descriptionsRevealedAt?: number | null;
  votingOpensAt?: number | null;
  skippedDescriptionPlayerIds?: string[];
  roundChallenges?: Record<string, string>;
  undercoverComebackEnabled: boolean;
  undercoverComebackUsed: boolean;
  pendingComebackPlayerId?: string | null;
  comebackDeadlineAt?: number | null;
  lastComebackResult?: ComebackResult | null;
  pendingGuessingReason?: GuessingReason | null;
  buzzerEnabled?: boolean;
  buzzerUsedBy?: string | null;
  buzzerStatus?: BuzzerStatus;
  pausedStatus?: 'discussion' | 'voting' | null;
  players: Player[];
  assignments: Record<string, Assignment>;
  round: number;
  ballot: number;
  runoffCandidateIds: string[];
  votes: Record<string, string>;
  history: RoundResult[];
  roundContents?: Record<string, Record<string, string>>;
  discussionDeadlineAt?: number | null;
  autoAdvanceEnabled?: boolean;
  autoAdvanceDelaySeconds?: number;
  nextRoundAt?: number | null;
  autoAdvancePaused?: boolean;
  lastResult: RoundResult | null;
  winner: Winner;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type RandomSource = () => number;

export function challengeModeLabel(mode: ChallengeMode): string {
  if (mode === 'light') return '轻度';
  if (mode === 'random') return '随机';
  return '关闭';
}

export function descriptionModeLabel(mode: DescriptionRevealMode): string {
  return mode === 'sequential' ? '按座位顺序公开' : '全部提交后公开';
}

export function selectChallengeRule(mode: ChallengeMode, previousId?: string | null, random: RandomSource = Math.random): ChallengeRule | null {
  if (mode === 'off') return null;
  const pool = mode === 'light' ? LIGHT_CHALLENGE_RULES : RANDOM_CHALLENGE_RULES;
  const candidates = pool.length > 1 ? pool.filter((rule) => rule.id !== previousId) : pool;
  return candidates[Math.floor(random() * candidates.length)] ?? null;
}

export function getRoundChallenge(room: Pick<GameRoom, 'challengeMode' | 'roundChallenges'>, round: number): ChallengeRule | null {
  if ((room.challengeMode ?? 'off') === 'off') return null;
  const id = room.roundChallenges?.[String(round)];
  if (!id) return null;
  return [...LIGHT_CHALLENGE_RULES, ...RANDOM_CHALLENGE_RULES].find((rule) => rule.id === id) ?? null;
}

export function makeId(prefix = 'p'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

export function makeRoomCode(random: RandomSource = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(random() * chars.length)]).join('');
}

export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function assignCards(
  players: readonly Player[],
  undercoverCount: number,
  civilianWord: string,
  undercoverWord: string,
  blankCardCountOrRandom: number | RandomSource = 0,
  maybeRandom: RandomSource = Math.random,
): Record<string, Assignment> {
  if (players.length < 3) throw new Error('至少需要 3 名玩家');
  const blankCardCount = typeof blankCardCountOrRandom === 'function' ? 0 : blankCardCountOrRandom;
  const random = typeof blankCardCountOrRandom === 'function' ? blankCardCountOrRandom : maybeRandom;
  validateRoleCounts(players.length, undercoverCount, blankCardCount);
  const shuffledIds = shuffle(players.map((player) => player.id), random);
  const undercoverIds = new Set(shuffledIds.slice(0, undercoverCount));
  const blankIds = new Set(shuffledIds.slice(undercoverCount, undercoverCount + blankCardCount));
  return Object.fromEntries(players.map((player) => [
    player.id,
    blankIds.has(player.id)
      ? { role: 'blank' as const, word: '' }
      : undercoverIds.has(player.id)
      ? { role: 'undercover' as const, word: undercoverWord }
      : { role: 'civilian' as const, word: civilianWord },
  ]));
}

export function validateRoleCounts(playerLimit: number, undercoverCount: number, blankCardCount = 0): void {
  if (!Number.isInteger(undercoverCount) || undercoverCount < 1 || undercoverCount > 2) throw new Error('卧底人数不合法');
  if (!Number.isInteger(blankCardCount) || blankCardCount < 0 || blankCardCount > 1) throw new Error('空白牌人数不合法');
  const special = undercoverCount + blankCardCount;
  if (special >= playerLimit - special) throw new Error('卧底人数不合法：特殊阵营人数必须少于平民人数');
}

export function eligibleVoters(room: GameRoom): Player[] {
  return room.players.filter((player) => player.alive && !player.away);
}

export function eligibleCandidates(room: GameRoom): Player[] {
  const alive = eligibleVoters(room);
  if (room.ballot === 2) {
    const runoff = new Set(room.runoffCandidateIds);
    return alive.filter((player) => runoff.has(player.id));
  }
  return alive;
}

export function countVotes(votes: Record<string, string>): Record<string, number> {
  return Object.values(votes).reduce<Record<string, number>>((counts, candidateId) => {
    counts[candidateId] = (counts[candidateId] ?? 0) + 1;
    return counts;
  }, {});
}

export function resolveBallot(room: GameRoom): RoundResult {
  const livingIds = new Set(eligibleVoters(room).map((player) => player.id));
  const validCandidates = new Set(eligibleCandidates(room).map((player) => player.id));
  const submittedVoters = Object.keys(room.votes);
  if (submittedVoters.length !== livingIds.size || submittedVoters.some((id) => !livingIds.has(id))) {
    throw new Error('仍有存活玩家未投票');
  }
  if (Object.entries(room.votes).some(([voterId, candidateId]) => voterId === candidateId || !validCandidates.has(candidateId))) {
    throw new Error('存在无效投票');
  }

  const counts = countVotes(room.votes);
  const highest = Math.max(...Object.values(counts));
  const tiedIds = Object.entries(counts)
    .filter(([, count]) => count === highest)
    .map(([candidateId]) => candidateId)
    .sort();
  const isTie = tiedIds.length > 1;

  return {
    round: room.round,
    ballot: room.ballot,
    counts,
    tiedIds: isTie ? tiedIds : [],
    eliminatedId: isTie ? null : tiedIds[0],
    noElimination: isTie && room.ballot === 2,
  };
}

export function determineWinner(room: Pick<GameRoom, 'players' | 'assignments'>): Winner {
  let civilians = 0;
  let undercovers = 0;
  for (const player of room.players) {
    if (!player.alive) continue;
    if (room.assignments[player.id]?.role === 'undercover' || room.assignments[player.id]?.role === 'blank') undercovers += 1;
    else civilians += 1;
  }
  if (undercovers === 0) return 'civilian';
  if (undercovers >= civilians) return 'undercover';
  return null;
}

export function getRoundContents(room: GameRoom, round = room.round): Record<string, string> {
  return room.roundContents?.[String(round)] ?? {};
}

export function descriptionOrder(room: GameRoom): string[] {
  const livingIds = new Set(eligibleVoters(room).map((player) => player.id));
  const stored = (room.descriptionOrder ?? []).filter((id) => livingIds.has(id));
  return stored.length ? stored : eligibleVoters(room).sort((a, b) => a.seat - b.seat).map((player) => player.id);
}

export function descriptionCompleteForPlayer(room: GameRoom, playerId: string): boolean {
  return Boolean(getRoundContents(room)[playerId]?.trim()) || (room.skippedDescriptionPlayerIds ?? []).includes(playerId);
}

export function getDescriptionTurnPlayer(room: GameRoom): Player | null {
  if ((room.descriptionRevealMode ?? 'all_submitted') !== 'sequential' || room.status !== 'discussion') return null;
  const nextId = room.descriptionTurnPlayerId ?? descriptionOrder(room).find((id) => !descriptionCompleteForPlayer(room, id));
  return room.players.find((player) => player.id === nextId && player.alive && !player.away) ?? null;
}

export function descriptionsAreRevealed(room: GameRoom, now = Date.now()): boolean {
  if (room.descriptionsRevealedAt) return true;
  if ((room.descriptionRevealMode ?? 'all_submitted') === 'sequential') return discussionComplete(room);
  return Boolean(room.discussionDeadlineAt && now >= room.discussionDeadlineAt);
}

export function isRoundContentVisible(room: GameRoom, playerId: string, viewerId?: string | null, now = Date.now()): boolean {
  if ((room.descriptionRevealMode ?? 'all_submitted') === 'sequential') return Boolean(getRoundContents(room)[playerId]);
  return descriptionsAreRevealed(room, now) || playerId === viewerId;
}

export function discussionComplete(room: GameRoom): boolean {
  return eligibleVoters(room).every((player) => descriptionCompleteForPlayer(room, player.id));
}

export function canBeginVoting(room: GameRoom, now = Date.now()): boolean {
  if (room.status !== 'discussion') return false;
  if (eligibleVoters(room).length < 2) return false;
  return descriptionsAreRevealed(room, now) && (discussionComplete(room) || !room.discussionDeadlineAt || now >= room.discussionDeadlineAt);
}

export function getVotingOpensAt(room: GameRoom): number | null {
  return room.votingOpensAt ?? (room.descriptionsRevealedAt ? room.descriptionsRevealedAt + AUTO_VOTING_DELAY_MS : null);
}

export function autoVotingDue(room: GameRoom, now = Date.now()): boolean {
  const opensAt = getVotingOpensAt(room);
  return room.status === 'discussion' && canBeginVoting(room, now) && Boolean(opensAt && now >= opensAt);
}

export function startDiscussion(room: GameRoom, now = Date.now(), random: RandomSource = Math.random): GameRoom {
  const roundKey = String(room.round);
  const previousId = room.roundChallenges?.[String(room.round - 1)] ?? null;
  const selectedRule = room.roundChallenges?.[roundKey]
    ? null
    : selectChallengeRule(room.challengeMode ?? 'off', previousId, random);
  const order = eligibleVoters(room).sort((a, b) => a.seat - b.seat).map((player) => player.id);
  return {
    ...room,
    status: 'discussion',
    roundContents: { ...(room.roundContents ?? {}), [roundKey]: getRoundContents(room) },
    roundChallenges: selectedRule
      ? { ...(room.roundChallenges ?? {}), [roundKey]: selectedRule.id }
      : (room.roundChallenges ?? {}),
    discussionDeadlineAt: order.length >= 2 ? now + DISCUSSION_DURATION_MS : null,
    descriptionOrder: order,
    descriptionTurnPlayerId: (room.descriptionRevealMode ?? 'all_submitted') === 'sequential' ? order[0] ?? null : null,
    descriptionsRevealedAt: null,
    votingOpensAt: null,
    skippedDescriptionPlayerIds: [],
    nextRoundAt: null,
    autoAdvancePaused: false,
    version: room.version + 1,
    updatedAt: now,
  };
}

function finalizeBallotResult(room: GameRoom, result: RoundResult, now: number): GameRoom {
  const players = result.eliminatedId
    ? room.players.map((player) => player.id === result.eliminatedId ? { ...player, alive: false, away: false } : player)
    : room.players;
  const winner = determineWinner({ players, assignments: room.assignments });
  const autoAdvanceEnabled = room.autoAdvanceEnabled ?? true;
  return {
    ...room,
    players,
    winner,
    status: winner ? 'finished' : 'result',
    nextRoundAt: !winner && autoAdvanceEnabled ? now + (room.autoAdvanceDelaySeconds ?? 10) * 1000 : null,
    autoAdvancePaused: false,
    votes: {},
    runoffCandidateIds: [],
    pendingComebackPlayerId: null,
    comebackDeadlineAt: null,
    lastResult: result,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function submitRoundContent(room: GameRoom, playerId: string, content: string, now = Date.now()): GameRoom {
  if (room.status !== 'discussion') throw new Error('当前不能提交本轮内容');
  if (!eligibleVoters(room).some((player) => player.id === playerId)) throw new Error('当前成员不能提交本轮内容');
  const normalized = content.trim();
  if (!normalized) throw new Error('请填写本轮内容');
  if (normalized.length > ROUND_CONTENT_MAX_LENGTH) throw new Error(`本轮内容不能超过 ${ROUND_CONTENT_MAX_LENGTH} 字`);
  const roundKey = String(room.round);
  const current = getRoundContents(room);
  if (current[playerId]) throw new Error('本轮内容已经提交');
  const mode = room.descriptionRevealMode ?? 'all_submitted';
  if (mode === 'sequential' && getDescriptionTurnPlayer(room)?.id !== playerId) throw new Error('还没有轮到当前成员');
  const nextContents = { ...current, [playerId]: normalized };
  const completedIds = new Set([...Object.keys(nextContents), ...(room.skippedDescriptionPlayerIds ?? [])]);
  const nextTurnId = mode === 'sequential' ? descriptionOrder(room).find((id) => !completedIds.has(id)) ?? null : null;
  const allComplete = eligibleVoters(room).every((player) => completedIds.has(player.id));
  return {
    ...room,
    roundContents: { ...(room.roundContents ?? {}), [roundKey]: nextContents },
    descriptionTurnPlayerId: nextTurnId,
    descriptionsRevealedAt: allComplete ? now : room.descriptionsRevealedAt ?? null,
    votingOpensAt: allComplete ? now + AUTO_VOTING_DELAY_MS : room.votingOpensAt ?? null,
    discussionDeadlineAt: allComplete ? null : mode === 'sequential' ? now + DISCUSSION_DURATION_MS : room.discussionDeadlineAt,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function revealDescriptions(room: GameRoom, now = Date.now()): GameRoom {
  if (room.status !== 'discussion') return room;
  if (room.descriptionsRevealedAt) return room;
  const timedOut = Boolean(room.discussionDeadlineAt && now >= room.discussionDeadlineAt);
  if ((room.descriptionRevealMode ?? 'all_submitted') === 'sequential' && !discussionComplete(room)) {
    throw new Error('顺序描述应逐人跳过，不能一次结束全员倒计时');
  }
  if (!discussionComplete(room) && !timedOut) throw new Error('本轮描述尚未完成');
  const skipped = timedOut
    ? eligibleVoters(room).filter((player) => !getRoundContents(room)[player.id]).map((player) => player.id)
    : (room.skippedDescriptionPlayerIds ?? []);
  return {
    ...room,
    skippedDescriptionPlayerIds: Array.from(new Set([...(room.skippedDescriptionPlayerIds ?? []), ...skipped])),
    descriptionTurnPlayerId: null,
    descriptionsRevealedAt: now,
    votingOpensAt: now + AUTO_VOTING_DELAY_MS,
    discussionDeadlineAt: null,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function skipDescription(room: GameRoom, playerId: string, now = Date.now()): GameRoom {
  if (room.status !== 'discussion' || (room.descriptionRevealMode ?? 'all_submitted') !== 'sequential') throw new Error('当前不能跳过描述');
  if (getDescriptionTurnPlayer(room)?.id !== playerId) throw new Error('只能跳过当前轮到的成员');
  const skipped = [...(room.skippedDescriptionPlayerIds ?? []), playerId];
  const completedIds = new Set([...Object.keys(getRoundContents(room)), ...skipped]);
  const nextTurnId = descriptionOrder(room).find((id) => !completedIds.has(id)) ?? null;
  const allComplete = eligibleVoters(room).every((player) => completedIds.has(player.id));
  return {
    ...room,
    skippedDescriptionPlayerIds: skipped,
    descriptionTurnPlayerId: nextTurnId,
    descriptionsRevealedAt: allComplete ? now : room.descriptionsRevealedAt ?? null,
    votingOpensAt: allComplete ? now + AUTO_VOTING_DELAY_MS : room.votingOpensAt ?? null,
    discussionDeadlineAt: allComplete ? null : now + DISCUSSION_DURATION_MS,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function startVoting(room: GameRoom, now = Date.now()): GameRoom {
  if (room.status === 'voting') return room;
  if (!canBeginVoting(room, now)) throw new Error('本轮描述尚未公开');
  const revealedRoom = room.descriptionsRevealedAt ? room : revealDescriptions(room, now);
  return {
    ...revealedRoom,
    status: 'voting',
    ballot: 1,
    votes: {},
    runoffCandidateIds: [],
    discussionDeadlineAt: null,
    votingOpensAt: null,
    version: revealedRoom.version + 1,
    updatedAt: now,
  };
}

export function applyBallotResult(room: GameRoom, result: RoundResult, now = Date.now()): GameRoom {
  if (result.tiedIds.length > 1 && result.ballot === 1) {
    return {
      ...room,
      status: 'voting',
      ballot: 2,
      runoffCandidateIds: result.tiedIds,
      votes: {},
      lastResult: result,
      history: [...room.history, result],
      version: room.version + 1,
      updatedAt: now,
    };
  }

  const withHistory = { ...room, history: [...room.history, result] };
  const eligibleForComeback = Boolean(
    result.eliminatedId
    && (room.assignments[result.eliminatedId]?.role === 'undercover' || room.assignments[result.eliminatedId]?.role === 'blank')
    && room.undercoverComebackEnabled
    && !room.undercoverComebackUsed,
  );
  if (eligibleForComeback) {
    return {
      ...withHistory,
      status: 'guessing',
      votes: {},
      runoffCandidateIds: [],
      pendingComebackPlayerId: result.eliminatedId,
      comebackDeadlineAt: now + COMEBACK_DURATION_MS,
      undercoverComebackUsed: true,
      pendingGuessingReason: 'elimination',
      lastResult: result,
      version: room.version + 1,
      updatedAt: now,
    };
  }
  return finalizeBallotResult(withHistory, result, now);
}

function normalizeGuess(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function canTriggerBuzzer(room: GameRoom, playerId: string, now = Date.now()): boolean {
  return Boolean(
    room.buzzerEnabled
    && !room.buzzerUsedBy
    && !room.undercoverComebackUsed
    && (room.status === 'discussion' || room.status === 'voting')
    && descriptionsAreRevealed(room, now)
    && room.players.some((player) => player.id === playerId && player.alive && !player.away),
  );
}

export function triggerBuzzer(room: GameRoom, playerId: string, now = Date.now()): GameRoom {
  if (!canTriggerBuzzer(room, playerId, now)) throw new Error('当前不能爆灯');
  return {
    ...room,
    status: 'guessing',
    buzzerUsedBy: playerId,
    buzzerStatus: 'guessing',
    pausedStatus: room.status as 'discussion' | 'voting',
    pendingGuessingReason: 'buzzer',
    pendingComebackPlayerId: playerId,
    comebackDeadlineAt: now + COMEBACK_DURATION_MS,
    lastComebackResult: null,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function resolveUndercoverComeback(room: GameRoom, playerId: string, guess: string, now = Date.now()): GameRoom {
  const reason = room.pendingGuessingReason ?? 'elimination';
  if (room.status !== 'guessing' || room.pendingComebackPlayerId !== playerId || (reason === 'elimination' && !room.lastResult)) throw new Error('当前没有可提交的翻盘机会');
  const timedOut = !room.comebackDeadlineAt || now >= room.comebackDeadlineAt;
  const normalizedGuess = normalizeGuess(guess);
  if (!timedOut && !normalizedGuess) throw new Error('请填写另一组词语');
  const correct = !timedOut && normalizedGuess === normalizeGuess(room.civilianWord);
  const isUndercover = room.assignments[playerId]?.role === 'undercover' || room.assignments[playerId]?.role === 'blank';
  const validBuzzerWin = reason === 'buzzer' ? correct && isUndercover : correct;
  const lastComebackResult: ComebackResult = { playerId, round: room.round, guess: guess.trim(), correct: validBuzzerWin, timedOut, reason };
  if (validBuzzerWin) {
    return {
      ...room,
      status: 'finished',
      winner: 'undercover',
      buzzerStatus: reason === 'buzzer' ? 'success' : room.buzzerStatus,
      undercoverComebackUsed: true,
      pendingComebackPlayerId: null,
      comebackDeadlineAt: null,
      pendingGuessingReason: null,
      lastComebackResult,
      version: room.version + 1,
      updatedAt: now,
    };
  }
  if (reason === 'buzzer') {
    const players = room.players.map((player) => player.id === playerId ? { ...player, alive: false, away: false } : player);
    const winner = determineWinner({ players, assignments: room.assignments });
    const pausedStatus = room.pausedStatus ?? 'discussion';
    const survivingIds = new Set(players.filter((player) => player.alive).map((player) => player.id));
    const roundContents = getRoundContents(room);
    const currentTurnWasBomber = room.descriptionTurnPlayerId === playerId;
    const skipped = currentTurnWasBomber ? [...(room.skippedDescriptionPlayerIds ?? []), playerId] : (room.skippedDescriptionPlayerIds ?? []);
    const completedIds = new Set([...Object.keys(roundContents), ...skipped]);
    const nextTurnId = pausedStatus === 'discussion' && (room.descriptionRevealMode ?? 'all_submitted') === 'sequential'
      ? descriptionOrder({ ...room, players }).find((id) => !completedIds.has(id)) ?? null
      : room.descriptionTurnPlayerId ?? null;
    return {
      ...room,
      players,
      status: winner ? 'finished' : pausedStatus,
      winner,
      votes: pausedStatus === 'voting' ? {} : room.votes,
      ballot: pausedStatus === 'voting' ? 1 : room.ballot,
      runoffCandidateIds: pausedStatus === 'voting' ? [] : room.runoffCandidateIds.filter((id) => survivingIds.has(id)),
      skippedDescriptionPlayerIds: skipped,
      descriptionTurnPlayerId: nextTurnId,
      buzzerStatus: 'failed',
      undercoverComebackUsed: room.undercoverComebackUsed || isUndercover,
      pendingComebackPlayerId: null,
      comebackDeadlineAt: null,
      pendingGuessingReason: null,
      pausedStatus: null,
      lastComebackResult,
      version: room.version + 1,
      updatedAt: now,
    };
  }
  return finalizeBallotResult({ ...room, lastComebackResult }, room.lastResult!, now);
}

export function startNextRound(room: GameRoom, now = Date.now(), random: RandomSource = Math.random): GameRoom {
  if (room.winner || room.status !== 'result') return room;
  const nextRound = room.round + 1;
  return startDiscussion({
    ...room,
    round: nextRound,
    ballot: 1,
    runoffCandidateIds: [],
    votes: {},
    roundContents: { ...(room.roundContents ?? {}), [String(nextRound)]: {} },
    discussionDeadlineAt: null,
    lastResult: null,
    lastComebackResult: null,
    civilianAccuseUsedBy: null,
    lastCivilianAccuseResult: null,
    nextRoundAt: null,
    autoAdvancePaused: false,
    version: room.version,
    updatedAt: now,
  }, now, random);
}

export function autoAdvanceDue(room: GameRoom, now = Date.now()): boolean {
  return room.status === 'result'
    && (room.autoAdvanceEnabled ?? true)
    && !room.autoAdvancePaused
    && Boolean(room.nextRoundAt && now >= room.nextRoundAt);
}

export function setAutoAdvancePaused(room: GameRoom, paused: boolean, now = Date.now()): GameRoom {
  if (room.status !== 'result' || !(room.autoAdvanceEnabled ?? true)) return room;
  return {
    ...room,
    autoAdvancePaused: paused,
    nextRoundAt: paused ? null : now + (room.autoAdvanceDelaySeconds ?? 10) * 1000,
    version: room.version + 1,
    updatedAt: now,
  };
}

function refreshDiscussionAfterPresenceChange(room: GameRoom, now: number): GameRoom {
  if (room.status !== 'discussion' || room.descriptionsRevealedAt) return room;
  const active = eligibleVoters(room).sort((a, b) => a.seat - b.seat);
  const order = active.map((player) => player.id);
  if (active.length < 2) {
    return { ...room, descriptionOrder: order, descriptionTurnPlayerId: null, discussionDeadlineAt: null };
  }
  const complete = active.every((player) => descriptionCompleteForPlayer(room, player.id));
  if (complete) {
    return {
      ...room,
      descriptionOrder: order,
      descriptionTurnPlayerId: null,
      descriptionsRevealedAt: now,
      votingOpensAt: now + AUTO_VOTING_DELAY_MS,
      discussionDeadlineAt: null,
    };
  }
  if ((room.descriptionRevealMode ?? 'all_submitted') !== 'sequential') {
    return { ...room, descriptionOrder: order, discussionDeadlineAt: room.discussionDeadlineAt ?? now + DISCUSSION_DURATION_MS };
  }
  const currentStillValid = room.descriptionTurnPlayerId
    && order.includes(room.descriptionTurnPlayerId)
    && !descriptionCompleteForPlayer(room, room.descriptionTurnPlayerId);
  const nextTurnPlayerId = currentStillValid
    ? room.descriptionTurnPlayerId
    : order.find((id) => !descriptionCompleteForPlayer(room, id)) ?? null;
  return {
    ...room,
    descriptionOrder: order,
    descriptionTurnPlayerId: nextTurnPlayerId,
    discussionDeadlineAt: currentStillValid ? room.discussionDeadlineAt ?? now + DISCUSSION_DURATION_MS : now + DISCUSSION_DURATION_MS,
  };
}

/** 暂退只移出当前描述和投票名单，不改变存活身份，也不参与胜负判定。 */
export function setPlayerAway(room: GameRoom, playerId: string, away: boolean, now = Date.now()): GameRoom {
  if (room.status === 'finished') return room;
  const target = room.players.find((player) => player.id === playerId);
  if (!target?.alive) throw new Error('已退出玩家不能切换暂退状态');
  if (Boolean(target.away) === away) return room;
  let next: GameRoom = {
    ...room,
    players: room.players.map((player) => player.id === playerId ? { ...player, away, cardReady: away && room.status === 'cards' ? true : player.cardReady } : player),
    votes: room.status === 'voting' ? {} : room.votes,
    ballot: room.status === 'voting' ? 1 : room.ballot,
    runoffCandidateIds: room.status === 'voting' ? [] : room.runoffCandidateIds,
    version: room.version + 1,
    updatedAt: now,
  };
  if (next.status === 'cards') {
    const active = eligibleVoters(next);
    if (active.length >= MIN_PLAYERS && active.every((player) => player.cardReady)) return startDiscussion(next, now);
  }
  next = refreshDiscussionAfterPresenceChange(next, now);
  return next;
}

/** 永久退出等同淘汰；若因此触发胜负，立即结束本局。 */
export function exitPlayer(room: GameRoom, playerId: string, now = Date.now()): GameRoom {
  if (room.status === 'finished') return room;
  const target = room.players.find((player) => player.id === playerId);
  if (!target?.alive) return room;
  if (room.status === 'lobby') {
    const players = room.players.filter((player) => player.id !== playerId).map((player, index) => ({ ...player, seat: index + 1 }));
    return {
      ...room,
      players,
      ownerId: room.ownerId === playerId ? players[0]?.id ?? room.ownerId : room.ownerId,
      version: room.version + 1,
      updatedAt: now,
    };
  }

  const players = room.players.map((player) => player.id === playerId ? { ...player, alive: false, away: false, cardReady: true } : player);
  const ownerId = room.ownerId === playerId ? players.find((player) => player.alive)?.id ?? room.ownerId : room.ownerId;
  const winner = Object.keys(room.assignments).length ? determineWinner({ players, assignments: room.assignments }) : null;
  const exitingPendingGuesser = room.status === 'guessing' && room.pendingComebackPlayerId === playerId;
  const resumedStatus = exitingPendingGuesser ? (room.pausedStatus ?? 'result') : room.status;
  const exitResult: RoundResult = {
    round: room.round,
    ballot: room.ballot,
    counts: {},
    tiedIds: [],
    eliminatedId: playerId,
    noElimination: false,
  };
  let next: GameRoom = {
    ...room,
    players,
    ownerId,
    winner,
    status: winner ? 'finished' : resumedStatus,
    votes: room.status === 'voting' ? {} : Object.fromEntries(Object.entries(room.votes).filter(([voterId, candidateId]) => voterId !== playerId && candidateId !== playerId)),
    ballot: room.status === 'voting' ? 1 : room.ballot,
    runoffCandidateIds: room.status === 'voting' ? [] : room.runoffCandidateIds.filter((id) => id !== playerId),
    pendingComebackPlayerId: room.pendingComebackPlayerId === playerId ? null : room.pendingComebackPlayerId,
    comebackDeadlineAt: room.pendingComebackPlayerId === playerId ? null : room.comebackDeadlineAt,
    pendingGuessingReason: room.pendingComebackPlayerId === playerId ? null : room.pendingGuessingReason,
    pausedStatus: room.pendingComebackPlayerId === playerId ? null : room.pausedStatus,
    lastResult: winner ? exitResult : room.lastResult,
    history: winner ? [...room.history, exitResult] : room.history,
    nextRoundAt: winner ? null : exitingPendingGuesser && resumedStatus === 'result' && (room.autoAdvanceEnabled ?? true)
      ? now + (room.autoAdvanceDelaySeconds ?? 10) * 1000
      : room.nextRoundAt,
    version: room.version + 1,
    updatedAt: now,
  };
  if (!winner && next.status === 'cards') {
    const active = eligibleVoters(next);
    if (active.length >= MIN_PLAYERS && active.every((player) => player.cardReady)) return startDiscussion(next, now);
  }
  next = refreshDiscussionAfterPresenceChange(next, now);
  return next;
}

export function createRoom(input: {
  code?: string;
  ownerId: string;
  ownerName: string;
  playerLimit: number;
  undercoverCount: number;
  blankCardCount?: number;
  civilianAccuseEnabled?: boolean;
  civilianWord: string;
  undercoverWord: string;
  challengeMode?: ChallengeMode;
  undercoverComebackEnabled?: boolean;
  descriptionRevealMode?: DescriptionRevealMode;
  buzzerEnabled?: boolean;
  autoAdvanceEnabled?: boolean;
}): GameRoom {
  if (!Number.isInteger(input.playerLimit) || input.playerLimit < MIN_PLAYERS || input.playerLimit > MAX_PLAYERS) {
    throw new Error(`玩家人数必须为 ${MIN_PLAYERS}–${MAX_PLAYERS} 人`);
  }
  validateRoleCounts(input.playerLimit, input.undercoverCount, input.blankCardCount ?? 0);
  const now = Date.now();
  return {
    code: input.code ?? makeRoomCode(),
    ownerId: input.ownerId,
    status: 'lobby',
    playerLimit: input.playerLimit,
    undercoverCount: input.undercoverCount,
    blankCardCount: input.blankCardCount ?? 0,
    civilianAccuseEnabled: input.civilianAccuseEnabled ?? false,
    civilianAccuseUsedBy: null,
    lastCivilianAccuseResult: null,
    civilianWord: input.civilianWord.trim(),
    undercoverWord: input.undercoverWord.trim(),
    challengeMode: input.challengeMode ?? 'off',
    descriptionRevealMode: input.descriptionRevealMode ?? 'all_submitted',
    descriptionOrder: [],
    descriptionTurnPlayerId: null,
    descriptionsRevealedAt: null,
    votingOpensAt: null,
    skippedDescriptionPlayerIds: [],
    roundChallenges: {},
    undercoverComebackEnabled: input.undercoverComebackEnabled ?? false,
    undercoverComebackUsed: false,
    pendingComebackPlayerId: null,
    comebackDeadlineAt: null,
    lastComebackResult: null,
    pendingGuessingReason: null,
    buzzerEnabled: input.buzzerEnabled ?? false,
    buzzerUsedBy: null,
    buzzerStatus: 'idle',
    pausedStatus: null,
    players: [{ id: input.ownerId, name: input.ownerName.trim(), seat: 1, alive: true, cardReady: false, away: false }],
    assignments: {},
    round: 1,
    ballot: 1,
    runoffCandidateIds: [],
    votes: {},
    history: [],
    roundContents: {},
    discussionDeadlineAt: null,
    autoAdvanceEnabled: input.autoAdvanceEnabled ?? true,
    autoAdvanceDelaySeconds: AUTO_ADVANCE_DELAY_MS / 1000,
    nextRoundAt: null,
    autoAdvancePaused: false,
    lastResult: null,
    winner: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function dealRoom(room: GameRoom, random: RandomSource = Math.random): GameRoom {
  if (room.players.length !== room.playerLimit) throw new Error('玩家尚未到齐');
  const assignments = assignCards(room.players, room.undercoverCount, room.civilianWord, room.undercoverWord, room.blankCardCount ?? 0, random);
  return {
    ...room,
    status: 'cards',
    assignments,
    players: room.players.map((player) => ({ ...player, alive: true, cardReady: false, away: false })),
    round: 1,
    ballot: 1,
    votes: {},
    history: [],
    roundContents: {},
    roundChallenges: {},
    discussionDeadlineAt: null,
    descriptionOrder: [],
    descriptionTurnPlayerId: null,
    descriptionsRevealedAt: null,
    votingOpensAt: null,
    skippedDescriptionPlayerIds: [],
    undercoverComebackUsed: false,
    civilianAccuseUsedBy: null,
    lastCivilianAccuseResult: null,
    pendingComebackPlayerId: null,
    comebackDeadlineAt: null,
    lastComebackResult: null,
    pendingGuessingReason: null,
    buzzerUsedBy: null,
    buzzerStatus: 'idle',
    pausedStatus: null,
    nextRoundAt: null,
    autoAdvancePaused: false,
    lastResult: null,
    winner: null,
    version: room.version + 1,
    updatedAt: Date.now(),
  };
}

export function updateLobbySettings(
  room: GameRoom,
  actorId: string,
  settings: { playerLimit: number; undercoverCount: number; blankCardCount: number; civilianAccuseEnabled?: boolean },
  now = Date.now(),
): GameRoom {
  if (room.status !== 'lobby') throw new Error('只有等待房间可以修改设置');
  if (room.ownerId !== actorId) throw new Error('只有房主可以修改设置');
  if (!Number.isInteger(settings.playerLimit) || settings.playerLimit < MIN_PLAYERS || settings.playerLimit > MAX_PLAYERS) throw new Error(`玩家人数必须为 ${MIN_PLAYERS}–${MAX_PLAYERS} 人`);
  if (settings.playerLimit < room.players.length) throw new Error('总人数不能少于当前已加入人数');
  validateRoleCounts(settings.playerLimit, settings.undercoverCount, settings.blankCardCount);
  return {
    ...room,
    playerLimit: settings.playerLimit,
    undercoverCount: settings.undercoverCount,
    blankCardCount: settings.blankCardCount,
    civilianAccuseEnabled: settings.civilianAccuseEnabled ?? room.civilianAccuseEnabled ?? false,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function accuseUndercover(room: GameRoom, accuserId: string, targetId: string, now = Date.now()): GameRoom {
  if (room.civilianAccuseUsedBy) throw new Error('本局平民爆灯指认机会已经使用');
  if (room.status !== 'voting' || !descriptionsAreRevealed(room, now)) throw new Error('当前不能进行平民爆灯指认');
  if (!room.civilianAccuseEnabled) throw new Error('本局未开启平民爆灯指认');
  const accuser = room.players.find((player) => player.id === accuserId);
  const target = room.players.find((player) => player.id === targetId);
  if (!accuser?.alive || accuser.away) throw new Error('当前玩家不能发起指认');
  if (!target?.alive || target.away || target.id === accuserId) throw new Error('该候选人当前不可指认');
  const accuserRole = room.assignments[accuserId]?.role;
  const targetRole = room.assignments[targetId]?.role;
  const correct = accuserRole === 'civilian' && (targetRole === 'undercover' || targetRole === 'blank');
  const eliminatedId = correct ? targetId : accuserId;
  const players = room.players.map((player) => player.id === eliminatedId ? { ...player, alive: false, away: false } : player);
  const winner = determineWinner({ players, assignments: room.assignments });
  const result = { accuserId, targetId, correct, eliminatedId, round: room.round };
  return {
    ...room,
    players,
    winner,
    status: winner ? 'finished' : 'voting',
    votes: {},
    ballot: 1,
    runoffCandidateIds: [],
    civilianAccuseUsedBy: accuserId,
    lastCivilianAccuseResult: result,
    lastResult: winner ? { round: room.round, ballot: room.ballot, counts: {}, tiedIds: [], eliminatedId, noElimination: false } : room.lastResult,
    version: room.version + 1,
    updatedAt: now,
  };
}
