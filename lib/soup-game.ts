import { makeRoomCode, shuffle, type Player, type RandomSource } from './game.ts';
import type { SoupCaseCard, SoupCategory, SoupDifficulty, SoupQuestionVerdict } from './soup-content.ts';
export type { SoupQuestionVerdict } from './soup-content.ts';

export type SoupStatus = 'lobby' | 'host_reading' | 'investigating' | 'judging_question' | 'judging_solution' | 'limit_reached' | 'feedback' | 'finished';
export type SoupActionType = 'question' | 'solution';
export type SoupSolutionVerdict = 'success' | 'close' | 'wrong';
export type SoupRecordType = 'question' | 'solution' | 'skip' | 'hint';

export interface SoupPlayer extends Player { away: boolean; }

export interface SoupPendingAction {
  id: string;
  playerId: string;
  playerName: string;
  type: SoupActionType;
  content: string;
  submittedAt: number;
}

export interface SoupRecord {
  sequence: number;
  playerId: string | null;
  playerName: string;
  type: SoupRecordType;
  content: string;
  verdict: SoupQuestionVerdict | SoupSolutionVerdict | null;
  note: string | null;
  counted: boolean;
  createdAt: number;
}

export interface SoupResult {
  success: boolean;
  validQuestions: number;
  hintsUsed: number;
  solverId: string | null;
  solverName: string | null;
  elapsedMs: number;
  revealedReason: 'solved' | 'host_reveal' | 'ended';
}

export interface SoupRoom {
  code: string;
  gameType: 'soup_detective';
  soupVersion: 1;
  sessionNo: number;
  ownerId: string;
  players: SoupPlayer[];
  playerLimit: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  status: SoupStatus;
  round: number;
  hostOrder: string[];
  servedHostIds: string[];
  hostId: string | null;
  hostName: string | null;
  detectiveOrder: string[];
  currentDetectiveId: string | null;
  currentDetectiveName: string | null;
  actionCycle: number;
  surface: string | null;
  caseTitle: string | null;
  caseCategory: SoupCategory | null;
  difficulty: SoupDifficulty | null;
  roundStartedAt: number | null;
  effectiveQuestionCount: number;
  maxQuestions: number;
  extended: boolean;
  hintsUsed: number;
  publicHints: string[];
  pendingAction: SoupPendingAction | null;
  records: SoupRecord[];
  usedCaseIds: string[];
  revealedBottom: string | null;
  result: SoupResult | null;
  feedbackCount: number;
}

export interface SoupRoundSecret {
  sessionNo: number;
  round: number;
  caseId: string;
  bottom: string;
  keyFacts: readonly string[];
  equivalentAnswers: readonly string[];
  boundary: string;
  commonQuestions: SoupCaseCard['commonQuestions'];
  hints: SoupCaseCard['hints'];
  cardVersion: number;
}

export interface SoupPrivateRound {
  sessionNo: number;
  round: number;
  isHost: boolean;
  bottom: string | null;
  keyFacts: readonly string[];
  equivalentAnswers: readonly string[];
  boundary: string | null;
  commonQuestions: SoupCaseCard['commonQuestions'];
  hints: readonly string[];
  draftText: string;
  draftUpdatedAt: number | null;
}

export interface SoupRoundStart { room: SoupRoom; secret: SoupRoundSecret; }
export interface SoupFeedbackInput { difficulty: 'too_easy' | 'just_right' | 'too_hard'; ambiguous: boolean; unsuitable: boolean; note?: string; }

export const SOUP_MIN_PLAYERS = 3;
export const SOUP_MAX_PLAYERS = 10;
export const SOUP_DEFAULT_QUESTION_LIMIT = 20;
export const SOUP_EXTENSION_QUESTIONS = 5;
export const SOUP_MAX_HINTS = 2;
export const SOUP_ACTION_MAX_LENGTH = 240;

function cloneRoom(room: SoupRoom): SoupRoom {
  return JSON.parse(JSON.stringify(room)) as SoupRoom;
}

function makePlayerId(random: RandomSource) {
  return `p_${Math.floor(random() * 1e12).toString(36)}`;
}

function activePlayers(room: SoupRoom) {
  return room.players.filter((player) => player.alive && !player.away);
}

function getPlayer(room: SoupRoom, playerId: string) {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) throw new Error('玩家不在当前房间');
  return player;
}

function requireOwner(room: SoupRoom, playerId: string) {
  if (room.ownerId !== playerId) throw new Error('仅负责人可以执行此操作');
}

function requireHost(room: SoupRoom, playerId: string) {
  if (room.hostId !== playerId) throw new Error('仅本题汤主可以判定');
}

