<script setup lang="ts">
// Vuexir 基础组件 · Style 内置样式 —— 文本层级 / 边框圆角工具类
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">文本层级</p>
      <div class="card">
        <p class="t-title">标题文本（主标题）</p>
        <p class="t-sub">次级文本（辅助说明）</p>
        <p class="t-body">正文内容，默认字号 14pt，用于常规说明文字。</p>
        <p class="t-muted">弱化文本，用于时间戳与脚注信息。</p>
        <p class="t-gold">强调文本，用于高亮与状态提示。</p>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">圆角样式</p>
      <div class="row-gap">
        <div class="radius-row">
          <div class="r-box r-4"><p class="ph">●</p></div>
          <div class="r-box r-8"><p class="ph">●</p></div>
          <div class="r-box r-14"><p class="ph">●</p></div>
          <div class="r-box r-24"><p class="ph">●</p></div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">内置样式统一语义：title / sub / body / muted / gold 五档文本层级。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Style</p>
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
.t-title {
  font-size: 17px;
  font-weight: bold;
  color: #e9e6dd;
}
.t-sub {
  font-size: 14px;
  font-weight: medium;
  color: #c8c4b8;
}
.t-body {
  font-size: 14px;
  color: #a8aec2;
}
.t-muted {
  font-size: 12px;
  color: #6b7693;
}
.t-gold {
  font-size: 14px;
  font-weight: medium;
  color: #d9b36c;
}
.row-gap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.radius-row {
  display: flex;
  flex-direction: row;
  gap: 10px;
}
.r-box {
  width: 56px;
  height: 56px;
  background: #16213c;
  border: 1px solid #2a3550;
}
.r-4 {
  border-radius: 4px;
}
.r-8 {
  border-radius: 8px;
}
.r-14 {
  border-radius: 14px;
}
.r-24 {
  border-radius: 24px;
}
.line {
  font-size: 13px;
  color: #a8aec2;
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
