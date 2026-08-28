import { COURT_CASE_PACKS } from './court-content.ts';
import { makeRoomCode, type Player, type RandomSource } from './game.ts';

export type CourtStatus = 'lobby' | 'statement' | 'statement_reveal' | 'evidence' | 'response' | 'voting' | 'result' | 'finished';
export type CourtPhaseStatus = 'writing' | 'confirmed' | 'unconfirmed' | 'unvoted' | 'away';
export interface CourtPlayer extends Player { eligibleFromRound?: number; }
export interface CourtPublicEntry {
  submissionId: string;
  displayCode: string;
  statement: string;
  response: string | null;
  isReference?: boolean;
  authorId?: string;
  authorName?: string;
  bestVotes?: number;
  truthVotes?: number;
}
export interface CourtRoundResult {
  round: number;
  bestWinnerSubmissionIds: string[];
  truthWinnerSubmissionIds: string[];
  bestHighestVotes: number;
  truthHighestVotes: number;
}
export interface CourtPrivateSubmission { sessionNo: number; round: number; submissionId: string | null; statement: string; statementConfirmed: boolean; response: string; responseConfirmed: boolean; }
export interface AbsurdCourtRoom {
  code: string;
  gameType: 'absurd_court';
  courtVersion: 6;
  sessionNo: number;
  ownerId: string;
  players: CourtPlayer[];
  playerLimit: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  status: CourtStatus;
  round: number;
  totalRounds: 3;
  phaseDeadlineAt: number | null;
  caseId: string | null;
  caseTitle: string | null;
  charge: string | null;
  evidenceTitle: string | null;
  evidence: string | null;
  verdictTemplate: string | null;
  usedCaseIds: string[];
  previousSessionCaseIds: string[];
  expectedPlayerIds: string[];
  statementStatuses: Record<string, CourtPhaseStatus>;
  responseStatuses: Record<string, CourtPhaseStatus>;
  voteStatuses: Record<string, CourtPhaseStatus>;
  statementConfirmedCount: number;
  responseConfirmedCount: number;
  voteConfirmedCount: number;
  publicEntries: CourtPublicEntry[];
  roundResults: CourtRoundResult[];
  totalBestScores: Record<string, number>;
  totalTruthScores: Record<string, number>;
}

export const COURT_MIN_PLAYERS = 2;
export const COURT_MAX_PLAYERS = 8;
export const COURT_RECENT_CASE_LIMIT = 21;
export const COURT_DURATIONS: Record<Exclude<CourtStatus, 'lobby' | 'finished'>, number> = {
  statement: 120_000,
  statement_reveal: 5_000,
  evidence: 5_000,
  response: 120_000,
  voting: 30_000,
  result: 10_000,
};

function makePlayerId(random: RandomSource) {
  return `p_${Math.floor(random() * 1e12).toString(36)}`;
}

function phaseMap(ids: string[], status: CourtPhaseStatus): Record<string, CourtPhaseStatus> {
  return Object.fromEntries(ids.map((id) => [id, status]));
}

function recentDistinctCaseIds(ids: string[]) {
  const seen = new Set<string>();
  const recent: string[] = [];
  for (let index = ids.length - 1; index >= 0 && recent.length < COURT_RECENT_CASE_LIMIT; index -= 1) {
    const id = ids[index];
    if (!seen.has(id)) {
      seen.add(id);
      recent.unshift(id);
    }
  }
  return recent;
}

export function createCourtRoom(ownerName: string, now = Date.now(), random: RandomSource = Math.random): AbsurdCourtRoom {
  const id = makePlayerId(random);
  return {
    code: makeRoomCode(random),
    gameType: 'absurd_court',
    courtVersion: 6,
    sessionNo: 1,
    ownerId: id,
    players: [{ id, name: ownerName.trim() || '房主', seat: 1, alive: true, cardReady: false, away: false, eligibleFromRound: 1 }],
    playerLimit: COURT_MAX_PLAYERS,
    version: 1,
    createdAt: now,
    updatedAt: now,
    status: 'lobby',
    round: 0,
    totalRounds: 3,
    phaseDeadlineAt: null,
    caseId: null,
    caseTitle: null,
    charge: null,
    evidenceTitle: null,
    evidence: null,
    verdictTemplate: null,
    usedCaseIds: [],
    previousSessionCaseIds: [],
    expectedPlayerIds: [],
    statementStatuses: {},
    responseStatuses: {},
    voteStatuses: {},
    statementConfirmedCount: 0,
    responseConfirmedCount: 0,
    voteConfirmedCount: 0,
    publicEntries: [],
    roundResults: [],
    totalBestScores: {},
    totalTruthScores: {},
  };
}