function cleanActionContent(content: string) {
  const clean = content.trim();
  if (!clean) throw new Error('内容不能为空');
  if (clean.length > SOUP_ACTION_MAX_LENGTH) throw new Error(`内容最多 ${SOUP_ACTION_MAX_LENGTH} 字`);
  return clean;
}

function nextDetective(room: SoupRoom) {
  const activeIds = new Set(activePlayers(room).map((player) => player.id));
  const order = room.detectiveOrder.filter((id) => id !== room.hostId && activeIds.has(id));
  if (!order.length) throw new Error('当前没有可行动的侦探');
  const currentIndex = room.currentDetectiveId ? order.indexOf(room.currentDetectiveId) : -1;
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % order.length;
  const nextId = order[nextIndex];
  const next = getPlayer(room, nextId);
  room.detectiveOrder = order;
  room.currentDetectiveId = next.id;
  room.currentDetectiveName = next.name;
  if (currentIndex >= 0 && nextIndex === 0) room.actionCycle += 1;
}

function addRecord(room: SoupRoom, record: Omit<SoupRecord, 'sequence'>) {
  room.records.push({ ...record, sequence: room.records.length + 1 });
}

function touch(room: SoupRoom, now: number) {
  room.updatedAt = now;
  room.version += 1;
  return room;
}

function chooseCase(room: SoupRoom, cards: readonly SoupCaseCard[], random: RandomSource) {
  const enabled = cards.filter((card) => card.reviewStatus !== 'disabled');
  if (!enabled.length) throw new Error('当前没有可用题卡');
  const fresh = enabled.filter((card) => !room.usedCaseIds.includes(card.id));
  const pool = fresh.length ? fresh : enabled;
  return pool[Math.floor(random() * pool.length)] ?? pool[0];
}

function chooseNextHost(room: SoupRoom, random: RandomSource) {
  const ids = activePlayers(room).map((player) => player.id);
  if (ids.length < SOUP_MIN_PLAYERS) throw new Error(`至少需要 ${SOUP_MIN_PLAYERS} 人才能开始`);
  let hostOrder = room.hostOrder.filter((id) => ids.includes(id));
  let served = room.servedHostIds.filter((id) => ids.includes(id));
  if (!hostOrder.length || ids.some((id) => !hostOrder.includes(id))) hostOrder = shuffle(ids, random);
  let hostId = hostOrder.find((id) => !served.includes(id));
  if (!hostId) {
    hostOrder = shuffle(ids, random);
    served = [];
    hostId = hostOrder[0];
  }
  return { hostOrder, served, hostId };
}

function beginRound(room: SoupRoom, cards: readonly SoupCaseCard[], now: number, random: RandomSource): SoupRoundStart {
  const next = cloneRoom(room);
  const { hostOrder, served, hostId } = chooseNextHost(next, random);
  const card = chooseCase(next, cards, random);
  const host = getPlayer(next, hostId);
  const detectives = activePlayers(next).filter((player) => player.id !== hostId).sort((a, b) => a.seat - b.seat);
  next.round += 1;
  next.hostOrder = hostOrder;
  next.servedHostIds = [...served, hostId];
  next.hostId = hostId;
  next.hostName = host.name;
  next.detectiveOrder = detectives.map((player) => player.id);
  next.currentDetectiveId = detectives[0]?.id ?? null;
  next.currentDetectiveName = detectives[0]?.name ?? null;
  next.actionCycle = 1;
  next.status = 'host_reading';
  next.surface = card.surface;
  next.caseTitle = null;
  next.caseCategory = card.category;
  next.difficulty = card.difficulty;
  next.roundStartedAt = now;
  next.effectiveQuestionCount = 0;
  next.maxQuestions = SOUP_DEFAULT_QUESTION_LIMIT;
  next.extended = false;
  next.hintsUsed = 0;
  next.publicHints = [];
  next.pendingAction = null;
  next.records = [];
  next.revealedBottom = null;
  next.result = null;
  next.feedbackCount = 0;
  next.usedCaseIds = next.usedCaseIds.includes(card.id) ? next.usedCaseIds : [...next.usedCaseIds, card.id];
  touch(next, now);
  return {
    room: next,
    secret: {
      sessionNo: next.sessionNo,
      round: next.round,
      caseId: card.id,
      bottom: card.bottom,
      keyFacts: card.keyFacts,
      equivalentAnswers: card.equivalentAnswers,
      boundary: card.boundary,
      commonQuestions: card.commonQuestions,
      hints: card.hints,
      cardVersion: card.cardVersion,
    },
  };
}

