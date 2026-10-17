<script setup lang="ts">
// 展示组件索引：21 项（R-VFOBJ-C：常量数组声明在 script，模板 v-for 引用变量名）
import VirRow from '../components/VirRow.vue'
declare const router: { push(path: string): void }

const rows = [
  { name: 'Badge', desc: '徽标', path: '/comp/badge' },
  { name: 'Circle', desc: '环形进度条', path: '/comp/circle' },
  { name: 'Collapse', desc: '折叠面板', path: '/comp/collapse' },
  { name: 'CountDown', desc: '倒计时', path: '/comp/count-down' },
  { name: 'Divider', desc: '分割线', path: '/comp/divider' },
  { name: 'Empty', desc: '空状态', path: '/comp/empty' },
  { name: 'Highlight', desc: '高亮文本', path: '/comp/highlight' },
  { name: 'ImagePreview', desc: '图片预览', path: '/comp/image-preview' },
  { name: 'Lazyload', desc: '懒加载', path: '/comp/lazyload' },
  { name: 'List', desc: '列表', path: '/comp/list' },
  { name: 'NoticeBar', desc: '通知栏', path: '/comp/notice-bar' },
  { name: 'Popover', desc: '气泡弹出框', path: '/comp/popover' },
  { name: 'Progress', desc: '进度条', path: '/comp/progress' },
  { name: 'RollingText', desc: '翻滚文本', path: '/comp/rolling-text' },
  { name: 'Skeleton', desc: '骨架屏', path: '/comp/skeleton' },
  { name: 'Steps', desc: '步骤条', path: '/comp/steps' },
  { name: 'Sticky', desc: '粘性布局', path: '/comp/sticky' },
  { name: 'Swipe', desc: '轮播', path: '/comp/swipe' },
  { name: 'Tag', desc: '标签', path: '/comp/tag' },
  { name: 'TextEllipsis', desc: '文本省略', path: '/comp/text-ellipsis' },
  { name: 'Watermark', desc: '水印', path: '/comp/watermark' },
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
    <p class="foot">展示组件 · 21</p>
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
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 15px 16px;
  border-bottom-width: 0.5px;
  border-bottom-color: #22304a;
  border-bottom-style: solid;
}
.row-name {
  font-size: 15px;
  font-weight: 500;
  color: #e9e6dd;
}
.row-desc {
  flex: 1;
  font-size: 12px;
  color: #6b7693;
  text-align: right;
}
.row-arrow {
  font-size: 15px;
  color: #a8aec2;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
