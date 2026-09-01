import cloudbase from '@cloudbase/js-sdk';
import { registerMySQL, type IPgClient } from '@cloudbase/mysql';
import type { GameRoom } from './game';
import type { AbsurdCourtRoom, CourtPrivateSubmission } from './court-game';
import type { ClueKingRoom, CluePrivateRound, ClueRuleMode } from './clue-game';

type GameRow = { state: GameRoom; version: number };
type PgClient = ReturnType<IPgClient>;
let mysqlRegistered = false;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return String(error ?? '');
  const value = error as { code?: unknown; message?: unknown; msg?: unknown };
  return [value.code, value.message, value.msg].filter((item): item is string => typeof item === 'string').join(' ');
}

function ensureMySqlRegistered() {
  if (mysqlRegistered) return;
  try {
    registerMySQL(cloudbase as unknown as Parameters<typeof registerMySQL>[0]);
  } catch (error) {
    if (!errorText(error).includes('Duplicate component mysql')) throw error;
  }
  mysqlRegistered = true;
}

export type GameActionType = 'confirm_card' | 'submit_description' | 'submit_vote' | 'advance_phase' | 'trigger_buzzer' | 'submit_special' | 'change_presence' | 'update_lobby_settings' | 'accuse_undercover';
export type GameActionOutcome = 'applied' | 'duplicate' | 'stale' | 'rejected';
export interface GameActionResult {
  outcome: GameActionOutcome;
  code: string;
  message: string;
  state: GameRoom;
  version: number;
}
export type CourtActionType =
  | 'start_court_game'
  | 'confirm_court_statement'
  | 'confirm_court_response'
  | 'confirm_court_vote'
  | 'advance_court_phase'
  | 'change_court_presence'
  | 'end_court_game'
  | 'restart_court_game';
export interface CourtActionResult { outcome: GameActionOutcome; code: string; message: string; state: AbsurdCourtRoom; version: number; }
export type ClueActionType = 'start_clue_game' | 'confirm_clue' | 'submit_clue_guess' | 'confirm_clue_ratings' | 'advance_clue_phase' | 'restart_clue_game';
export interface ClueActionResult { outcome: GameActionOutcome; code: string; message: string; state: ClueKingRoom; version: number; }

function publicConfig() {
  const env = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  const accessKey = process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY;
  const region = process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai';
  if (!env || !accessKey) throw new Error('CloudBase 环境参数尚未配置');
  return { env, accessKey, region };
}

export class CloudBaseRoomStore {
  private database: PgClient | null = null;
  private connectionPromise: Promise<void> | null = null;

  async connect() {
    if (this.database) return;
    this.connectionPromise ??= this.initialize().finally(() => { this.connectionPromise = null; });
    await this.connectionPromise;
  }

  private async initialize() {
    if (this.database) return;
    ensureMySqlRegistered();
    const app = cloudbase.init({ ...publicConfig(), auth: { detectSessionInUrl: true } });
    const { error } = await app.auth.signInAnonymously();
    if (error) throw error;
    this.database = app.rdb() as unknown as PgClient;
  }

  private db(): PgClient {
    if (!this.database) throw new Error('CloudBase 尚未连接');
    return this.database;
  }

  async createRoom(room: GameRoom): Promise<void> {
    await this.connect();
    const { error } = await this.db().rpc('create_game', {
      p_code: room.code,
      p_owner_player_id: room.ownerId,
      p_state: room,
    });
    if (error) throw error;
  }

  async createCourtRoom(room: AbsurdCourtRoom): Promise<AbsurdCourtRoom> {
    await this.connect();
    const { data, error } = await this.db().rpc('create_court_game_v6', {
      p_code: room.code,
      p_owner_player_id: room.ownerId,
      p_owner_name: room.players[0]?.name ?? '房主',
    }).single();
    if (error) throw error;
    return data as unknown as AbsurdCourtRoom;
  }

  async joinCourtRoom(code: string, playerId: string, nickname: string): Promise<{ room: AbsurdCourtRoom; playerId: string }> {
    await this.connect();
    const { data, error } = await this.db().rpc('join_court_game_v6', {
      p_code: code,
      p_player_id: playerId,
      p_nickname: nickname,
    }).single();
    if (error) throw error;
    const result = data as unknown as { state: AbsurdCourtRoom; playerId: string };
    return { room: result.state, playerId: result.playerId };
  }

  async applyCourtAction(input: { room: AbsurdCourtRoom; actionId: string; actionType: CourtActionType; payload?: Record<string, unknown> }): Promise<CourtActionResult> {
    await this.connect();
    const { data, error } = await this.db().rpc('apply_court_action_v6', {
      p_code: input.room.code,
      p_action_id: input.actionId,
      p_action_type: input.actionType,
      p_expected_status: input.room.status,
      p_expected_round: input.room.round,
      p_expected_session: input.room.sessionNo,
      p_expected_version: input.room.version,
      p_payload: input.payload ?? {},
    }).single();
    if (error) throw error;
    return data as unknown as CourtActionResult;
  }

  async getMyCourtSubmission(code: string): Promise<CourtPrivateSubmission | null> {
    await this.connect();
    const { data, error } = await this.db().rpc('get_my_court_submission_v6', { p_code: code }).single();
    if (error) throw error;
    return data as CourtPrivateSubmission | null;
  }

