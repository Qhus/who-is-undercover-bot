import assert from 'node:assert/strict';
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

