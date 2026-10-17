<script setup lang="ts">
// 业务组件索引：9 项（R-VFOBJ-C：常量数组声明在 script，模板 v-for 引用变量名）
import VirRow from '../components/VirRow.vue'
declare const router: { push(path: string): void }

const rows = [
  { name: 'AddressEdit', desc: '地址编辑', path: '/comp/address-edit' },
  { name: 'AddressList', desc: '地址列表', path: '/comp/address-list' },
  { name: 'Area', desc: '省市区选择', path: '/comp/area' },
  { name: 'Card', desc: '商品卡片', path: '/comp/card' },
  { name: 'ContactCard', desc: '联系人卡片', path: '/comp/contact-card' },
  { name: 'ContactEdit', desc: '联系人编辑', path: '/comp/contact-edit' },
  { name: 'ContactList', desc: '联系人列表', path: '/comp/contact-list' },
  { name: 'Coupon', desc: '优惠券', path: '/comp/coupon' },
  { name: 'SubmitBar', desc: '提交订单栏', path: '/comp/submit-bar' },
] as const
</script>

<template>
  <div class="screen">
    <div class="group">
      <VirRow
        v-for="(item, i) in rows"
        :key="i"
        :name="item.name"
        :desc="item.desc"
        @click="router.push(item.path)"
      />
    </div>
    <p class="foot">业务组件 · 9</p>
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
.group {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: #0f1832;
  border-width: 1px;
  border-color: #2a3550;
  border-style: solid;
  overflow: hidden;
}
.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 15px 16px;
  border-bottom-width: 0.5px;
  border-bottom-color: #22304a;
  border-bottom-style: solid;
}
.row-name {
  font-size: 15px;
  font-weight: 500;
  color: #e9e6dd;
}
.row-desc {
  flex: 1;
  font-size: 12px;
  color: #6b7693;
  text-align: right;
}
.row-arrow {
  font-size: 15px;
  color: #a8aec2;
}
.foot {
  font-size: 11px;
  color: #6b7693;
  text-align: center;
  margin-top: 4px;
}
</style>