  async createClueRoom(room: ClueKingRoom, ruleMode: ClueRuleMode): Promise<ClueKingRoom> {
    await this.connect();
    const { data, error } = await this.db().rpc('create_clue_game_v1', {
      p_code: room.code,
      p_owner_player_id: room.ownerId,
      p_owner_name: room.players[0]?.name ?? '房主',
      p_rule_mode: ruleMode,
    }).single();
    if (error) throw error;
    return data as unknown as ClueKingRoom;
  }

  async joinClueRoom(code: string, playerId: string, nickname: string): Promise<{ room: ClueKingRoom; playerId: string }> {
    await this.connect();
    const { data, error } = await this.db().rpc('join_clue_game_v1', {
      p_code: code,
      p_player_id: playerId,
      p_nickname: nickname,
    }).single();
    if (error) throw error;
    const result = data as unknown as { state: ClueKingRoom; playerId: string };
    return { room: result.state, playerId: result.playerId };
  }

  async applyClueAction(input: { room: ClueKingRoom; actionId: string; actionType: ClueActionType; payload?: Record<string, unknown> }): Promise<ClueActionResult> {
    await this.connect();
    const { data, error } = await this.db().rpc('apply_clue_action_v2', {
      p_code: input.room.code,
      p_action_id: input.actionId,
      p_action_type: input.actionType,
      p_expected_status: input.room.status,
      p_expected_round: input.room.round,
      p_expected_session: input.room.sessionNo,
      p_expected_version: input.room.version,
      p_payload: input.payload ?? {},
    }).single();
    if (error) throw error;
    return data as unknown as ClueActionResult;
  }

  async getMyClueRound(code: string): Promise<CluePrivateRound | null> {
    await this.connect();
    const { data, error } = await this.db().rpc('get_my_clue_round_v1', { p_code: code }).single();
    if (error) throw error;
    return data as CluePrivateRound | null;
  }

  async joinRoom(code: string, playerId: string, nickname: string): Promise<{ room: GameRoom; playerId: string }> {
    await this.connect();
    const { data, error } = await this.db().rpc('join_game', {
      p_code: code,
      p_player_id: playerId,
      p_nickname: nickname,
    }).single();
    if (error) throw error;
    const result = data as unknown as { state: GameRoom; playerId: string };
    return { room: result.state, playerId: result.playerId };
  }

  async getRoom(code: string): Promise<GameRoom | null> {
    await this.connect();
    const { data, error } = await this.db().from('games').select('state,version').eq('code', code).maybeSingle();
    if (error) throw error;
    return data ? (data as unknown as GameRow).state : null;
  }

  async getCourtRoom(code: string): Promise<AbsurdCourtRoom | null> {
    const room = await this.getRoom(code);
    return room && (room as unknown as { gameType?: string }).gameType === 'absurd_court' ? room as unknown as AbsurdCourtRoom : null;
  }

  async getClueRoom(code: string): Promise<ClueKingRoom | null> {
    const room = await this.getRoom(code);
    return room && (room as unknown as { gameType?: string }).gameType === 'clue_king' ? room as unknown as ClueKingRoom : null;
  }

  async applyGameAction(input: {
    room: GameRoom;
    actionId: string;
    actionType: GameActionType;
    payload?: Record<string, unknown>;
  }): Promise<GameActionResult> {
    await this.connect();
    const { data, error } = await this.db().rpc('apply_game_action_v31', {
      p_code: input.room.code,
      p_action_id: input.actionId,
      p_action_type: input.actionType,
      p_expected_status: input.room.status,
      p_expected_round: input.room.round,
      p_expected_ballot: input.room.status === 'voting' ? input.room.ballot : null,
      p_expected_version: input.room.version,
      p_payload: input.payload ?? {},
    }).single();
    if (error) throw error;
    return data as unknown as GameActionResult;
  }

  watchRoom(code: string, onChange: (room: GameRoom) => void, onError: (error: unknown) => void) {
    let closed = false;
    let lastVersion = -1;
    const refresh = async () => {
      try {
        const room = await this.getRoom(code);
        if (!closed && room && room.version !== lastVersion) {
          lastVersion = room.version;
          onChange(room);
        }
      } catch (error) {
        if (!closed) onError(error);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1800);
    return () => { closed = true; window.clearInterval(timer); };
  }

  watchCourtRoom(code: string, onChange: (room: AbsurdCourtRoom) => void, onError: (error: unknown) => void) {
    return this.watchRoom(code, (room) => {
      if ((room as unknown as { gameType?: string }).gameType === 'absurd_court') onChange(room as unknown as AbsurdCourtRoom);
    }, onError);
  }

  watchClueRoom(code: string, onChange: (room: ClueKingRoom) => void, onError: (error: unknown) => void) {
    return this.watchRoom(code, (room) => {
      if ((room as unknown as { gameType?: string }).gameType === 'clue_king') onChange(room as unknown as ClueKingRoom);
    }, onError);
  }
}

let sharedStore: CloudBaseRoomStore | null = null;
export function getCloudStore() {
  sharedStore ??= new CloudBaseRoomStore();
  return sharedStore;
}
