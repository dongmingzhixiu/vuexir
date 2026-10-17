<script setup lang="ts">
// Vuexir 基础组件 · Icon 图标 —— 图标位展示（符号 + 圆底，不同尺寸与色调）
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">基础图标</p>
      <div class="grid">
        <div class="icon-cell">
          <div class="icon-bg tone-green">
            <p class="icon-sym">✓</p>
          </div>
          <p class="icon-name">success</p>
        </div>
        <div class="icon-cell">
          <div class="icon-bg tone-red">
            <p class="icon-sym">✕</p>
          </div>
          <p class="icon-name">error</p>
        </div>
        <div class="icon-cell">
          <div class="icon-bg tone-gold">
            <p class="icon-sym">★</p>
          </div>
          <p class="icon-name">primary</p>
        </div>
      </div>
      <div class="grid">
        <div class="icon-cell">
          <div class="icon-bg tone-blue">
            <p class="icon-sym">●</p>
          </div>
          <p class="icon-name">info</p>
        </div>
        <div class="icon-cell">
          <div class="icon-bg tone-purple">
            <p class="icon-sym">▶</p>
          </div>
          <p class="icon-name">play</p>
        </div>
        <div class="icon-cell">
          <div class="icon-bg tone-gray">
            <p class="icon-sym">☰</p>
          </div>
          <p class="icon-name">menu</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">尺寸</p>
      <div class="row-gap">
        <div class="card">
          <p class="line">小号图标：★ 用于辅助标注</p>
          <p class="line">中号图标：★ 用于功能入口</p>
          <p class="line">大号图标：★ 用于空状态主视觉</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">图标统一为符号字符 + 圆角底色，编译到原生时映射 SF Symbols。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Icon</p>
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
.grid {
  display: flex;
  flex-direction: row;
  gap: 12px;
}
.icon-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  width: 72px;
}
.icon-bg {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  justify-content: center;
  align-items: center;
}
.tone-green {
  background: #12332c;
}
.tone-red {
  background: #332020;
}
.tone-gold {
  background: #332c17;
}
.tone-blue {
  background: #16213c;
}
.tone-purple {
  background: #2a2038;
}
.tone-gray {
  background: #1c2130;
}
.icon-sym {
  font-size: 20px;
  font-weight: bold;
  color: #e9e6dd;
}
.icon-name {
  font-size: 11px;
  color: #6b7693;
}
.row-gap {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.sym-sm {
  font-size: 13px;
  color: #d9b36c;
}
.sym-md {
  font-size: 17px;
  color: #d9b36c;
}
.sym-lg {
  font-size: 24px;
  color: #d9b36c;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
