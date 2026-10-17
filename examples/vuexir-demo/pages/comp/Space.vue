<script setup lang="ts">
// Vuexir 基础组件 · Space 间距 —— 水平 / 垂直间距（gap 8 / 12 / 16）
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">水平间距</p>
      <div class="card">
        <p class="line">gap 8：</p>
        <div class="h-row h-8">
          <div class="dot"><p class="ph">●</p></div>
          <div class="dot"><p class="ph">●</p></div>
          <div class="dot"><p class="ph">●</p></div>
          <div class="dot"><p class="ph">●</p></div>
        </div>
        <p class="line">gap 16：</p>
        <div class="h-row h-16">
          <div class="dot"><p class="ph">●</p></div>
          <div class="dot"><p class="ph">●</p></div>
          <div class="dot"><p class="ph">●</p></div>
          <div class="dot"><p class="ph">●</p></div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">垂直间距</p>
      <div class="card">
        <p class="line">gap 8：</p>
        <div class="v-row v-8">
          <div class="block"><p class="ph">●</p></div>
          <div class="block"><p class="ph">●</p></div>
          <div class="block"><p class="ph">●</p></div>
        </div>
        <p class="line">gap 16：</p>
        <div class="v-row v-16">
          <div class="block"><p class="ph">●</p></div>
          <div class="block"><p class="ph">●</p></div>
          <div class="block"><p class="ph">●</p></div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">Space 用于统一元素间距，编译到原生时映射 VStack/HStack 的 spacing。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Space</p>
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
.sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec-title {
  font-size: 13px;
  font-weight: bold;
  color: #a8aec2;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f1832;
  border: 1px solid #2a3550;
}
.line {
  font-size: 13px;
  color: #a8aec2;
}
.h-row {
  display: flex;
  flex-direction: row;
}
.h-8 {
  gap: 8px;
}
.h-16 {
  gap: 16px;
}
.dot {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: #b8965a;
}
.v-row {
  display: flex;
  flex-direction: column;
}
.v-8 {
  gap: 8px;
}
.v-16 {
  gap: 16px;
}
.block {
  height: 20px;
  border-radius: 6px;
  background: #3f8f7e;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
.ph {
  font-size: 10px;
  color: #0a0f1e;
}
</style>
