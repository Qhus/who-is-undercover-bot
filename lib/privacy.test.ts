import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrivacyGuard, type PrivacyScheduler } from './privacy.ts';
import { createCourtRoom } from './court-game.ts';
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

test('离谱法堂 V7 公共房间初始状态不包含招式、质询目标、私密正文或选票', () => {
  const room = createCourtRoom('房主', 1, () => 0.2);
  const publicState = JSON.stringify(room);
  for (const privateField of ['tacticId', 'tacticInstruction', 'questionTargetSubmissionId', 'receivedQuestion', 'statementConfirmedAt', 'responseConfirmedAt', 'submissionId', 'authorId', 'playerVotes']) {
    assert.doesNotMatch(publicState, new RegExp(`"${privateField}"`));
  }
  assert.equal(room.gameType, 'absurd_court');
  assert.equal(room.courtVersion, 7);
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
