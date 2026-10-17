/**
 * preview/main.ts —— 浏览器预览入口（M9：支持单页 + 多页 router 两种样例）
 *
 * 职责：
 *   1. 运行时扫描 compiler/samples（GET /__screens 实时返回 name + mode）
 *   2. 单页样例（App.vue）→ 手机壳直接渲染
 *   3. 多页样例（router.ts）→ RouterPreview 模拟 tab / push / 返回 + window.router shim
 *   4. 手机壳支持多种机型规格尺寸切换（iPhone 16 Pro / 15 / SE / Pixel 8 …）
 *
 * 用法：
 *   npm run dev
 *   打开 http://localhost:5179/?screen=<name>
 *   （screen 省略时默认第一个样例）
 *
 * 说明：新增样例目录后只需刷新预览页（/__screens 每次请求实时扫描）。
 * 浏览器预览只验证「Vue 表达」是否正确；原生还原度以模拟器截图为准。
 */
import { createApp } from 'vue';
import PhoneFrame from './PhoneFrame.vue';

export interface ScreenEntry {
  name: string;
  mode: 'single' | 'router';
  comp?: unknown;
  routerSrc?: string;
  hasMain?: boolean;
}

async function loadScreens(): Promise<ScreenEntry[]> {
  const { screens } = (await fetch('/__screens').then((r) => r.json())) as {
    screens: { name: string; mode: 'single' | 'router'; hasMain?: boolean }[];
  };
  return Promise.all(
    screens.map(async (s) => {
      if (s.mode === 'single') {
        // 经 /__comp 重定向到 /@fs 模块 URL（root 外裸相对路径不会被 vite 预扫描）
        const mod = await import(`/__comp?name=${encodeURIComponent(s.name)}&file=App.vue`);
        const comp = mod.default;
        return { name: s.name, mode: 'single', comp, hasMain: s.hasMain };
      }
      const routerSrc = await fetch(`/__router?name=${s.name}`).then((r) => r.text());
      return { name: s.name, mode: 'router', routerSrc, hasMain: s.hasMain };
    }),
  );
}

const screens = await loadScreens();
const param = new URLSearchParams(location.search).get('screen');
const selected = screens.find((s) => s.name === param) ?? screens[0];

// 样例 bundle:// 资源协议 → /__asset 桥（books.json 等）。
// 注意：编译器 QuickJS 的 fetch 桥 resolve 为「字符串」而非 Response，
// 页面用 JSON.parse(String(data)) 解析——预览 shim 必须同语义返回 text。
// 当前样例名由 PhoneFrame 通过 window.__sample 维护
const origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('bundle://')) {
    const file = input.slice('bundle://'.length);
    const sample = (window as unknown as Record<string, string>).__sample ?? '';
    return fetch(`/__asset?name=${encodeURIComponent(sample)}&file=${encodeURIComponent(file)}`, init).then(
      (r) => r.text(),
    ) as Promise<Response>;
  }
  return origFetch(input, init);
}) as typeof fetch;

createApp(PhoneFrame, { screens, selected: selected.name }).mount('#vuexir-preview');
