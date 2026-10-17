<script setup lang="ts">
const items = ref(['写 Vue SFC', '编译成原生源码', '双端 SwiftUI / Compose'])
</script>

<template>
  <div class="screen">
    <p class="title">关于</p>
    <div class="card" v-for="(item, i) in items" :key="i">
      <p class="line">{{ item }}</p>
    </div>
  </div>
</template>

<style>
.screen { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: #0a0f1e; }
.title { font-size: 18px; font-weight: bold; color: #f5e9c8; }
.card { padding: 14px; border-radius: 12px; background: #0f1832; }
.line { font-size: 14px; color: #e9e6dd; }
</style>
