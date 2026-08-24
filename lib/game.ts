export type Role = 'civilian' | 'undercover';
export type Winner = Role | null;
export type GameStatus = 'lobby' | 'cards' | 'discussion' | 'voting' | 'result' | 'finished';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const ROUND_CONTENT_MAX_LENGTH = 80;
export const DISCUSSION_DURATION_MS = 120_000;
export const PLAYER_LIMIT_OPTIONS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => MIN_PLAYERS + index);

export function undercoverOptions(playerLimit: number): number[] {
  return playerLimit >= 5 ? [1, 2] : [1];
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  cardReady: boolean;
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

export interface GameRoom {
  code: string;
  ownerId: string;
  status: GameStatus;
  playerLimit: number;
  undercoverCount: number;
  civilianWord: string;
  undercoverWord: string;
  players: Player[];
  assignments: Record<string, Assignment>;
  round: number;
  ballot: number;
  runoffCandidateIds: string[];
  votes: Record<string, string>;
  history: RoundResult[];
  roundContents?: Record<string, Record<string, string>>;
  discussionDeadlineAt?: number | null;
  lastResult: RoundResult | null;
  winner: Winner;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type RandomSource = () => number;

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
  random: RandomSource = Math.random,
): Record<string, Assignment> {
  if (players.length < 3) throw new Error('至少需要 3 名玩家');
  if (undercoverCount < 1 || undercoverCount * 2 >= players.length) throw new Error('卧底人数不合法');
  const undercoverIds = new Set(shuffle(players.map((player) => player.id), random).slice(0, undercoverCount));
  return Object.fromEntries(players.map((player) => [
    player.id,
    undercoverIds.has(player.id)
      ? { role: 'undercover' as const, word: undercoverWord }
      : { role: 'civilian' as const, word: civilianWord },
  ]));
}

export function eligibleVoters(room: GameRoom): Player[] {
  return room.players.filter((player) => player.alive);
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
    if (room.assignments[player.id]?.role === 'undercover') undercovers += 1;
    else civilians += 1;
  }
  if (undercovers === 0) return 'civilian';
  if (undercovers >= civilians) return 'undercover';
  return null;
}

export function getRoundContents(room: GameRoom, round = room.round): Record<string, string> {
  return room.roundContents?.[String(round)] ?? {};
}

export function discussionComplete(room: GameRoom): boolean {
  const contents = getRoundContents(room);
  return eligibleVoters(room).every((player) => Boolean(contents[player.id]?.trim()));
}

export function canBeginVoting(room: GameRoom, now = Date.now()): boolean {
  if (room.status !== 'discussion') return false;
  return discussionComplete(room) || !room.discussionDeadlineAt || now >= room.discussionDeadlineAt;
}

export function startDiscussion(room: GameRoom, now = Date.now()): GameRoom {
  const roundKey = String(room.round);
  return {
    ...room,
    status: 'discussion',
    roundContents: { ...(room.roundContents ?? {}), [roundKey]: getRoundContents(room) },
    discussionDeadlineAt: now + DISCUSSION_DURATION_MS,
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
  return {
    ...room,
    roundContents: { ...(room.roundContents ?? {}), [roundKey]: { ...current, [playerId]: normalized } },
    version: room.version + 1,
    updatedAt: now,
  };
}

export function applyBallotResult(room: GameRoom, result: RoundResult): GameRoom {
  const now = Date.now();
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

  const players = result.eliminatedId
    ? room.players.map((player) => player.id === result.eliminatedId ? { ...player, alive: false } : player)
    : room.players;
  const winner = determineWinner({ players, assignments: room.assignments });
  return {
    ...room,
    players,
    winner,
    status: winner ? 'finished' : 'result',
    votes: {},
    runoffCandidateIds: [],
    lastResult: result,
    history: [...room.history, result],
    version: room.version + 1,
    updatedAt: now,
  };
}

export function startNextRound(room: GameRoom, now = Date.now()): GameRoom {
  if (room.winner) return room;
  const nextRound = room.round + 1;
  return {
    ...room,
    status: 'discussion',
    round: nextRound,
    ballot: 1,
    runoffCandidateIds: [],
    votes: {},
    roundContents: { ...(room.roundContents ?? {}), [String(nextRound)]: {} },
    discussionDeadlineAt: now + DISCUSSION_DURATION_MS,
    lastResult: null,
    version: room.version + 1,
    updatedAt: now,
  };
}

export function createRoom(input: {
  code?: string;
  ownerId: string;
  ownerName: string;
  playerLimit: number;
  undercoverCount: number;
  civilianWord: string;
  undercoverWord: string;
}): GameRoom {
  if (!Number.isInteger(input.playerLimit) || input.playerLimit < MIN_PLAYERS || input.playerLimit > MAX_PLAYERS) {
    throw new Error(`玩家人数必须为 ${MIN_PLAYERS}–${MAX_PLAYERS} 人`);
  }
  if (!Number.isInteger(input.undercoverCount) || input.undercoverCount < 1 || input.undercoverCount * 2 >= input.playerLimit) {
    throw new Error('卧底人数不合法');
  }
  const now = Date.now();
  return {
    code: input.code ?? makeRoomCode(),
    ownerId: input.ownerId,
    status: 'lobby',
    playerLimit: input.playerLimit,
    undercoverCount: input.undercoverCount,
    civilianWord: input.civilianWord.trim(),
    undercoverWord: input.undercoverWord.trim(),
    players: [{ id: input.ownerId, name: input.ownerName.trim(), seat: 1, alive: true, cardReady: false }],
    assignments: {},
    round: 1,
    ballot: 1,
    runoffCandidateIds: [],
    votes: {},
    history: [],
    roundContents: {},
    discussionDeadlineAt: null,
    lastResult: null,
    winner: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function dealRoom(room: GameRoom, random: RandomSource = Math.random): GameRoom {
  if (room.players.length !== room.playerLimit) throw new Error('玩家尚未到齐');
  const assignments = assignCards(room.players, room.undercoverCount, room.civilianWord, room.undercoverWord, random);
  return {
    ...room,
    status: 'cards',
    assignments,
    players: room.players.map((player) => ({ ...player, alive: true, cardReady: false })),
    round: 1,
    ballot: 1,
    votes: {},
    history: [],
    roundContents: {},
    discussionDeadlineAt: null,
    lastResult: null,
    winner: null,
    version: room.version + 1,
    updatedAt: Date.now(),
  };
}
