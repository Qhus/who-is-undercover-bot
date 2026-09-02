import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivacyGuard, type PrivacyScheduler } from './privacy.ts';
import { createCourtRoom } from './court-game.ts';
import { createClueRoom } from './clue-game.ts';
import { readFileSync } from 'node:fs';

const courtAppSource = readFileSync(new URL('../app/court-spreadsheet-mode.tsx', import.meta.url), 'utf8');
const globalStyles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function fakeScheduler() {
  let nextId = 1;
  const callbacks = new Map<number, { callback: () => void; delay: number }>();
  const scheduler: PrivacyScheduler = {
    set(callback, delay) { const id = nextId++; callbacks.set(id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout>; },
    clear(handle) { callbacks.delete(handle as unknown as number); },
  };
  return { scheduler, runDelay: (delay: number) => [...callbacks.values()].find((timer) => timer.delay === delay)?.callback() };
}

test('个人信息显示后会被自动遮挡', () => {
  const visible: boolean[] = [];
  const timers = fakeScheduler();
  const guard = createPrivacyGuard({ scheduler: timers.scheduler, onVisibilityChange: (value) => visible.push(value) });
  guard.reveal();
  assert.equal(visible.at(-1), true);
  timers.runDelay(4_000);
  assert.equal(visible.at(-1), false);
  guard.dispose();
});

test('闲置超时会恢复遮挡', () => {
  const reasons: Array<string | undefined> = [];
  const timers = fakeScheduler();
  const guard = createPrivacyGuard({ scheduler: timers.scheduler, onVisibilityChange: (_value, reason) => reasons.push(reason) });
  timers.runDelay(60_000);
  assert.equal(reasons.at(-1), 'idle');
  guard.dispose();
});

test('Esc 和窗口失焦会立即遮挡', () => {
  const events: Array<string | undefined> = [];
  const guard = createPrivacyGuard({ onVisibilityChange: (_visible, reason) => events.push(reason) });
  guard.reveal();
  guard.mask('escape');
  assert.equal(events.at(-1), 'escape');
  guard.reveal();
  guard.mask('blur');
  assert.equal(events.at(-1), 'blur');
  guard.dispose();
});

test('离谱法堂 V6 公共房间初始状态不包含私密正文、参考答辩、作者映射或选票', () => {
  const room = createCourtRoom('房主', 1, () => 0.2);
  const publicState = JSON.stringify(room);
  for (const privateField of ['statementConfirmedAt', 'responseConfirmedAt', 'referenceStatement', 'referenceResponse', 'submissionId', 'authorId', 'playerVotes']) {
    assert.doesNotMatch(publicState, new RegExp(`"${privateField}"`));
  }
  assert.equal(room.gameType, 'absurd_court');
  assert.equal(room.courtVersion, 6);
});

test('离谱法堂工作表标签可切换且长陈述完整换行', () => {
  for (const sheet of ['成员列表', '案件登记', '陈述记录', '证据附件', '陪审投票', '判决统计', '玩法说明', '操作记录']) {
    assert.match(courtAppSource, new RegExp(`'${sheet}'`));
  }
  assert.match(courtAppSource, /onClick=\{\(\) => setActiveSheet\(id\)\}/);
  assert.match(courtAppSource, /activeSheet !== 'home' \? worksheetRows\(\)/);
  assert.match(globalStyles, /\.court-sheet \.sheet-grid td[\s\S]*white-space:normal/);
  assert.match(globalStyles, /\.court-sheet \.sheet-grid td[\s\S]*overflow-wrap:anywhere/);
});

test('A3 公开房间不包含私密答案、提示草稿或作者映射', () => {
  const room = createClueRoom('房主', 'role_play', 'normal', 1, () => 0.2);
  const publicState = JSON.stringify(room);
  for (const privateField of ['targetWord', 'clueText', 'confirmedAt', 'authorId']) {
    assert.doesNotMatch(publicState, new RegExp(`"${privateField}"`));
  }
  assert.equal(room.gameType, 'clue_king');
  assert.equal(room.clueVersion, 3);
});
