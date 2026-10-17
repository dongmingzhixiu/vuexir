<script setup lang="ts">
// 基础组件索引：10 项（R-VFOBJ-C：常量数组声明在 script，模板 v-for 引用变量名）
import VirRow from '../components/VirRow.vue'
declare const router: { push(path: string): void }

const rows = [
  { name: 'Button', desc: '按钮', path: '/comp/button' },
  { name: 'Cell', desc: '单元格', path: '/comp/cell' },
  { name: 'ConfigProvider', desc: '全局配置', path: '/comp/config-provider' },
  { name: 'Icon', desc: '图标', path: '/comp/icon' },
  { name: 'Image', desc: '图片', path: '/comp/image' },
  { name: 'Layout', desc: '布局', path: '/comp/layout' },
  { name: 'Popup', desc: '弹出层', path: '/comp/popup' },
  { name: 'Space', desc: '间距', path: '/comp/space' },
  { name: 'Style', desc: '内置样式', path: '/comp/style' },
  { name: 'Toast', desc: '轻提示', path: '/comp/toast' },
] as const
</script>

<template>
  <div class="screen">
    <div class="group">
      <VirRow
        v-for="(item, i) in rows"
        :key="i"
        :name="item.name"
        :desc="item.desc"
        @click="router.push(item.path)"
      />
    </div>
    <p class="foot">基础组件 · 10 项</p>
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: #0a0f1e;
}
.group {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: #0f1832;
  border-width: 1px;
  border-color: #2a3550;
  border-style: solid;
  overflow: hidden;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
