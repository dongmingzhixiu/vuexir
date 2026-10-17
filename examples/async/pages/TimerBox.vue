<template>
  <div class="screen">
    <p class="title">定时器 · Promise</p>
    <p class="line">{{ label }}</p>
    <p class="line">{{ ticks }} 次</p>
    <button class="btn" @click="start">开始计时</button>
    <button class="btn" @click="reset">重置</button>
  </div>
</template>
<script setup>
const label = ref('未开始')
const ticks = ref(0)
async function start() {
  label.value = '计时中'
  await new Promise(function (resolve) { setTimeout(resolve, 800) })
  ticks.value = ticks.value + 1
  label.value = '完成一轮'
}
function reset() {
  ticks.value = 0
  label.value = '未开始'
}
onMounted(async function () {
  await new Promise(function (resolve) { setTimeout(resolve, 800) })
  ticks.value = ticks.value + 1
  label.value = '延时完成'
})
</script>
<style>
.screen { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: #0a0f1e; }
.title { font-size: 16px; font-weight: bold; color: #e9e6dd; }
.line { font-size: 13px; color: #a8aec2; }
.btn { padding: 12px; border-radius: 10px; background: #d9b36c; color: #0a0f1e; font-size: 15px; }
</style>
