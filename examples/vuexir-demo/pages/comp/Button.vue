<script setup lang="ts">
import { ref } from 'vue'
// Vuexir 基础组件 · Button 按钮 —— 类型/尺寸/禁用状态 + 点击计数反馈
const count = ref(0)
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">按钮类型</p>
      <div class="row-gap">
        <div class="btn btn-primary" @click="count++">
          <p class="btn-text">主要按钮</p>
        </div>
        <div class="btn btn-success">
          <p class="btn-text">成功按钮</p>
        </div>
        <div class="btn btn-danger">
          <p class="btn-text">危险按钮</p>
        </div>
        <div class="btn btn-plain">
          <p class="btn-text">次要按钮</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">按钮尺寸</p>
      <div class="row-gap">
        <div class="btn btn-primary btn-lg">
          <p class="btn-text">大尺寸</p>
        </div>
        <div class="btn btn-primary">
          <p class="btn-text">默认</p>
        </div>
        <div class="btn btn-primary btn-sm">
          <p class="btn-text">小尺寸</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">禁用状态</p>
      <div class="row-gap">
        <div class="btn btn-disabled-primary">
          <p class="btn-text-disabled">禁用主要</p>
        </div>
        <div class="btn btn-disabled-plain">
          <p class="btn-text-disabled">禁用次要</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">点击反馈</p>
      <div class="card">
        <p class="card-title">点击主要按钮累计</p>
        <p class="card-value">{{ count }} 次</p>
      </div>
    </div>
    <p class="foot">Vuexir · Button</p>
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
  width:100%;
}
.btn-primary {
  background: #0d6fd1;
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
.btn-lg {
  padding: 15px 0;
}
.btn-sm {
  padding: 8px 0;
}
.btn-disabled-primary {
  background: #2a2f3a;
  border-radius: 10px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 12px 0;
}
.btn-disabled-plain {
  border: 1px solid #2a3550;
  border-radius: 10px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  padding: 12px 0;
}
.btn-text {
  font-size: 15px;
  font-weight: medium;
  color: #0a0f1e;
}
.btn-plain .btn-text {
  color: #e9e6dd;
}
.btn-text-disabled {
  font-size: 15px;
  font-weight: medium;
  color: #6b7693;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f1832;
  border: 1px solid #2a3550;
}
.card-title {
  font-size: 13px;
  color: #a8aec2;
}
.card-value {
  font-size: 24px;
  font-weight: bold;
  color: #d9b36c;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
