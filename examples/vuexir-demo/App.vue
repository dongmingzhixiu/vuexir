<!--
  Vuexir Demo · 根组件（vue-router 组织页面）
  浏览器侧运行使用；iOS 编译器不读取本文件。
  深色鎏金主题与 pages/* 保持一致（#0a0f1e / #0f1832 / #d9b36c / #a8aec2）。
-->
<template>
  <div class="vrn-root">
    <!-- 内容区：当前路由页面（tab 页 / 详情页） -->
    <div class="vrn-content">
      <router-view />
    </div>
    <!-- 底部 tab 栏：仅 meta.tab 路由（开发指南/基础/表单/反馈/展示/导航/业务） -->
    <div v-if="tabs.length > 1" class="vrn-tabbar">
      <div
        v-for="t in tabs"
        :key="t.path"
        class="vrn-tab"
        :class="{ active: isActive(t.path) }"
        @click="router.push(t.path)"
      >
        <span class="vrn-tab-dot" />
        <span class="vrn-tab-label">{{ tabTitle(t) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter, useRoute, type Router } from 'vue-router';
import { routes } from './router';

const router = useRouter();
const route = useRoute();

// 主 world 桥：页面组件遵循编译器约定直接调用 router.push（declare const router），
// 在此把 vue-router 实例挂到 window.router，保证组件内 router.push 可运行。
onMounted(() => {
  (window as unknown as { router: Router }).router = router;
  (document as unknown as { __vrnRouter: Router }).__vrnRouter = router;
});

type RouteEntry = (typeof routes)[number];
const tabs = computed(() => routes.filter((r) => (r.meta as { tab?: boolean }).tab));
const tabTitle = (r: RouteEntry) => (r.meta as { title?: string }).title ?? '';
const isActive = (path: string) => route.path === path;
</script>

<style>
html,
body {
  margin: 0;
  padding: 0;
  background: #0a0f1e;
}

.vrn-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0f1e;
}

.vrn-content {
  flex: 1;
  overflow-y: auto;
}

.vrn-tabbar {
  display: flex;
  height: 56px;
  flex-shrink: 0;
  border-top: 1px solid rgba(217, 179, 108, 0.22);
  background: #0a0f1e;
}

.vrn-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 4px;
}

.vrn-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: transparent;
}

.vrn-tab.active .vrn-tab-dot {
  background: #d9b36c;
}

.vrn-tab-label {
  font-size: 11px;
  color: #a8aec2;
}

.vrn-tab.active .vrn-tab-label {
  color: #d9b36c;
  font-weight: 600;
}
</style>
