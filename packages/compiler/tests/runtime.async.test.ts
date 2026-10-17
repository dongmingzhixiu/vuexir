import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { generateRuntimeSource, extractFunctions, extractOnMounted, vueToIr } from '../src/transform/vue2ir';

/**
 * R72 Promise 支持：生成的 runtime.js 在「宿主桥」语义下真实执行一遍。
 * 宿主桥（iOS JavaScriptCore 侧同名）：__setState / __nativeFetch / __nativeSetTimeout / __vrnRunTimer
 * 这里用 node:vm 模拟宿主，验证 async/await、fetch Promise、setTimeout、.then 链与状态回写。
 */
function runRuntime(
  script: string,
  handlers: { name: string; params: string; body: string }[],
  onMounted: string | undefined,
  states: { name: string; init: number | string | boolean }[],
) {
  const written: Record<string, unknown> = {};
  const timers = new Map<number, () => void>();
  const host = {
    __setState: (k: string, v: unknown) => {
      written[k] = v;
    },
    // 宿主 fetch：同步回填（Promise 语义仍由 JS 侧 fetch 包装）
    __nativeFetch: (url: string, cb: (ok: boolean, data: unknown) => void) => {
      if (url.includes('list')) cb(true, JSON.stringify(['a', 'b', 'c']));
      else cb(false, 'not found');
    },
    __nativeSetTimeout: (id: number, _ms: number) => {
      timers.set(id, () => (sandbox as { __vrnRunTimer: (i: number) => void }).__vrnRunTimer(id));
    },
    __nativeClearTimeout: (id: number) => timers.delete(id),
    console,
  };
  const sandbox = vm.createContext(host);
  const src = generateRuntimeSource(
    states.map((s) => ({ name: s.name, init: s.init })),
    handlers,
    onMounted,
  );
  vm.runInContext(src, sandbox);
  return { sandbox, written, timers, ctx: sandbox as Record<string, unknown> };
}

/** 走真实管线：SFC → vueToIr（含 ref 提取 / .value → stateStore 重写）→ runtime.js → 宿主执行 */
function runSfc(sfc: string) {
  const r = vueToIr(sfc, { screenId: 'Async' });
  const written: Record<string, unknown> = {};
  const timers = new Map<number, () => void>();
  const host = {
    __setState: (k: string, v: unknown) => {
      written[k] = v;
    },
    __nativeFetch: (url: string, cb: (ok: boolean, data: unknown) => void) => {
      if (url.includes('list')) cb(true, JSON.stringify(['a', 'b', 'c']));
      else cb(false, 'not found');
    },
    __nativeSetTimeout: (id: number, _ms: number) => {
      timers.set(id, () => (sandbox as { __vrnRunTimer: (i: number) => void }).__vrnRunTimer(id));
    },
    __nativeClearTimeout: (id: number) => timers.delete(id),
    console,
  };
  const sandbox = vm.createContext(host);
  vm.runInContext(r.runtime ?? '', sandbox);
  return { sandbox, written, timers, screen: r.screen, warnings: r.warnings };
}