export function validateStatement(text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 80) throw new Error('首次陈词须为 1–80 字');
}

export function validateResponse(text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 80) throw new Error('当庭补述须为 1–80 字');
}

export function validateVote(voterSubmissionId: string | null, bestChoice: string | null, truthChoice: string | null, entryIds: string[]) {
  if (!bestChoice || !entryIds.includes(bestChoice)) throw new Error('请选择“最会狡辩”');
  if (!truthChoice || !entryIds.includes(truthChoice)) throw new Error('请选择“最像真的”');
  if (bestChoice === voterSubmissionId || truthChoice === voterSubmissionId) throw new Error('不能投给自己的陈述');
}

export function startCourtRound(room: AbsurdCourtRoom, now = Date.now(), random: RandomSource = Math.random): AbsurdCourtRoom {
  const nextRound = room.round + 1;
  const expected = room.players
    .filter((player) => player.alive && !player.away && (player.eligibleFromRound ?? 1) <= nextRound)
    .map((player) => player.id);
  if (expected.length < COURT_MIN_PLAYERS) {
    return { ...room, status: 'finished', phaseDeadlineAt: null, updatedAt: now, version: room.version + 1 };
  }
  const preferred = COURT_CASE_PACKS.filter((item) => item.enabled && !room.usedCaseIds.includes(item.id) && !room.previousSessionCaseIds.includes(item.id));
  const fallback = COURT_CASE_PACKS.filter((item) => item.enabled && !room.usedCaseIds.includes(item.id));
  const candidates = preferred.length ? preferred : fallback.length ? fallback : COURT_CASE_PACKS.filter((item) => item.enabled);
  const selected = candidates[Math.floor(random() * candidates.length)] ?? COURT_CASE_PACKS[0];
  return {
    ...room,
    status: 'statement',
    round: nextRound,
    phaseDeadlineAt: now + COURT_DURATIONS.statement,
    caseId: selected.id,
    caseTitle: selected.title,
    charge: selected.charge,
    evidenceTitle: selected.evidenceTitle,
    evidence: selected.evidence,
    verdictTemplate: selected.verdictTemplate,
    usedCaseIds: [...room.usedCaseIds, selected.id],
    expectedPlayerIds: expected,
    statementStatuses: phaseMap(expected, 'writing'),
    responseStatuses: {},
    voteStatuses: {},
    statementConfirmedCount: 0,
    responseConfirmedCount: 0,
    voteConfirmedCount: 0,
    publicEntries: [],
    updatedAt: now,
    version: room.version + 1,
  };
}

export function nextCourtStatus(room: AbsurdCourtRoom, now = Date.now(), random: RandomSource = Math.random): AbsurdCourtRoom {
  const to = (status: CourtStatus, patch: Partial<AbsurdCourtRoom> = {}) => ({
    ...room,
    ...patch,
    status,
    phaseDeadlineAt: status === 'finished' ? null : now + COURT_DURATIONS[status as keyof typeof COURT_DURATIONS],
    updatedAt: now,
    version: room.version + 1,
  });
  if (room.status === 'statement') return to('statement_reveal');
  if (room.status === 'statement_reveal') return to('evidence');
  if (room.status === 'evidence') return to('response');
  if (room.status === 'response') return to('voting');
  if (room.status === 'voting') return to('result');
  if (room.status === 'result') return room.round >= room.totalRounds ? to('finished') : startCourtRound(room, now, random);
  return room;
}

export function restartCourtGame(room: AbsurdCourtRoom, now = Date.now()): AbsurdCourtRoom {
  return {
    ...room,
    sessionNo: room.sessionNo + 1,
    status: 'lobby',
    round: 0,
    phaseDeadlineAt: null,
    players: room.players.map((player) => ({ ...player, eligibleFromRound: 1 })),
    previousSessionCaseIds: recentDistinctCaseIds([...room.previousSessionCaseIds, ...room.usedCaseIds]),
    usedCaseIds: [],
    expectedPlayerIds: [],
    statementStatuses: {},
    responseStatuses: {},
    voteStatuses: {},
    statementConfirmedCount: 0,
    responseConfirmedCount: 0,
    voteConfirmedCount: 0,
    publicEntries: [],
    roundResults: [],
    totalBestScores: {},
    totalTruthScores: {},
    caseId: null,
    caseTitle: null,
    charge: null,
    evidenceTitle: null,
    evidence: null,
    verdictTemplate: null,
    updatedAt: now,
    version: room.version + 1,
  };
}

export function rankScores(scores: Record<string, number>) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id, score], index, all) => ({
      playerId: id,
      score,
      rank: index > 0 && score === all[index - 1][1] ? all.findIndex((item) => item[1] === score) + 1 : index + 1,
    }));
}
