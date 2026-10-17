<script setup lang="ts">
// Vuexir 组件库占位页：演示开发中（导航栏标题取路由 meta.title）
</script>

<template>
  <div class="screen">
    <div class="card">
      <p class="title">组件演示开发中</p>
      <p class="desc">该组件已纳入 Vuexir 组件库清单，演示页正在实现中，敬请期待。</p>
    </div>
    <p class="foot">Vuexir 组件库 · 演示</p>
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
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 16px;
  border-radius: 14px;
  background: #0f1832;
  border-width: 1px;
  border-color: #2a3550;
  border-style: solid;
}
.title {
  font-size: 16px;
  font-weight: bold;
  color: #e9e6dd;
}
.desc {
  font-size: 13px;
  color: #a8aec2;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
