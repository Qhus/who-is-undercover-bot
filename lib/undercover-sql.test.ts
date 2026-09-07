import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sql = (name: string) => readFileSync(new URL(`../cloudbase/${name}`, import.meta.url), 'utf8');

before(async () => {
  await db.exec(`create schema auth;
    create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;
    create role anon; create role authenticated; create role service_role;
    grant usage on schema auth to anon,authenticated,service_role;`);
  await db.exec(sql('schema.sql'));
  await db.exec(sql('concurrency-v2.sql'));
  await db.exec(sql('concurrency-v3-2-versioned-rpc.sql'));
  await db.exec(sql('experience-v3-3-undercover-ux.sql'));
  await db.exec(sql('concurrency-v11-undercover-manual-host.sql'));
  await db.exec(sql('concurrency-v11-undercover-manual-host.sql'));
});

after(async () => { await db.close(); });

async function rpc<T>(actor: string, name: string, args: unknown[]): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    const result = await tx.query<{ value: T }>(`select public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')}) as value`, args);
    return result.rows[0].value;
  });
}

test('SQL: manual host does not consume capacity and lobby settings count actual players', async () => {
  const state = {
    code: 'HOST34', ownerId: 'host', status: 'lobby', playerLimit: 5, undercoverCount: 1, blankCardCount: 0,
    wordSource: 'manual', round: 1, ballot: 1, version: 1, updatedAt: Date.now(),
    players: [{ id: 'host', name: '出题人', seat: 0, alive: false, cardReady: true, away: false, hostOnly: true }],
  };
  await rpc('host-user', 'create_game', [state.code, 'host', JSON.stringify(state)]);
  let room = state as typeof state & { players: Array<Record<string, unknown>> };
  for (let index = 1; index <= 3; index += 1) {
    room = (await rpc<{ state: typeof room }>(`guest-user-${index}`, 'join_game_v34', [state.code, `guest${index}`, `玩家${index}`])).state;
  }
  assert.equal(room.players.length, 4);
  assert.equal(room.players.filter((player) => !player.hostOnly).length, 3);
  assert.deepEqual(room.players.slice(1).map((player) => player.seat), [1, 2, 3]);

  const updated = await rpc<{ outcome: string; state: typeof room }>('host-user', 'apply_game_action_v34', [
    state.code, 'lobby-set-001', 'update_lobby_settings', 'lobby', 1, null, room.version,
    JSON.stringify({ playerLimit: 3, undercoverCount: 1, blankCardCount: 0 }),
  ]);
  assert.equal(updated.outcome, 'applied');
  assert.equal(updated.state.playerLimit, 3);

  const conflict = await rpc<{ outcome: string; code: string }>('guest-user-1', 'apply_game_action_v34', [
    state.code, 'lobby-set-001', 'update_lobby_settings', 'lobby', 1, null, room.version,
    JSON.stringify({ playerLimit: 3, undercoverCount: 1, blankCardCount: 0 }),
  ]);
  assert.equal(conflict.outcome, 'rejected');
  assert.equal(conflict.code, 'ACTION_ID_CONFLICT');
  await assert.rejects(rpc('guest-user-4', 'join_game_v34', [state.code, 'guest4', '玩家4']), /room is full/);
});

test('SQL: V1.11 read-only verification is executable and every check passes', async () => {
  const results = await db.query<{ expected_check: string; ok: boolean }>(sql('verify-v11-undercover-manual-host.sql'));
  for (const result of results.rows) assert.equal(result.ok, true, result.expected_check);
});
