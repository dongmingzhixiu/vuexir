<script setup lang="ts">
/**
 * PhoneFrame —— 手机壳预览容器（M9+）
 *  - 单页样例（App.vue）直接渲染；多页样例（router.ts）交给 RouterPreview 模拟导航
 *  - Chrome 设备工具栏风格：项目/机型下拉 + 可编辑尺寸 + DPR + 旋转 + 缩放
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import RouterPreview from './RouterPreview.vue';
import type { ScreenEntry } from './main';

const props = defineProps<{
  screens: ScreenEntry[];
  selected: string;
}>();

const DEVICES = [
  { id: 'iphone-17', label: 'iPhone 17', width: 393, height: 840, radius: 55, bezel: 8, status: 'island' },
  { id: 'iphone-16-pro', label: 'iPhone 16 Pro', width: 393, height: 852, radius: 55, bezel: 8, status: 'island' },
  { id: 'iphone-15', label: 'iPhone 15', width: 390, height: 844, radius: 54, bezel: 8, status: 'notch' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, radius: 34, bezel: 7, status: 'none' },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915, radius: 24, bezel: 6, status: 'punch' },
  { id: 'galaxy-s24', label: 'Galaxy S24', width: 384, height: 836, radius: 20, bezel: 5, status: 'punch' },
];

const current = computed(() => props.screens.find((s) => s.name === props.selected) ?? props.screens[0]);

// 机型号：下拉绑定 id，computed 解析设备
const deviceId = ref(DEVICES[0].id);
const device = computed(() => DEVICES.find((d) => d.id === deviceId.value) ?? DEVICES[0]);
// 项目：下拉本地副本，变更时跳转
const selectedLocal = ref(props.selected);
function onScreenChange() {
  goto(selectedLocal.value);
}

// Chrome 风格工具项
const useCustom = ref(false); // 手动尺寸优先于机型
const customW = ref(393);
const customH = ref(852);
const dpr = ref(2);
const rotate = ref(false);
const zoom = ref(1);

function onDeviceChange() {
  useCustom.value = false;
  const d = device.value;
  customW.value = d.width;
  customH.value = d.height;
}

// 尺寸编辑：显示值按旋转映射回 base 宽高（Chrome 行为：旋转后编辑交换尺寸）
function onWInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value) || 0;
  if (rotate.value) customH.value = v;
  else customW.value = v;
  useCustom.value = true;
}
function onHInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value) || 0;
  if (rotate.value) customW.value = v;
  else customH.value = v;
  useCustom.value = true;
}

// 生效宽高（自定义 → 机型；旋转互换）
const baseW = computed(() => (useCustom.value ? customW.value : device.value.width));
const baseH = computed(() => (useCustom.value ? customH.value : device.value.height));
const dispW = computed(() => (rotate.value ? baseH.value : baseW.value));
const dispH = computed(() => (rotate.value ? baseW.value : baseH.value));

function goto(name: string) {
  const url = new URL(location.href);
  url.searchParams.set('screen', name);
  location.href = url.toString();
}

// 供 bundle:// fetch shim 使用：当前样例名
const w = window as unknown as Record<string, string>;
w.__sample = props.selected;

// R80 自适应：窄视口 / 触摸设备（浏览器开手机模式）→ 全屏直出，隐藏手机边框与工具栏占位
const isCompact = ref(false);
const updateCompact = (): void => {
  const narrow = window.innerWidth <= 560;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  isCompact.value = narrow || (coarse && window.innerWidth <= 820);
};
updateCompact();
window.addEventListener('resize', updateCompact);
onBeforeUnmount(() => window.removeEventListener('resize', updateCompact));

// 手机壳整体宽度（含边框），限制不超过视口；旋转时以高度换宽度
const shellWidth = computed(() =>
  isCompact.value ? dispW.value : Math.min(dispW.value + (device.value.bezel + 8) * 2, 430),
);
// 屏体宽度（不含边框）
const screenWidth = computed(() =>
  isCompact.value ? dispW.value : Math.min(dispW.value, 430 - (device.value.bezel + 8) * 2),
);
</script>

<template>
  <div class="stage" :class="{ compact: isCompact }">
    <!-- Chrome 风格设备工具栏 -->
    <div class="chrome-bar">
      <label class="lbl" for="sel-screen">项目</label>
      <select id="sel-screen" v-model="selectedLocal" class="sel" @change="onScreenChange">
        <option v-for="s in screens" :key="s.name" :value="s.name">
          {{ s.name }}{{ s.mode === 'router' ? '（多页）' : '' }}
        </option>
      </select>
      <label class="lbl" for="sel-device">机型</label>
      <select id="sel-device" v-model="deviceId" class="sel" @change="onDeviceChange">
        <option v-for="d in DEVICES" :key="d.id" :value="d.id">{{ d.label }}</option>
        <option value="custom">自定义…</option>
      </select>
      <span class="sep"></span>
      <!-- 尺寸（可编辑，仿 Chrome device toolbar；旋转时显示交换值并写回 base） -->
      <input :value="dispW" class="size-input" aria-label="宽度" @input="onWInput" />
      <span class="times">×</span>
      <input :value="dispH" class="size-input" aria-label="高度" @input="onHInput" />
      <!-- DPR -->
      <select v-model="dpr" class="mini" aria-label="DPR">
        <option :value="1">1x</option>
        <option :value="2">2x</option>
        <option :value="3">3x</option>
      </select>
      <!-- 旋转 -->
      <button class="icon-btn" title="旋转（横竖屏）" @click="rotate = !rotate">↻</button>
      <!-- 缩放 -->
      <select v-model="zoom" class="mini" aria-label="缩放">
        <option :value="0.5">50%</option>
        <option :value="0.75">75%</option>
        <option :value="0.85">85%</option>
        <option :value="1">100%</option>
      </select>
    </div>

    <!-- 手机壳（缩放包裹） -->
    <div class="zoom-wrap" :style="{ transform: isCompact ? `scale(1)` : `scale(${zoom})` }">
      <div class="phone" :style="{
        width: shellWidth + 'px',
        borderRadius: (isCompact ? 0 : device.radius) + 'px',
        padding: isCompact ? '0px' : (device.bezel + 4) + 'px ' + (device.bezel + 4) + 'px ' + (device.bezel + 8) + 'px',
        border: isCompact ? 'none' : undefined,
        boxShadow: isCompact ? 'none' : undefined,
      }">
        <!-- 状态栏（按机型样式） -->
        <div v-if="!isCompact" class="statusbar" :class="device.status">
          <!-- <span v-if="device.status === 'island'" class="island"></span>
          <span v-if="device.status === 'notch'" class="notch"></span>
          <span v-if="device.status === 'punch'" class="punch"></span>
          <template v-if="device.status=='punch'">
            <span class="time">9:41</span>
            <span class="status-icons">ᯤ⁵ᴳ</span>
          </template> -->
        </div>
        <!-- 屏体：按生效宽高比，纵向滚动 -->
        <div class="screen-body" :style="{ width: screenWidth + 'px', aspectRatio: dispW + ' / ' + dispH }">
          <component :is="current.comp" v-if="current.mode === 'single'" />
          <RouterPreview v-else :sample-name="current.name" :router-src="current.routerSrc ?? ''" :has-main="current.hasMain" />
        </div>
        <!-- Home 指示条 -->
        <div class="home-indicator"></div>
      </div>
    </div>
  </div>
</template>
<style>
#vuexir-preview {
  height: 100vh;
  overflow: hidden;
}
</style>
<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 16px 40px;
}

/* R80 紧凑模式（移动浏览器/窄视口）：隐藏设备工具栏与手机边框，屏体铺满整屏 */
.stage.compact {
  gap: 0;
  padding: 0;
}
.stage.compact .chrome-bar {
  display: none;
}
.stage.compact :deep(.shell-frame) {
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  padding: 0;
}
  min-height: 100vh;
  box-sizing: border-box;
  overflow: hidden;
  height: 100%;
}

