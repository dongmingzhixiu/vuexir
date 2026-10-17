<template>
  <div class="screen">
    <p class="title">Promise 测试</p>
    <p class="line">{{ status }}</p>
    <p class="line">{{ count }} 条</p>
    <button class="btn" @click="load">加载</button>
    <button class="btn" @click="startTimer">定时器</button>
  </div>
</template>
<script setup>
const status = ref('idle')
const count = ref(0)
async function load() {
  status.value = 'loading'
  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/todos?_limit=3')
    const list = JSON.parse(String(res))
    count.value = list.length
    status.value = 'done'
  } catch (e) {
    status.value = 'error'
  }
}
function startTimer() {
  setTimeout(function () { status.value = 'timeout' }, 500)
}
function chain() {
  fetch('https://example.com/a.json').then(function (r) { count.value = 1 })
}
onMounted(async function () {
  await load()
  status.value = status.value + ' ✓'
})
</script>
<style>
.screen { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: #0a0f1e; }
.title { font-size: 16px; font-weight: bold; color: #e9e6dd; }
.line { font-size: 13px; color: #a8aec2; }
.btn { padding: 12px; border-radius: 10px; background: #d9b36c; color: #0a0f1e; font-size: 15px; }
</style>
