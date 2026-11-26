import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mod, { parseWhen } from '../index.mjs';

function boot({ failTimes = 0, ownerQQ = '10001' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reminder-'));
  const state = { timer: null, sends: 0, failed: 0 };
  const api = {
    settings: () => ({ ...mod.defaults }),
    dataDir: (...p) => join(dir, ...p),
    config: () => ({ ownerQQ }),
    log: { info() {}, warn() {}, error() {}, debug() {} },
    tool() {}, defineTool: (t) => t, command() {},
    every(_ms, fn) { state.timer = fn; },
    send: async () => {
      state.sends += 1;
      if (state.failed < failTimes) { state.failed += 1; throw new Error('temporary'); }
      return {};
    },
  };
  const out = mod.setup(api);
  return { out, state, dir };
}

function setDue(dir, count = 1) {
  const file = join(dir, 'state.json');
  const s = JSON.parse(readFileSync(file, 'utf8'));
  for (const r of s.reminds) r.at = Date.now() - 1;
  writeFileSync(file, JSON.stringify(s), 'utf8');
}

const pending = (dir) => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).reminds.length;

test('模块声明', () => {
  assert.equal(mod.id, 'reminder');
  assert.equal(mod.api, 1);
  assert.match(mod.version, /^\d+\.\d+\.\d+$/);
});

test('发送失败时保留提醒，下一轮重试', async () => {
  const { out, state, dir } = boot({ failTimes: 1 });
  await out.setRemind({ text: '测试提醒', when: '1分钟后', chatId: 'private:10001' });
  setDue(dir);
  await state.timer();
  assert.equal(pending(dir), 1, '失败后应保留');
  await state.timer();
  assert.equal(pending(dir), 0, '成功后才删除');
  assert.equal(state.sends, 2);
});

test('发送成功就删除，不会重复发', async () => {
  const { out, state, dir } = boot();
  await out.setRemind({ text: '只发一次', when: '1分钟后', chatId: 'private:10001' });
  setDue(dir);
  await state.timer();
  assert.equal(pending(dir), 0);
  await state.timer();
  assert.equal(state.sends, 1, '第二轮不该再发');
});

test('同一分钟超过 5 条会分批，不整批丢弃', async () => {
  const { out, state, dir } = boot();
  for (let i = 0; i < 7; i += 1) await out.setRemind({ text: `提醒 ${i}`, when: '1分钟后', chatId: 'private:10001' });
  setDue(dir);
  await state.timer();
  assert.equal(pending(dir), 2, '第一批发 5 条，剩余 2 条');
  await state.timer();
  assert.equal(pending(dir), 0, '第二批发完');
  assert.equal(state.sends, 7);
});

test('没有目标时保留并告警，不静默删除', async () => {
  const { out, state, dir } = boot({ ownerQQ: '' });
  await out.setRemind({ text: '没目标', when: '1分钟后', chatId: '' });
  setDue(dir);
  await state.timer();
  assert.equal(pending(dir), 1, '没目标应保留');
  assert.equal(state.sends, 0);
});

test('时间解析仍然可用', () => {
	const base = Date.UTC(2026, 10, 26, 0, 0, 0);
	assert.equal(parseWhen('两小时后', base), base + 2 * 3600_000);
	assert(parseWhen('明天早上', base) > base);
});
