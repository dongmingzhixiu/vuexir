<script setup lang="ts">
// Vuexir 基础组件 · ConfigProvider 全局配置 —— 主题色 / 组件前缀 / 深色模式说明
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">主题色</p>
      <div class="card">
        <p class="card-title">Vuexir 主色</p>
        <div class="swatch-row">
          <div class="swatch swatch-primary"><p class="ph">●</p></div>
          <div class="swatch swatch-gold"><p class="ph">●</p></div>
          <div class="swatch swatch-green"><p class="ph">●</p></div>
          <div class="swatch swatch-red"><p class="ph">●</p></div>
          <div class="swatch swatch-blue"><p class="ph">●</p></div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">组件前缀</p>
      <div class="card">
        <p class="line">组件统一使用 vir 前缀：vir-row、vir-button、vir-cell 等。</p>
        <p class="line">示例：vir-button 对应原生按钮组件。</p>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">深色模式</p>
      <div class="card">
        <p class="line">默认深色主题：背景 #0a0f1e，卡片 #0f1832，主文字 #e9e6dd。</p>
        <p class="line">全局配置控制主题色与默认样式，页面间保持一致。</p>
      </div>
    </div>
    <p class="foot">Vuexir · ConfigProvider</p>
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
.card-title {
  font-size: 14px;
  font-weight: medium;
  color: #e9e6dd;
}
.swatch-row {
  display: flex;
  flex-direction: row;
  gap: 12px;
}
.swatch {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}
.swatch-primary {
  background: #d9b36c;
}
.swatch-gold {
  background: #f5c97b;
}
.swatch-green {
  background: #55d6bc;
}
.swatch-red {
  background: #e56b6b;
}
.swatch-blue {
  background: #5b8dee;
}
.line {
  font-size: 13px;
  color: #a8aec2;
}
.hl {
  color: #d9b36c;
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
