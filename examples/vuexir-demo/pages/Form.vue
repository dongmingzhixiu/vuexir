<script setup lang="ts">
// 表单组件索引：19 项（R-VFOBJ-C：常量数组声明在 script，模板 v-for 引用变量名）
import VirRow from '../components/VirRow.vue'
declare const router: { push(path: string): void }

const rows = [
  { name: 'Calendar', desc: '日历', path: '/comp/calendar' },
  { name: 'Cascader', desc: '级联选择', path: '/comp/cascader' },
  { name: 'Checkbox', desc: '复选框', path: '/comp/checkbox' },
  { name: 'DatePicker', desc: '日期选择', path: '/comp/date-picker' },
  { name: 'Field', desc: '输入框', path: '/comp/field' },
  { name: 'Form', desc: '表单', path: '/comp/form' },
  { name: 'NumberKeyboard', desc: '数字键盘', path: '/comp/number-keyboard' },
  { name: 'PasswordInput', desc: '密码输入框', path: '/comp/password-input' },
  { name: 'Picker', desc: '选择器', path: '/comp/picker' },
  { name: 'PickerGroup', desc: '选择器组', path: '/comp/picker-group' },
  { name: 'Radio', desc: '单选框', path: '/comp/radio' },
  { name: 'Rate', desc: '评分', path: '/comp/rate' },
  { name: 'Search', desc: '搜索', path: '/comp/search' },
  { name: 'Slider', desc: '滑块', path: '/comp/slider' },
  { name: 'Signature', desc: '签名', path: '/comp/signature' },
  { name: 'Stepper', desc: '步进器', path: '/comp/stepper' },
  { name: 'Switch', desc: '开关', path: '/comp/switch' },
  { name: 'TimePicker', desc: '时间选择', path: '/comp/time-picker' },
  { name: 'Uploader', desc: '文件上传', path: '/comp/uploader' },
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
    <p class="foot">表单组件 · 19</p>
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
