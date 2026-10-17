<script setup lang="ts">
const count = ref(0)
function inc() { count.value = count.value + 1 }
</script>

<template>
  <div class="screen">
    <p class="title">Hello vuexir</p>
    <p class="line">计数：{{ count }} 次</p>
    <button class="btn" @click="inc">点我 +1</button>
  </div>
</template>

<style>
.screen { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: #0a0f1e; }
.title { font-size: 18px; font-weight: bold; color: #f5e9c8; }
.line { font-size: 14px; color: #a8aec2; }
.btn { padding: 12px; border-radius: 10px; background: #d9b36c; color: #0a0f1e; font-size: 15px; }
</style>