/* ---- Chrome 风格工具栏 ---- */
.chrome-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  background: #151b2c;
  border: 1px solid rgba(217, 179, 108, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
  max-width: 100%;
}

.lbl {
  font-size: 12px;
  color: #8b93a8;
}

.sel,
.mini {
  background: #0f1524;
  color: #e9e6dd;
  border: 1px solid rgba(217, 179, 108, 0.35);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.sel:focus,
.mini:focus {
  border-color: #d9b36c;
}

.sel option,
.mini option {
  background: #0f1524;
  color: #e9e6dd;
}

.sep {
  width: 1px;
  height: 22px;
  background: rgba(217, 179, 108, 0.25);
  margin: 0 4px;
}

.size-input {
  width: 46px;
  background: #0f1524;
  color: #e9e6dd;
  border: 1px solid rgba(217, 179, 108, 0.35);
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  text-align: center;
  outline: none;
}

.size-input:focus {
  border-color: #d9b36c;
}

.times {
  color: #8b93a8;
  font-size: 12px;
}

.icon-btn {
  background: #0f1524;
  color: #e9e6dd;
  border: 1px solid rgba(217, 179, 108, 0.35);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 14px;
  cursor: pointer;
  line-height: 1.2;
}

.icon-btn:hover {
  border-color: #d9b36c;
  color: #d9b36c;
}

/* ---- 手机壳 ---- */
.zoom-wrap {
  transform-origin: top center;
}

.phone {
  background: #1b1e2a;
  border: 1px solid rgba(217, 179, 108, 0.16);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 20px 8px;
  font-size: 13px;
  color: #efeadd;
  position: relative;
  height: 24px;
  box-sizing: border-box;
}

.statusbar .time {
  width: 44px;
  text-align: left;
}

.status-icons {
  width: 44px;
  text-align: right;
}

/* 灵动岛 */
.island {
  position: absolute;
  /* left: calc(50% - 55px);
  top: 4px;
  width: 110px;
  height: 6px;
  background: #000;
  border-radius: 16px; */
}

/* 刘海 */
.notch {
  position: absolute;
  left: calc(50% - 60px);
  top: 0;
  width: 120px;
  height: 20px;
  background: #000;
  border-radius: 0 0 14px 14px;
}

/* 打孔 */
.punch {
  position: absolute;
  left: calc(50% - 10px);
  top: 5px;
  width: 20px;
  height: 20px;
  background: #000;
  border-radius: 50%;
}

.screen-body {
  margin: 0 auto;
  border-radius: 28px;
  overflow-y: auto;
  overflow-x: hidden;
  background: #04060d;
  scrollbar-width: none;
}

.screen-body::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.home-indicator {
  width: min(120px, 40%);
  height: 4px;
  border-radius: 2px;
  background: rgba(239, 234, 221, 0.35);
  margin: 10px auto 0;
}
</style>
