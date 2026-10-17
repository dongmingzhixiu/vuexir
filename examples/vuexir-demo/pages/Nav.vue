<script setup lang="ts">
// 导航组件索引：10 项（R-VFOBJ-C：常量数组声明在 script，模板 v-for 引用变量名）
import VirRow from '../components/VirRow.vue'
declare const router: { push(path: string): void }

const rows = [
  { name: 'ActionBar', desc: '动作栏', path: '/comp/action-bar' },
  { name: 'BackTop', desc: '回到顶部', path: '/comp/back-top' },
  { name: 'Grid', desc: '宫格', path: '/comp/grid' },
  { name: 'IndexBar', desc: '索引栏', path: '/comp/index-bar' },
  { name: 'NavBar', desc: '导航栏', path: '/comp/nav-bar' },
  { name: 'Pagination', desc: '分页', path: '/comp/pagination' },
  { name: 'Sidebar', desc: '侧边导航', path: '/comp/sidebar' },
  { name: 'Tab', desc: '标签页', path: '/comp/tab' },
  { name: 'Tabbar', desc: '标签栏', path: '/comp/tabbar' },
  { name: 'TreeSelect', desc: '分类选择', path: '/comp/tree-select' },
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
    <p class="foot">导航组件 · 10</p>
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
