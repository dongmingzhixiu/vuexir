<script setup lang="ts">
/**
 * RouterPreview —— 多页样例（router.ts）浏览器预览容器
 *
 * 职责：
 *  1. 解析 router.ts：import 表 + routes 表（path/name/title/tab/component 路径）
 *  2. 模拟原生导航：tab 切换（底部栏）+ push 栈（详情页）+ 返回
 *  3. 安装 window.router shim：页面 <script> 里 declare const router 后调用
 *     router.push('/x') / router.back() 在浏览器里可运行（编译器 JS 子集一致）
 */
import { ref, shallowRef, onMounted, computed, onBeforeUnmount, type Component, type App as VueApp } from 'vue';

const props = defineProps<{
  sampleName: string;
  routerSrc: string;
  hasMain?: boolean;
}>();

interface RouteEntry {
  path: string;
  name: string;
  title: string;
  tab: boolean;
  compPath: string;
}

function parseRouter(src: string): RouteEntry[] {
  const imports: Record<string, string> = {};
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'([^']+)'/g)) {
    imports[m[1]] = m[2];
  }
  const block = src.match(/const\s+routes\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const routes: RouteEntry[] = [];
  for (const m of block.matchAll(/\{\s*path:\s*'([^']+)'[\s\S]*?component:\s*(\w+)[\s\S]*?meta:\s*\{([^}]*)\}/g)) {
    const meta = m[3];
    routes.push({
      path: m[1],
      name: m[2],
      title: meta.match(/title:\s*'([^']*)'/)?.[1] ?? m[2],
      tab: /tab:\s*true/.test(meta),
      compPath: imports[m[2]] ?? '',
    });
  }
  return routes;
}

const routes = parseRouter(props.routerSrc);
const tabs = routes.filter((r) => r.tab);
const pushes = routes.filter((r) => !r.tab);

const selectedTab = ref(tabs[0]?.path ?? '');
const stack = ref<string[]>([]);
const comps = shallowRef<Record<string, Component>>({});

async function loadComp(path: string): Promise<Component | null> {
  const r = routes.find((x) => x.path === path);
  if (!r || !r.compPath) return null;
  if (comps.value[path]) return comps.value[path];
  try {
    const mod = await import(
      `/__comp?name=${encodeURIComponent(props.sampleName)}&file=${encodeURIComponent(r.compPath.slice(2))}`
    );
    comps.value = { ...comps.value, [path]: mod.default };
    return mod.default;
  } catch {
    return null;
  }
}

const currentPath = computed(() => (stack.value.length ? stack.value[stack.value.length - 1] : selectedTab.value));
const currentComp = computed(() => comps.value[currentPath.value]);

function push(path: string) {
  if (!routes.find((r) => r.path === path)) return;
  stack.value = [...stack.value, path];
  void loadComp(path);
}
function back() {
  stack.value = stack.value.slice(0, -1);
}
function gotoTab(path: string) {
  selectedTab.value = path;
  void loadComp(path);
}

const vueroot = ref<HTMLElement | null>(null);
let mountedApp: { app: VueApp } | null = null;

async function mountVueRouter(): Promise<boolean> {
  if (!props.hasMain || !vueroot.value) return false;
  try {
    const mod = await import(
      `/__comp?name=${encodeURIComponent(props.sampleName)}&file=main.ts`
    );
    if (typeof mod.mountApp === 'function') {
      const m = mod.mountApp(vueroot.value);
      mountedApp = m;
      // 兜底：确保页面组件 declare const router 可运行（与编译器 runtime.js 桥同形）
      (window as unknown as Record<string, unknown>).router = m.router;
      return true;
    }
  } catch (e) {
    console.warn('[RouterPreview] vue-router 挂载失败，回退模拟导航:', e);
  }
  return false;
}

onMounted(async () => {
  if (await mountVueRouter()) return;
  // window.router shim：与编译器 runtime.js 的 router 桥同形（push/back）
  (window as unknown as Record<string, unknown>).router = { push, back };
  void loadComp(tabs[0]?.path ?? '');
});

onBeforeUnmount(() => {
  if (mountedApp) {
    mountedApp.app.unmount();
    mountedApp = null;
  }
});

const tabIndex = computed(() => Math.max(0, tabs.findIndex((t) => t.path === selectedTab.value)));
const stackCount = computed(() => stack.value.length);
</script>

<template>
  <div class="rp-root">
    <!-- vue-router 模式：标准 Vue 应用（App.vue 自带 tabbar + router-view） -->
    <div v-if="hasMain" ref="vueroot" class="rp-vueroot" />

    <!-- 模拟导航模式 -->
    <template v-else>
    <!-- push 栈顶页（详情）：顶部模拟系统返回条 -->
    <div v-if="stackCount > 0" class="rp-nav">
      <button class="rp-back" @click="back">← 返回</button>
    </div>
    <div v-if="stackCount > 0" class="rp-page">
      <component :is="currentComp" v-if="currentComp" />
      <p v-else class="rp-loading">加载中…</p>
    </div>

    <!-- tab 容器 -->
    <div v-else class="rp-tab-root">
      <div class="rp-page">
        <component :is="currentComp" v-if="currentComp" />
        <p v-else class="rp-loading">加载中…</p>
      </div>
      <div v-if="tabs.length > 1" class="rp-tabbar">
        <button
          v-for="(t, i) in tabs"
          :key="t.path"
          class="rp-tab"
          :class="{ active: i === tabIndex }"
          @click="gotoTab(t.path)"
        >
          {{ t.title }}
        </button>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.rp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}
.rp-vueroot {
  height: 100%;
  overflow: hidden;
}
.rp-tab-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.rp-nav {
  flex-shrink: 0;
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: rgba(16, 24, 42, 0.98);
  border-bottom: 1px solid rgba(217, 179, 108, 0.2);
}
.rp-back {
  border: none;
  background: transparent;
  color: #d9b36c;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 10px;
}
.rp-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.rp-tabbar {
  display: flex;
  flex-direction: row;
  height: 56px;
  background: #10182a;
  border-top: 1px solid rgba(217, 179, 108, 0.2);
  flex-shrink: 0;
}
.rp-tab {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #a8aec2;
  cursor: pointer;
}
.rp-tab.active {
  color: #d9b36c;
  font-weight: 600;
}
.rp-loading {
  font-size: 13px;
  color: #5b6478;
  text-align: center;
  padding: 40px 0;
}
</style>
