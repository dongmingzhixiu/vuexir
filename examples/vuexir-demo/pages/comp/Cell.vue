<script setup lang="ts">
declare const router: { push(path: string): void }
// Vuexir 基础组件 · Cell 单元格 —— 分组列表（标题 + 描述 + 箭头）
const rows = [
  { name: '单元格', desc: '内容描述' },
  { name: '标题居中', desc: '内容描述' },
  { name: '只展示标题', desc: '' },
] as const
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">基础用法</p>
      <div class="group">
        <div v-for="(item, i) in rows" :key="i" class="row">
          <p class="row-name">{{ item.name }}</p>
          <span class="row-desc">{{ item.desc }}</span>
          <span class="row-arrow">›</span>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">分组标题</p>
      <div class="group">
        <p class="group-title">分组一</p>
        <div class="row">
          <p class="row-name">单元格一</p>
          <span class="row-desc">描述文字</span>
          <span class="row-arrow">›</span>
        </div>
        <div class="row">
          <p class="row-name">单元格二</p>
          <span class="row-desc">描述文字</span>
          <span class="row-arrow">›</span>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">点击示例</p>
      <div class="group">
        <div class="row" @click="router.push('/comp/popup')">
          <p class="row-name">可点击单元格</p>
          <span class="row-desc">跳转 Popup 示例</span>
          <span class="row-arrow">›</span>
        </div>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">说明</p>
      <div class="card">
        <p class="line">Cell 用于信息展示与列表导航，右侧箭头表示可点击进入。</p>
      </div>
    </div>
    <p class="foot">Vuexir · Cell</p>
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
.group {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: #0f1832;
  border: 1px solid #2a3550;
}
.group-title {
  font-size: 12px;
  color: #6b7693;
  padding: 10px 12px 6px 12px;
}
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding-top: 13px;
  padding-bottom: 13px;
  padding-left: 12px;
  padding-right: 12px;
}
.row-name {
  font-size: 14px;
  font-weight: medium;
  color: #e9e6dd;
}
.row-desc {
  font-size: 12px;
  color: #6b7693;
  margin-left: auto;
}
.row-arrow {
  font-size: 16px;
  color: #6b7693;
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