export function createSoupRoom(ownerName: string, now = Date.now(), random: RandomSource = Math.random): SoupRoom {
  const ownerId = makePlayerId(random);
  return {
    code: makeRoomCode(random), gameType: 'soup_detective', soupVersion: 1, sessionNo: 1, ownerId,
    players: [{ id: ownerId, name: ownerName.trim() || '负责人', seat: 1, alive: true, cardReady: false, away: false }],
    playerLimit: SOUP_MAX_PLAYERS, version: 1, createdAt: now, updatedAt: now, status: 'lobby', round: 0,
    hostOrder: [], servedHostIds: [], hostId: null, hostName: null, detectiveOrder: [], currentDetectiveId: null,
    currentDetectiveName: null, actionCycle: 0, surface: null, caseTitle: null, caseCategory: null, difficulty: null,
    roundStartedAt: null, effectiveQuestionCount: 0, maxQuestions: SOUP_DEFAULT_QUESTION_LIMIT, extended: false,
    hintsUsed: 0, publicHints: [], pendingAction: null, records: [], usedCaseIds: [], revealedBottom: null,
    result: null, feedbackCount: 0,
  };
}

export function startSoupGame(room: SoupRoom, actorId: string, cards: readonly SoupCaseCard[], now = Date.now(), random: RandomSource = Math.random) {
  requireOwner(room, actorId);
  if (room.status !== 'lobby') throw new Error('当前状态不能开始');
  return beginRound(room, cards, now, random);
}

export function acknowledgeSoupHost(room: SoupRoom, actorId: string, now = Date.now()) {
  requireHost(room, actorId);
  if (room.status !== 'host_reading') throw new Error('当前无需确认汤底');
  const next = cloneRoom(room);
  next.status = 'investigating';
  return touch(next, now);
}

function submitAction(room: SoupRoom, actorId: string, type: SoupActionType, content: string, now: number) {
  if (room.status !== 'investigating') throw new Error('当前不能提交');
  if (room.currentDetectiveId !== actorId) throw new Error('还没轮到你正式提交');
  const player = getPlayer(room, actorId);
  const next = cloneRoom(room);
  next.pendingAction = { id: `${next.sessionNo}-${next.round}-${next.records.length + 1}`, playerId: actorId, playerName: player.name, type, content: cleanActionContent(content), submittedAt: now };
  next.status = type === 'question' ? 'judging_question' : 'judging_solution';
  return touch(next, now);
}

export function submitSoupQuestion(room: SoupRoom, actorId: string, content: string, now = Date.now()) {
  return submitAction(room, actorId, 'question', content, now);
}

export function submitSoupSolution(room: SoupRoom, actorId: string, content: string, now = Date.now()) {
  return submitAction(room, actorId, 'solution', content, now);
}

export function skipSoupTurn(room: SoupRoom, actorId: string, now = Date.now()) {
  if (room.status !== 'investigating' || room.currentDetectiveId !== actorId) throw new Error('还没轮到你跳过');
  const player = getPlayer(room, actorId);
  const next = cloneRoom(room);
  addRecord(next, { playerId: actorId, playerName: player.name, type: 'skip', content: '跳过本轮', verdict: null, note: null, counted: false, createdAt: now });
  nextDetective(next);
  return touch(next, now);
}

export function judgeSoupQuestion(room: SoupRoom, actorId: string, verdict: SoupQuestionVerdict, note = '', now = Date.now()) {
  requireHost(room, actorId);
  if (room.status !== 'judging_question' || room.pendingAction?.type !== 'question') throw new Error('当前没有待判定问题');
  const allowed: SoupQuestionVerdict[] = ['yes', 'no', 'irrelevant', 'partial', 'rephrase'];
  if (!allowed.includes(verdict)) throw new Error('问题判定无效');
  const next = cloneRoom(room);
  const pending = next.pendingAction!;
  const counted = verdict !== 'rephrase';
  addRecord(next, { playerId: pending.playerId, playerName: pending.playerName, type: 'question', content: pending.content, verdict, note: note.trim() || null, counted, createdAt: now });
  if (counted) next.effectiveQuestionCount += 1;
  next.pendingAction = null;
  nextDetective(next);
  next.status = next.effectiveQuestionCount >= next.maxQuestions ? 'limit_reached' : 'investigating';
  return touch(next, now);
}

