export type Role = 'civilian' | 'undercover';
export type Winner = Role | null;
export type GameStatus = 'lobby' | 'cards' | 'discussion' | 'voting' | 'result' | 'finished';

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
  if (undercoverCount < 1 || undercoverCount >= players.length) throw new Error('卧底人数不合法');
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

export function startNextRound(room: GameRoom): GameRoom {
  if (room.winner) return room;
  return {
    ...room,
    status: 'discussion',
    round: room.round + 1,
    ballot: 1,
    runoffCandidateIds: [],
    votes: {},
    lastResult: null,
    version: room.version + 1,
    updatedAt: Date.now(),
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
    lastResult: null,
    winner: null,
    version: room.version + 1,
    updatedAt: Date.now(),
  };
}
