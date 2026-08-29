import { COURT_V7_SAMPLE_CASES } from './court-content.ts';
import { makeRoomCode, type Player, type RandomSource } from './game.ts';

export type CourtStatus = 'lobby' | 'statement' | 'questioning' | 'evidence' | 'response' | 'voting' | 'result' | 'finished';
export type CourtPhaseStatus = 'writing' | 'choosing' | 'confirmed' | 'unconfirmed' | 'unvoted' | 'away';
export interface CourtPlayer extends Player { eligibleFromRound?: number; }
export interface CourtPublicEntry {
  submissionId: string;
  displayCode: string;
  statement: string;
  response: string | null;
  tacticName?: string;
  question?: string | null;
  isArchive?: boolean;
  authorId?: string;
  authorName?: string;
  questionerName?: string;
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
export interface CourtPrivateSubmission {
  sessionNo: number;
  round: number;
  submissionId: string | null;
  statement: string;
  statementConfirmed: boolean;
  response: string;
  responseConfirmed: boolean;
  tacticId: string | null;
  tacticName: string | null;
  tacticInstruction: string | null;
  rerollAvailable: boolean;
  questionTargetSubmissionId: string | null;
  questionOptions: { id: string; text: string }[];
  selectedQuestionId: string | null;
  questionConfirmed: boolean;
  receivedQuestion: string | null;
}
export interface AbsurdCourtRoom {
  code: string;
  gameType: 'absurd_court';
  courtVersion: 7;
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
  questionStatuses: Record<string, CourtPhaseStatus>;
  responseStatuses: Record<string, CourtPhaseStatus>;
  voteStatuses: Record<string, CourtPhaseStatus>;
  statementConfirmedCount: number;
  questionConfirmedCount: number;
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
export const COURT_TACTICS = [
  { id: 'admit-small', name: '承认小错', instruction: '主动承认一个小问题，但坚持真正的大锅不属于你。' },
  { id: 'process-blame', name: '流程背锅', instruction: '把结果解释成流程、规定或交接方式造成的。' },
  { id: 'reverse-credit', name: '反向邀功', instruction: '把看似翻车的行为解释成一次贡献或优化。' },
  { id: 'emotional', name: '打感情牌', instruction: '强调你的出发点是照顾同事、团队或大家的感受。' },
  { id: 'wording', name: '抓住字眼', instruction: '抓住题目中的一个词，证明大家误解了你的原意。' },
  { id: 'everyone-does-it', name: '大家都这样', instruction: '说明这是普遍做法，只是这次刚好被记录下来。' },
  { id: 'technical', name: '技术问题', instruction: '把关键矛盾解释成设备、软件、网络或操作界面的问题。' },
  { id: 'collective', name: '为了集体', instruction: '说明你的选择是在保护团队效率或避免更大的损失。' },
] as const;
export const COURT_DURATIONS: Record<Exclude<CourtStatus, 'lobby' | 'finished'>, number> = {
  statement: 300_000,
  questioning: 45_000,
  evidence: 5_000,
  response: 300_000,
  voting: 120_000,
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
    courtVersion: 7,
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
    questionStatuses: {},
    responseStatuses: {},
    voteStatuses: {},
    statementConfirmedCount: 0,
    questionConfirmedCount: 0,
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
  if (!clean || clean.length > 120) throw new Error('当庭补述须为 1–120 字');
}

export function validateQuestionChoice(questionId: string | null, options: { id: string }[]) {
  if (!questionId || !options.some((option) => option.id === questionId)) throw new Error('请选择一条质询');
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
  const preferred = COURT_V7_SAMPLE_CASES.filter((item) => !room.usedCaseIds.includes(item.id) && !room.previousSessionCaseIds.includes(item.id));
  const fallback = COURT_V7_SAMPLE_CASES.filter((item) => !room.usedCaseIds.includes(item.id));
  const candidates = preferred.length ? preferred : fallback.length ? fallback : COURT_V7_SAMPLE_CASES;
  const selected = candidates[Math.floor(random() * candidates.length)] ?? COURT_V7_SAMPLE_CASES[0];
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
    questionStatuses: {},
    responseStatuses: {},
    voteStatuses: {},
    statementConfirmedCount: 0,
    questionConfirmedCount: 0,
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
  if (room.status === 'statement') return to('questioning', { questionStatuses: phaseMap(room.expectedPlayerIds, 'choosing') });
  if (room.status === 'questioning') return to('evidence');
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
    questionStatuses: {},
    responseStatuses: {},
    voteStatuses: {},
    statementConfirmedCount: 0,
    questionConfirmedCount: 0,
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
