<script setup lang="ts">
import { ref } from 'vue'
// Vuexir 基础组件 · Popup 弹出层 —— 底部面板示例（v-if 条件渲染 + handler 状态切换）
const show = ref(false)
function openPopup() {
  show.value = true
}
function closePopup() {
  show.value = false
}
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">基础用法</p>
      <div class="btn btn-primary" @click="openPopup">
        <p class="btn-text">展示弹出层</p>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">Popup 通过 v-if 控制显示，面板从底部升起，点击「关闭」收起。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Popup</p>

    <div v-if="show" class="panel-wrap">
      <div class="panel">
        <div class="panel-head">
          <p class="panel-title">弹出面板</p>
          <div class="panel-close" @click="closePopup">
            <p class="pc">✕</p>
          </div>
        </div>
        <p class="panel-body">这里是弹出层内容区，展示一行说明文字。</p>
        <div class="btn btn-primary" @click="closePopup">
          <p class="btn-text">关闭</p>
        </div>
      </div>
    </div>
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
.btn {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 10px;
  padding: 12px 0;
}
.btn-primary {
  background: #d9b36c;
}
.btn-text {
  font-size: 15px;
  font-weight: medium;
  color: #0a0f1e;
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
.panel-wrap {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: #0f1832;
  border: 1px solid #2a3550;
  padding: 20px 16px 28px 16px;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panel-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.panel-title {
  font-size: 16px;
  font-weight: bold;
  color: #e9e6dd;
}
.panel-close {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}
.pc {
  font-size: 18px;
  color: #a8aec2;
}
.panel-body {
  font-size: 13px;
  color: #a8aec2;
}
</style>