describe('R72 运行时 Promise 支持（生成物真实执行）', () => {
  const SFC = (script: string) => `<template>
  <div class="screen"><p class="t">异步</p></div>
</template>
<script setup>
${script}
</script>
<style>.screen { padding: 10px; background: #0a0f1e; } .t { font-size: 13px; color: #ffffff; }</style>`;

  it('async function 保留 async 关键字（否则 await 让整份 runtime.js 解析失败）', () => {
    const fns = extractFunctions('async function load() {\n  await Promise.resolve(1)\n}');
    expect(fns).toHaveLength(1);
    expect(fns[0].async).toBe(true);
    const src = generateRuntimeSource([], fns, undefined);
    expect(src).toContain('async function load()');
    // 真实解析：丢掉 async 时这里会抛 SyntaxError
    expect(() => vm.runInContext(src, vm.createContext({ Promise }))).not.toThrow();
  });

  it('await fetch(...) + JSON.parse + 状态回写（赋值式 Promise 链）', async () => {
    const { sandbox, written, warnings } = runSfc(SFC(`
const status = ref('idle')
const count = ref(0)
async function load() {
  status.value = 'loading'
  const res = await fetch('https://x/list.json')
  const list = JSON.parse(String(res))
  count.value = list.length
  status.value = 'done'
}`));
    expect(warnings).toEqual([]);
    await (sandbox as Record<string, () => Promise<void>>).load();
    expect(written.count).toBe(3);
    expect(written.status).toBe('done');
    expect((sandbox as { stateStore: { status: string } }).stateStore.status).toBe('done');
  });

  it('.then 链同样回写状态（Promise 链式写法）', async () => {
    const { sandbox, written } = runSfc(SFC(`
const count = ref(0)
function chain() {
  fetch('https://x/list.json').then(function (r) { count.value = JSON.parse(String(r)).length })
}`));
    (sandbox as Record<string, () => void>).chain();
    await new Promise((r) => setTimeout(r, 0));
    expect(written.count).toBe(3);
  });

  it('setTimeout 宿主桥 → 到期回调 JS 并回写状态', () => {
    const { sandbox, written, timers } = runSfc(SFC(`
const status = ref('idle')
function startTimer() {
  setTimeout(function () { status.value = 'timeout' }, 500)
}`));
    (sandbox as Record<string, () => void>).startTimer();
    expect(written.status).toBeUndefined(); // 到期前不写
    expect(timers.size).toBe(1);
    for (const fire of timers.values()) fire(); // 模拟宿主到期
    expect(written.status).toBe('timeout');
  });

  it('await new Promise(resolve => setTimeout(resolve, ms)) → 延时后继续（Promise 与定时器组合）', async () => {
    const { sandbox, written, timers } = runSfc(SFC(`
const ticks = ref(0)
async function start() {
  await new Promise(function (resolve) { setTimeout(resolve, 800) })
  ticks.value = ticks.value + 1
}`));
    const p = (sandbox as Record<string, () => Promise<void>>).start();
    for (const fire of timers.values()) fire();
    await p;
    expect(written.ticks).toBe(1);
  });

  it('onMounted 含 await → IR onMountedAsync + async __onMounted（生命周期内 Promise）', async () => {
    const { sandbox, written, screen } = runSfc(SFC(`
const count = ref(0)
onMounted(async function () {
  await fetch('https://x/list.json')
  count.value = 2
})`));
    expect(screen.onMountedAsync).toBe(true);
    await (sandbox as Record<string, () => Promise<void>>).__onMounted();
    expect(written.count).toBe(2);
  });

  it('fetch 失败 → reject（catch 分支可回写错误态）', async () => {
    const { sandbox, written } = runSfc(SFC(`
const status = ref('idle')
async function load() {
  try { await fetch('https://x/missing.json'); status.value = 'ok' } catch (e) { status.value = 'error' }
}`));
    await (sandbox as Record<string, () => Promise<void>>).load();
    expect(written.status).toBe('error');
  });

  it('handler 表带 async 标记（IR → 双端共享；Android 依此走协程生成）', () => {
    const { screen } = runSfc(SFC(`
const n = ref(0)
async function load() { n.value = 1 }
function sync() { n.value = 2 }`));
    const byName = Object.fromEntries((screen.handlers ?? []).map((h) => [h.name, h]));
    expect(byName.load.async).toBe(true);
    expect(byName.sync.async).toBeUndefined();
  });
});

describe('R96 computed 运行时求值', () => {
  it('状态自足的 computed 注册为求值状态，runtime 里生成 recompute 写回 stateStore', async () => {
    const { vueToIr } = await import('../src/transform/vue2ir');
    const src = `<template><div class="page"><p class="t">{{ greet }} / {{ upper }}</p></div></template>
<script setup>
const greet = ref('你好')
const upper = computed(() => greet.value + ' · 光')
</script>
<style>.page { background: #0b1020; padding: 16px; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'C' });
    const st = (r.screen.state ?? []).find((x) => x.name === 'upper');
    expect(st?.computed).toContain('stateStore.greet');
    expect(r.runtime ?? '').toContain('stateStore.greet + \' · 光\'');
    expect(r.runtime ?? '').toContain('stateStore.upper');
    expect(r.runtime ?? '').toContain('__vrnRecompute()');
  });
});
