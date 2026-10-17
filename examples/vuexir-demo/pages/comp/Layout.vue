<script setup lang="ts">
// Vuexir 基础组件 · Layout 布局 —— 两栏 / 三栏 / 混合栅格（flex 宽度分配）
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">两栏布局</p>
      <div class="row-gap">
        <div class="bar-row">
          <div class="bar bar-half">
            <p class="bar-text">50%</p>
          </div>
          <div class="bar bar-half bar-alt">
            <p class="bar-text">50%</p>
          </div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">三栏布局</p>
      <div class="row-gap">
        <div class="bar-row">
          <div class="bar bar-third">
            <p class="bar-text">33%</p>
          </div>
          <div class="bar bar-third bar-alt">
            <p class="bar-text">33%</p>
          </div>
          <div class="bar bar-third">
            <p class="bar-text">33%</p>
          </div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">混合布局</p>
      <div class="row-gap">
        <div class="bar-row">
          <div class="bar bar-quarter">
            <p class="bar-text">25%</p>
          </div>
          <div class="bar bar-mid bar-alt">
            <p class="bar-text">50%</p>
          </div>
          <div class="bar bar-quarter">
            <p class="bar-text">25%</p>
          </div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">Layout 基于 flex 实现栅格，子元素按宽度占比自动分配空间。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Layout</p>
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
.row-gap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar-row {
  display: flex;
  flex-direction: row;
  gap: 8px;
}
.bar {
  border-radius: 10px;
  justify-content: center;
  align-items: center;
  padding-top: 16px;
  padding-bottom: 16px;
  background: #16213c;
}
.bar-alt {
  background: #1c2a4a;
}
.bar-half {
  flex: 1;
}
.bar-third {
  flex: 1;
}
.bar-quarter {
  flex: 1;
}
.bar-text {
  font-size: 12px;
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
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>

.bar-mid {
  flex: 2;
}
