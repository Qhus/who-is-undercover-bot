import cloudbase from '@cloudbase/js-sdk';
import { registerMySQL, type IPgClient } from '@cloudbase/mysql';
import type { GameRoom } from './game';

type GameRow = { state: GameRoom; version: number };
type PgClient = ReturnType<IPgClient>;

function publicConfig() {
  const env = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  const accessKey = process.env.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY;
  const region = process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai';
  if (!env || !accessKey) throw new Error('CloudBase 环境参数尚未配置');
  return { env, accessKey, region };
}

export class CloudBaseRoomStore {
  private database: PgClient | null = null;

  async connect() {
    if (this.database) return;
    registerMySQL(cloudbase as unknown as Parameters<typeof registerMySQL>[0]);
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

  async saveRoom(room: GameRoom): Promise<void> {
    await this.connect();
    const { data, error } = await this.db().from('games').update({
      state: room,
      version: room.version,
      updated_at: new Date().toISOString(),
    }).eq('code', room.code).lt('version', room.version).select('version').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('房间刚刚被其他玩家更新，已放弃这次重复操作');
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
}

let sharedStore: CloudBaseRoomStore | null = null;
export function getCloudStore() {
  sharedStore ??= new CloudBaseRoomStore();
  return sharedStore;
}
