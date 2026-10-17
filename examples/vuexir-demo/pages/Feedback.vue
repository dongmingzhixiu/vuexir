<script setup lang="ts">
// 反馈组件索引：12 项（R-VFOBJ-C：常量数组声明在 script，模板 v-for 引用变量名）
import VirRow from '../components/VirRow.vue'
declare const router: { push(path: string): void }

const rows = [
  { name: 'ActionSheet', desc: '动作面板', path: '/comp/action-sheet' },
  { name: 'Barrage', desc: '弹幕', path: '/comp/barrage' },
  { name: 'Dialog', desc: '弹出框', path: '/comp/dialog' },
  { name: 'DropdownMenu', desc: '下拉菜单', path: '/comp/dropdown-menu' },
  { name: 'FloatingPanel', desc: '浮动面板', path: '/comp/floating-panel' },
  { name: 'FloatingBubble', desc: '浮动气泡', path: '/comp/floating-bubble' },
  { name: 'Loading', desc: '加载', path: '/comp/loading' },
  { name: 'Notify', desc: '消息通知', path: '/comp/notify' },
  { name: 'Overlay', desc: '遮罩层', path: '/comp/overlay' },
  { name: 'PullRefresh', desc: '下拉刷新', path: '/comp/pull-refresh' },
  { name: 'ShareSheet', desc: '分享面板', path: '/comp/share-sheet' },
  { name: 'SwipeCell', desc: '滑动单元格', path: '/comp/swipe-cell' },
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
    <p class="foot">反馈组件 · 12</p>
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
