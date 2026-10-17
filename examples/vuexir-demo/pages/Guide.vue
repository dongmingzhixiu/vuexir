<script setup lang="ts">
// 开发指南：介绍 / 快速上手 / 常见问题 / 设计资源 / 国际化（文档型，页内展示）
declare const router: { push(path: string): void }
</script>

<template>
  <div class="screen">
    <div class="sec">
      <p class="sec-title">介绍</p>
      <p class="line">Vuexir 是一套 Vue 组件库演示框架：编写 Vue 页面，编译生成原生 iOS（SwiftUI）源码。</p>
      <p class="line">演示应用按 Vant 官网分类组织，覆盖基础、表单、反馈、展示、导航、业务六大组件分类。</p>
    </div>
    <div class="sec">
      <p class="sec-title">快速上手</p>
      <div class="row" @click="router.push('/comp/button')">
        <p class="row-name">从按钮开始</p>
        <span class="row-arrow">›</span>
      </div>
      <div class="row" @click="router.push('/comp/field')">
        <p class="row-name">表单输入</p>
        <span class="row-arrow">›</span>
      </div>
    </div>
    <div class="sec">
      <p class="sec-title">常见问题</p>
      <p class="line">问：为什么只支持部分 CSS？答：编译器映射 Web 常用子集到 SwiftUI，特殊效果建议用基础元素组合。</p>
      <p class="line">问：能否直接翻译 vant 组件？答：当前为演示组织参考，组件本体用基础元素在 Vue 内实现。</p>
    </div>
    <div class="sec">
      <p class="sec-title">设计资源</p>
      <p class="line">深色鎏金主题：背景 #0a0f1e，卡片 #0f1832，主文字 #e9e6dd，强调金 #d9b36c。</p>
      <p class="line">主题色板与字号体系已由编译器统一收敛，页面无需重复定义全局样式。</p>
    </div>
    <div class="sec">
      <p class="sec-title">国际化</p>
      <p class="line">文案直接使用目标语言书写；编译器对 Unicode 文本完整保留，中英文混排自动适配。</p>
    </div>
    <p class="foot">开发指南 · 5 项</p>
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
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f1832;
  border-width: 1px;
  border-color: #2a3550;
  border-style: solid;
}
.sec-title {
  font-size: 13px;
  font-weight: 600;
  color: #d9b36c;
}
.line {
  font-size: 13px;
  color: #a8aec2;
  text-align: left;
}
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #16213c;
}
.row-name {
  flex: 1;
  font-size: 14px;
  color: #e9e6dd;
}
.row-arrow {
  font-size: 14px;
  color: #a8aec2;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
