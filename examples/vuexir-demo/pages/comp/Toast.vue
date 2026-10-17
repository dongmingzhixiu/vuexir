<script setup lang="ts">
import { ref } from 'vue'
// Vuexir 基础组件 · Toast 轻提示 —— 三种类型提示条 + 点击切换（v-if + handler）
const toast = ref('')
function showSuccess() {
  toast.value = 'success'
}
function showError() {
  toast.value = 'error'
}
function showInfo() {
  toast.value = 'info'
}
function hideToast() {
  toast.value = ''
}
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">提示类型</p>
      <div class="row-gap">
        <div class="btn btn-success" @click="showSuccess">
          <p class="btn-text">成功提示</p>
        </div>
        <div class="btn btn-danger" @click="showError">
          <p class="btn-text">失败提示</p>
        </div>
        <div class="btn btn-plain" @click="showInfo">
          <p class="btn-text">普通提示</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">Toast 为轻提示，点击按钮触发，点击提示条收起。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Toast</p>

    <div v-if="toast === 'success'" class="toast toast-success" @click="hideToast">
      <p class="toast-text">✓ 操作成功</p>
    </div>
    <div v-if="toast === 'error'" class="toast toast-error" @click="hideToast">
      <p class="toast-text">✕ 操作失败</p>
    </div>
    <div v-if="toast === 'info'" class="toast toast-info" @click="hideToast">
      <p class="toast-text">ℹ 普通提示</p>
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
.row-gap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 10px;
  padding: 12px 0;
}
.btn-success {
  background: #55d6bc;
}
.btn-danger {
  background: #e56b6b;
}
.btn-plain {
  border: 1px solid #2a3550;
}
.btn-text {
  font-size: 15px;
  font-weight: medium;
  color: #0a0f1e;
}
.btn-plain .btn-text {
  color: #e9e6dd;
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
.toast {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: 14px;
  padding: 12px 0;
}
.toast-success {
  background: #12332c;
  border: 1px solid #55d6bc;
}
.toast-error {
  background: #332020;
  border: 1px solid #e56b6b;
}
.toast-info {
  background: #332c17;
  border: 1px solid #d9b36c;
}
.toast-text {
  font-size: 15px;
  font-weight: medium;
  color: #e9e6dd;
}
</style>
