/**
 * preview/main.ts —— 浏览器预览入口（M9：支持单页 + 多页 router 两种样例）
 *
 * 职责：
 *   1. 运行时向宿主 dev server 取页面清单（GET /__vrn/screens，实时返回 name + mode）
 *   2. 单页样例（App.vue）→ 手机壳直接渲染
 *   3. 多页样例（router.ts）→ RouterPreview 模拟 tab / push / 返回 + window.router shim
 *   4. 手机壳支持多种机型规格尺寸切换（iPhone 16 Pro / 15 / SE / Pixel 8 …）
 *
 * 用法：
 *   npm run dev
 *   打开 http://localhost:5179/?screen=<name>
 *   （screen 省略时默认第一个样例）
 *
 * 说明：新增页面后只需刷新预览页（/__vrn/screens 每次请求实时扫描）。
 * 本文件随 @dongmingzhixiu/vuexir-vite-plugin 发布：插件挂载 GET /__vrn/ 即用，
 * 也可自行 import { mountPreview } 挂到任意容器。
 * 浏览器预览只验证「Vue 表达」是否正确；原生还原度以模拟器截图为准。
 */
import { createApp } from 'vue';
import PhoneFrame from './PhoneFrame.vue';
import { VRN_API_BASE } from './api';

export interface ScreenEntry {
  name: string;
  mode: 'single' | 'router';
  comp?: unknown;
  routerSrc?: string;
  hasMain?: boolean;
}

async function importSinglePage(name: string): Promise<{ default: unknown }> {
  // 单页工程：页面即入口（App.vue 为兼容旧样例的兜底）
  for (const file of [`${name}.vue`, 'App.vue']) {
    try {
      return await import(`${VRN_API_BASE}/page?name=${encodeURIComponent(name)}&file=${encodeURIComponent(file)}`);
    } catch {
      /* 试下一个候选 */
    }
  }
  throw new Error(`预览无法加载页面：${name}`);
}

async function loadScreens(): Promise<ScreenEntry[]> {
  const { screens } = (await fetch(`${VRN_API_BASE}/screens`).then((r) => r.json())) as {
    screens: { name: string; mode: 'single' | 'router'; hasMain?: boolean }[];
  };
  return Promise.all(
    screens.map(async (s) => {
      if (s.mode === 'single') {
        // 经 {base}/page 重定向到 /@fs 模块 URL（root 外裸相对路径不会被 vite 预扫描）
        const mod = await importSinglePage(s.name);
        return { name: s.name, mode: 'single', comp: mod.default, hasMain: s.hasMain };
      }
      const routerSrc = await fetch(`${VRN_API_BASE}/router?name=${s.name}`).then((r) => r.text());
      return { name: s.name, mode: 'router', routerSrc, hasMain: s.hasMain };
    }),
  );
}

/** 挂载预览器到容器（默认 #vrn-preview / #vuexir-preview） */
export async function mountPreview(selector = '#vrn-preview'): Promise<void> {
  const screens = await loadScreens();
  const param = new URLSearchParams(location.search).get('screen');
  const selected = screens.find((s) => s.name === param) ?? screens[0];
  if (!selected) {
    document.querySelector(selector)!.textContent = '未发现可预览页面（检查 vrn 插件 pagesDir / entry 配置）';
    return;
  }
  createApp(PhoneFrame, { screens, selected: selected.name }).mount(selector);
}

// 样例 bundle:// 资源协议 → /__asset 桥（books.json 等）。
// 注意：编译器 QuickJS 的 fetch 桥 resolve 为「字符串」而非 Response，
// 页面用 JSON.parse(String(data)) 解析——预览 shim 必须同语义返回 text。
// 当前样例名由 PhoneFrame 通过 window.__sample 维护
const origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('bundle://')) {
    const file = input.slice('bundle://'.length);
    const sample = (window as unknown as Record<string, string>).__sample ?? '';
    return fetch(`${VRN_API_BASE}/asset?name=${encodeURIComponent(sample)}&file=${encodeURIComponent(file)}`, init).then(
      (r) => r.text(),
    ) as Promise<Response>;
  }
  return origFetch(input, init);
}) as typeof fetch;

// 作为 /__vrn/ 页面入口直接执行；作为库被 import 时只导出 mountPreview
if (typeof document !== 'undefined' && (document.getElementById('vrn-preview') || document.getElementById('vuexir-preview'))) {
  void mountPreview(document.getElementById('vrn-preview') ? '#vrn-preview' : '#vuexir-preview');
}
