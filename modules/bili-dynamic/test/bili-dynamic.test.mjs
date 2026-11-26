import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mod from '../index.mjs';

function boot(settings = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bili-dynamic-'));
  const api = {
    settings: () => ({ ...mod.defaults, ...settings }),
    dataDir: (...p) => join(dir, ...p),
    config: () => ({ bili: { enabled: true, cookie: 'SESSDATA=x; bili_jct=y', sessdata: 'x', biliJct: 'y' }, ownerQQ: '1' }),
    log: { info() {}, warn() {}, error() {}, debug() {} },
    every: () => {}, route: () => {}, command: () => {}, rule: () => {}, tool: () => {},
    defineTool: (t) => t,
    use: () => null,
    think: async () => '一条测试动态',
    core: { http: { body: async () => ({}) }, hub: {} },
  };
  return mod.setup(api);
}

test('模块声明', () => {
  assert.equal(mod.id, 'bili-dynamic');
  assert.equal(mod.api, 1);
  assert.match(mod.version, /^\d+\.\d+\.\d+$/);
});

test('status 带醒着时段，方便面板显示', () => {
  const out = boot({ awakeFrom: 9, awakeTo: 22 });
  const st = out.status();
  assert.equal(st.awake.from, 9);
  assert.equal(st.awake.to, 22);
  assert.equal(st.left, mod.defaults.maxPerDay);
});

test('每日额度用完后，手动 postNow 也要拦住', async () => {
	const out = boot({ maxPerDay: 0 });
	await assert.rejects(() => out.postNow('测试'), /发够了/);
});

test('额度没用完时不拦', async () => {
  const out = boot({ maxPerDay: 2 });
  await assert.rejects(() => out.postNow('测试'), (error) => !/发够了/.test(error.message));
});
