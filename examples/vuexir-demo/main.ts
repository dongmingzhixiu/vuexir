/**
 * Vuexir Demo · 浏览器标准入口（vue-router 组织页面）
 *
 * 说明：
 *  - 本文件是浏览器侧运行入口（预览器 / 独立 dev server 用）。
 *  - iOS 编译器（gen-ios.ts）只读取 router.ts 引用的 pages/*.vue，
 *    不读取本文件与 App.vue —— 二者不影响原生生成。
 *  - 页面 <script> 遵循编译器约定直接调用 router.push(...)（declare const router），
 *    vue-router 没有全局 router 变量，这里桥接到 window.router 保持零改动兼容。
 */
import { createApp, type App as VueApp } from 'vue';
import { createRouter, createWebHashHistory, type Router } from 'vue-router';
import App from './App.vue';
import { routes } from './router';

export function createVuexirRouter(): Router {
  return createRouter({
    history: createWebHashHistory(),
    // 根路径重定向到开发指南 tab（编译器解析 routes 数组不受影响）
    routes: [{ path: '/', redirect: '/guide' }, ...routes],
  });
}

export function mountApp(el: HTMLElement | string): { app: VueApp; router: Router } {
  const router = createVuexirRouter();
  // 编译器页面约定桥：window.router.push('/x') / back() 在浏览器可运行
  (window as unknown as { router: Router }).router = router as unknown as Router;
  (document as unknown as { __vrnRouter: Router }).__vrnRouter = router;
  const app = createApp(App);
  // 页面组件模板直接调用 router.push（编译器约定 declare const router）：
  // Vue3 模板表达式不会回退到 window 全局，通过 globalProperties 注入使模板可见。
  app.config.globalProperties.router = router;
  app.use(router);
  app.mount(el);
  return { app, router };
}

// 独立运行时自动挂载（#app 容器存在时）
if (typeof document !== 'undefined' && document.querySelector('#app')) {
  mountApp('#app');
}
