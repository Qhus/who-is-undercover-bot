import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { neutralMessageCopy, neutralizeGameCopy } from './neutral-copy.ts';

test('低干扰通知替换明显游戏术语', () => {
  assert.equal(neutralizeGameCopy('发牌失败，请重新投票'), '个人信息失败，请重新提交选择');
  assert.equal(neutralizeGameCopy('玩家已淘汰，查看游戏记录'), '玩家已本轮退出，查看操作记录');
});

test('群聊与私聊模板使用中性文案', () => {
  assert.equal(neutralMessageCopy.selectionOpen(2), 'Round_02 已开放提交选择。');
  assert.equal(neutralMessageCopy.personalReady(7, 8), '个人信息确认进度：7/8 已完成。');
});

test('个人词语不标注玩家角色，命中卧底时明确提示', () => {
  const immersiveSource = readFileSync(new URL('../app/game-app.tsx', import.meta.url), 'utf8');
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(immersiveSource, /你的身份/);
  assert.doesNotMatch(spreadsheetSource, /currentAssignment\.role|查看你的身份和词语/);
  assert.match(immersiveSource, /成功找出卧底/);
  assert.match(spreadsheetSource, /成功找出卧底/);
});

test('表格模式在输入框外完整展示公共规则', () => {
  const spreadsheetSource = readFileSync(new URL('../app/spreadsheet-mode.tsx', import.meta.url), 'utf8');
  assert.match(spreadsheetSource, /sheet-rule-banner/);
  assert.match(spreadsheetSource, /Round_.*公共规则/);
  assert.match(spreadsheetSource, /placeholder="在此填写本轮内容"/);
  assert.doesNotMatch(spreadsheetSource, /placeholder=\{`\$\{getRoundChallenge/);
});
