<script setup lang="ts">
// Vuexir 基础组件：索引 cell 行（name 左 / desc 右对齐 / › 箭头）
defineProps<{ name: string; desc: string }>();
</script>

<template>
  <div class="row">
    <p class="row-name">{{ name }}</p>
    <span class="row-desc">{{ desc }}</span>
    <span class="row-arrow">›</span>
  </div>
</template>

<style scoped>
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
</style>
