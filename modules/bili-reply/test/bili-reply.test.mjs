import test from 'node:test';
import assert from 'node:assert/strict';
import mod from '../index.mjs';

function boot(settings = {}, { replies = [] } = {}) {
  const calls = { think: 0, replies: 0 };
  const api = {
    settings: () => ({ ...mod.defaults, dynamicIds: 'https://t.bilibili.com/123456789', ...settings }),
    dataDir: () => process.env.TEMP || '.',
    config: () => ({ bili: { cookie: 'SESSDATA=x; bili_jct=y', sessdata: 'x', biliJct: 'y' }, ownerQQ: '1' }),
    log: { info() {}, warn() {}, error() {}, debug() {} },
    every: () => {}, route: () => {}, command: () => {}, rule: () => {}, tool: () => {},
    defineTool: (t) => t,
    use: () => null,
    core: { http: { body: async () => ({}) }, hub: { resetChat() {} } },
    think: async () => { calls.think += 1; return '一条回复'; },
    ask: async () => { calls.think += 1; return '一条回复'; },
    send: async () => { calls.replies += 1; return {}; },
  };
  // 假网关：登录校验 + 读评论；发回复被调用说明安全失效
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const s = String(url);
    if (s.includes('/x/web-interface/nav')) return { json: async () => ({ data: { isLogin: true, mid: 42 } }) };
    if (s.includes('/x/v2/reply?')) {
      return { json: async () => ({ code: 0, data: { replies: replies.map((r, i) => ({ rpid: String(100 + i), member: { mid: 7, uname: '路人' }, content: { message: r } })) } }) };
    }
    if (s.includes('/x/v2/reply/add')) { calls.replies += 1; return { json: async () => ({ code: 0, data: { rpid: 1 } }) }; }
    throw new Error('unexpected URL: ' + s);
  };
  const out = mod.setup(api);
  return { out, calls, restore: () => { globalThis.fetch = oldFetch; } };
}

test('模块声明', () => {
  assert.equal(mod.id, 'bili-reply');
  assert.equal(mod.api, 1);
  assert.match(mod.version, /^\d+\.\d+\.\d+$/);
});

test('默认设置是只读不回', () => {
  assert.equal(mod.defaults.dryRun, true);
});

test('定时巡检遵守 dryRun：只读评论，不写回复', async () => {
  const { out, calls, restore } = boot({ dryRun: true }, { replies: ['你好'] });
  try {
    const r = await out.scheduledRun();
    assert.equal(r.ok, true);
    assert.match(r.message, /试运行|没回/);
    assert.equal(calls.think, 0, 'dry 模式不应生成回复');
    assert.equal(calls.replies, 0, 'dry 模式不应发回复');
  } finally {
    restore();
  }
});

test('关掉 dryRun 后定时巡检才真的回', async () => {
  const { out, calls, restore } = boot({ dryRun: false, minGapMinutes: 0, maxPerDay: 5 }, { replies: ['你好'] });
  try {
    const r = await out.scheduledRun();
    assert.equal(r.ok, true);
    assert.equal(calls.replies, 1, '关掉试运行应当发一条');
  } finally {
    restore();
  }
});

test('导出 scheduledRun 供宿主/测试调用', () => {
  const { out, restore } = boot({}, {});
  try {
    assert.equal(typeof out.scheduledRun, 'function');
  } finally {
    restore();
  }
});