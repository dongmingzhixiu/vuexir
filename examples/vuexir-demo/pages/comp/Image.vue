<script setup lang="ts">
// Vuexir 基础组件 · Image 图片 —— 图片容器样式（直角 / 圆角 / 圆形 / 带边框）
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">图片形状</p>
      <div class="row-gap">
        <div class="card">
          <p class="card-title">直角图片</p>
          <div class="img-box img-square">
            <p class="img-ph">IMG</p>
          </div>
        </div>
        <div class="card">
          <p class="card-title">圆角图片</p>
          <div class="img-box img-rounded">
            <p class="img-ph">IMG</p>
          </div>
        </div>
        <div class="card">
          <p class="card-title">圆形图片</p>
          <div class="img-box img-circle">
            <p class="img-ph">IMG</p>
          </div>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">带边框</p>
      <div class="card">
        <p class="line">边框 + 圆角组合，用于头像与商品图。</p>
        <div class="img-box img-rounded img-bordered">
          <p class="img-ph">IMG</p>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">Image 组件支持 fill 铺满与 fit 等比两种模式，此处展示容器形态。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Image</p>
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
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.img-box {
  justify-content: center;
  align-items: center;
  background: #16213c;
}
.img-square {
  width: 120px;
  height: 120px;
}
.img-rounded {
  width: 120px;
  height: 120px;
  border-radius: 14px;
}
.img-circle {
  width: 120px;
  height: 120px;
  border-radius: 60px;
}
.img-bordered {
  border: 1px solid #d9b36c;
}
.img-ph {
  font-size: 13px;
  font-weight: bold;
  color: #6b7693;
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
