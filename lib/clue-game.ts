import { makeRoomCode, type Player, type RandomSource } from './game.ts';
import type { ClueDifficulty, ClueMode } from './clue-content.ts';

export type ClueStatus = 'lobby' | 'clue_writing' | 'guessing' | 'rating' | 'result' | 'finished';
export type CluePhaseStatus = 'writing' | 'confirmed' | 'unconfirmed' | 'away';

export interface CluePlayer extends Player { away: boolean; }

export interface PublicClue {
  clueId: string;
  displayCode: string;
  text: string;
  authorId?: string;
  authorName?: string;
  score?: number;
  roleId?: string;
  roleName?: string;
  roleRule?: string;
}

export interface ClueRoundResult {
  round: number;
  guesserId: string;
  guesserName: string;
  targetWord: string;
  guessText: string | null;
  correct: boolean;
  elapsedMs: number | null;
}

export interface CluePrivateRound {
  sessionNo: number;
  round: number;
  targetWord: string | null;
  clueText: string;
  clueConfirmed: boolean;
  challengeId: string | null;
  challengeText: string | null;
  roleId: string | null;
  roleName: string | null;
  roleRule: string | null;
}

export interface ClueKingRoom {
  code: string;
  gameType: 'clue_king';
  clueVersion: 3;
  sessionNo: number;
  ownerId: string;
  players: CluePlayer[];
  playerLimit: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  status: ClueStatus;
  round: number;
  totalRounds: number;
  phaseDeadlineAt: number | null;
  mode: ClueMode;
  difficulty: ClueDifficulty;
  currentDifficulty: Exclude<ClueDifficulty, 'mixed'> | null;
  guesserOrder: string[];
  guesserId: string | null;
  guesserName: string | null;
  challengeId: string | null;
  challengeText: string | null;
  publicRuleId: string | null;
  publicRuleName: string | null;
  publicRuleText: string | null;
  expectedCluePlayerIds: string[];
  clueStatuses: Record<string, CluePhaseStatus>;
  clueConfirmedCount: number;
  publicClues: PublicClue[];
  guessAttemptCount?: number;
  guessStatus: 'waiting' | 'correct' | 'wrong' | 'timeout';
  guessElapsedMs: number | null;
  revealedWord: string | null;
  roundResults: ClueRoundResult[];
  hintScores: Record<string, number>;
  guessTimes: Record<string, number>;
  usedWordIds: string[];
  previousSessionWordIds: string[];
  recentWordIds: string[];
  lastPublicRuleId: string | null;
  lastRoleByPlayer: Record<string, string>;
}

export const CLUE_MIN_PLAYERS = 2;
export const CLUE_MAX_PLAYERS = 8;
export const CLUE_MAX_LENGTH = 16;
export const CLUE_MAX_GUESS_ATTEMPTS = 3;
export const CLUE_DURATIONS = {
  clue_writing: 120_000,
  guessing: 60_000,
  rating: 60_000,
  result: 10_000,
} as const;

function makePlayerId(random: RandomSource) {
  return `p_${Math.floor(random() * 1e12).toString(36)}`;
}

export function createClueRoom(ownerName: string, mode: ClueMode = 'free', difficulty: ClueDifficulty = 'normal', now = Date.now(), random: RandomSource = Math.random): ClueKingRoom {
  const id = makePlayerId(random);
  return {
    code: makeRoomCode(random),
    gameType: 'clue_king',
    clueVersion: 3,
    sessionNo: 1,
    ownerId: id,
    players: [{ id, name: ownerName.trim() || '房主', seat: 1, alive: true, cardReady: false, away: false }],
    playerLimit: CLUE_MAX_PLAYERS,
    version: 1,
    createdAt: now,
    updatedAt: now,
    status: 'lobby',
    round: 0,
    totalRounds: 0,
    phaseDeadlineAt: null,
    mode,
    difficulty,
    currentDifficulty: null,
    guesserOrder: [],
    guesserId: null,
    guesserName: null,
    challengeId: null,
    challengeText: null,
    publicRuleId: null,
    publicRuleName: null,
    publicRuleText: null,
    expectedCluePlayerIds: [],
    clueStatuses: {},
    clueConfirmedCount: 0,
    publicClues: [],
    guessAttemptCount: 0,
    guessStatus: 'waiting',
    guessElapsedMs: null,
    revealedWord: null,
    roundResults: [],
    hintScores: {},
    guessTimes: {},
    usedWordIds: [],
    previousSessionWordIds: [],
    recentWordIds: [],
    lastPublicRuleId: null,
    lastRoleByPlayer: {},
  };
}

export function validateClue(text: string, targetWord: string | null, maxLength = CLUE_MAX_LENGTH) {
  const clean = text.trim();
  if (!clean || clean.length > maxLength) throw new Error(`提示须为 1–${maxLength} 字`);
  if (targetWord && clean.toLocaleLowerCase().includes(targetWord.trim().toLocaleLowerCase())) throw new Error('提示不能直接写出答案');
  return clean;
}

export function validateRatings(ratings: Record<string, number>, clueIds: string[]) {
  if (clueIds.some((id) => !Number.isInteger(ratings[id]) || ratings[id] < 1 || ratings[id] > 3)) {
    throw new Error('请为每条提示选择 1–3 分');
  }
}

export function rankHintScores(room: ClueKingRoom) {
  return room.players
    .map((player) => ({ playerId: player.id, name: player.name, score: room.hintScores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'))
    .map((item, index, all) => ({ ...item, rank: index > 0 && item.score === all[index - 1].score ? all.findIndex((row) => row.score === item.score) + 1 : index + 1 }));
}

export function rankGuessTimes(room: ClueKingRoom) {
  return room.players
    .map((player) => ({ playerId: player.id, name: player.name, elapsedMs: room.guessTimes[player.id] ?? null }))
    .sort((a, b) => a.elapsedMs === null ? 1 : b.elapsedMs === null ? -1 : a.elapsedMs - b.elapsedMs || a.name.localeCompare(b.name, 'zh-CN'))
    .map((item, index, all) => {
      if (item.elapsedMs === null) return { ...item, rank: null };
      const first = all.findIndex((row) => row.elapsedMs === item.elapsedMs);
      return { ...item, rank: first + 1 };
    });
}

export function formatGuessTime(elapsedMs: number | null) {
  return elapsedMs === null ? '未猜中' : `${(elapsedMs / 1000).toFixed(1)} 秒`;
}