export function judgeSoupSolution(room: SoupRoom, actorId: string, verdict: SoupSolutionVerdict, secret: SoupRoundSecret, note = '', now = Date.now()) {
  requireHost(room, actorId);
  if (room.status !== 'judging_solution' || room.pendingAction?.type !== 'solution') throw new Error('当前没有待判定还原');
  if (!['success', 'close', 'wrong'].includes(verdict)) throw new Error('还原判定无效');
  const next = cloneRoom(room);
  const pending = next.pendingAction!;
  addRecord(next, { playerId: pending.playerId, playerName: pending.playerName, type: 'solution', content: pending.content, verdict, note: note.trim() || null, counted: false, createdAt: now });
  next.pendingAction = null;
  if (verdict === 'success') {
    next.status = 'feedback';
    next.revealedBottom = secret.bottom;
    next.result = {
      success: true, validQuestions: next.effectiveQuestionCount, hintsUsed: next.hintsUsed,
      solverId: pending.playerId, solverName: pending.playerName,
      elapsedMs: Math.max(0, now - (next.roundStartedAt ?? now)), revealedReason: 'solved',
    };
  } else {
    nextDetective(next);
    next.status = next.effectiveQuestionCount >= next.maxQuestions ? 'limit_reached' : 'investigating';
  }
  return touch(next, now);
}

export function useSoupHint(room: SoupRoom, actorId: string, secret: SoupRoundSecret, now = Date.now()) {
  requireHost(room, actorId);
  if (!['investigating', 'limit_reached'].includes(room.status)) throw new Error('当前不能给提示');
  if (room.hintsUsed >= SOUP_MAX_HINTS) throw new Error('本题两次提示已经用完');
  const next = cloneRoom(room);
  const hint = secret.hints[next.hintsUsed];
  next.hintsUsed += 1;
  next.publicHints.push(hint);
  addRecord(next, { playerId: actorId, playerName: next.hostName ?? '汤主', type: 'hint', content: hint, verdict: null, note: null, counted: false, createdAt: now });
  return touch(next, now);
}

export function extendSoupLimit(room: SoupRoom, actorId: string, now = Date.now()) {
  requireHost(room, actorId);
  if (room.status !== 'limit_reached') throw new Error('还没有达到问题上限');
  if (room.extended) throw new Error('本题已经延长过一次');
  const next = cloneRoom(room);
  next.extended = true;
  next.maxQuestions += SOUP_EXTENSION_QUESTIONS;
  next.status = 'investigating';
  return touch(next, now);
}

export function revealSoupBottom(room: SoupRoom, actorId: string, secret: SoupRoundSecret, now = Date.now(), reason: SoupResult['revealedReason'] = 'host_reveal') {
  requireHost(room, actorId);
  if (!['investigating', 'limit_reached', 'judging_question', 'judging_solution'].includes(room.status)) throw new Error('当前不能公布汤底');
  const next = cloneRoom(room);
  next.pendingAction = null;
  next.status = 'feedback';
  next.revealedBottom = secret.bottom;
  next.result = {
    success: false, validQuestions: next.effectiveQuestionCount, hintsUsed: next.hintsUsed,
    solverId: null, solverName: null, elapsedMs: Math.max(0, now - (next.roundStartedAt ?? now)), revealedReason: reason,
  };
  return touch(next, now);
}

export function nextSoupRound(room: SoupRoom, actorId: string, cards: readonly SoupCaseCard[], now = Date.now(), random: RandomSource = Math.random) {
  requireOwner(room, actorId);
  if (room.status !== 'feedback') throw new Error('请先完成本题反馈');
  return beginRound(room, cards, now, random);
}

export function endSoupGame(room: SoupRoom, actorId: string, now = Date.now()) {
  requireOwner(room, actorId);
  if (room.status === 'lobby') throw new Error('游戏尚未开始');
  const next = cloneRoom(room);
  next.status = 'finished';
  if (!next.result && next.roundStartedAt) {
    next.result = { success: false, validQuestions: next.effectiveQuestionCount, hintsUsed: next.hintsUsed, solverId: null, solverName: null, elapsedMs: Math.max(0, now - next.roundStartedAt), revealedReason: 'ended' };
  }
  return touch(next, now);
}

export function validateSoupFeedback(input: SoupFeedbackInput) {
  if (!['too_easy', 'just_right', 'too_hard'].includes(input.difficulty)) throw new Error('请选择难度感受');
  const note = input.note?.trim() ?? '';
  if (note.length > 300) throw new Error('文字反馈最多 300 字');
  return { ...input, note };
}

export function soupVerdictLabel(verdict: SoupQuestionVerdict | SoupSolutionVerdict | null) {
  const labels: Record<string, string> = {
    yes: '是', no: '否', irrelevant: '无关', partial: '部分正确', rephrase: '请换个问法',
    success: '还原成功', close: '还差一点', wrong: '还原错误',
  };
  return verdict ? labels[verdict] ?? verdict : '—';
}
