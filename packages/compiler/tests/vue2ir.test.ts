import { describe, expect, it } from 'vitest';
import { vueToIr, VueCompileError, swiftExpr } from '../src/transform/vue2ir';
import { validateIr } from '../src/ir/schema';
import { generateScreenSource } from '../src/codegen/swiftui';

const SAMPLE = `<template>
  <div class="screen">
    <div class="header">
      <h1 class="title">心法阁</h1>
      <span class="sub">已收录 3 部功法</span>
    </div>
    <button class="cta">录入新功法</button>
  </div>
</template>
<style>
.screen { display: flex; flex-direction: column; padding: 16px; gap: 12px; background: #04060d; width: 100%; }
.header { display: flex; flex-direction: column; gap: 8px; }
.title { font-size: 22px; font-weight: bold; color: #d9b36c; }
.sub { font-size: 13px; color: #9aa3ba; }
.cta { height: 44px; border-radius: 14px; background: #d9b36c; margin-top: auto; }
</style>`;

describe('vue2ir · 元素归一化与 CSS 子集', () => {
  it('基本结构：div→group / h1、span→text / button→button', () => {
    const { screen } = vueToIr(SAMPLE);
    expect(validateIr(screen).ok).toBe(true);

    const root = screen.ui;
    const screenGroup = root.children![0].children![0]; // 包裹层 → 模板根 div.screen
    expect(screenGroup.type).toBe('group');
    // 根 div class=screen → padding/gap/background/flexDirection 生效
    expect(screenGroup.props).toMatchObject({
      padding: 16,
      gap: 12,
      width: 'fill',
    });
    // M4b：模板根容器背景提升到 root（铺满全屏），子节点不再持背景
    expect(root.props).toMatchObject({ background: '#04060d' });
    expect(screenGroup.props?.background).toBeUndefined();
    // 两个子节点：header 组 + button
    const header = screenGroup.children![0];
    expect(header.type).toBe('group');
    expect(header.props!.gap).toBe(8);
    const [h1, span] = header.children!;
    expect(h1).toMatchObject({ type: 'text', props: { text: '心法阁', fontSize: 22, fontWeight: 'bold', color: '#d9b36c' } });
    expect(span).toMatchObject({ type: 'text', props: { text: '已收录 3 部功法', fontSize: 13, color: '#9aa3ba' } });
    // button：文本 → label，margin-top:auto → marginTopAuto（推底，非 flex 占满）
    const btn = screenGroup.children![1];
    expect(btn).toMatchObject({ type: 'button', props: { label: '录入新功法', height: 44, radius: 14, background: '#d9b36c', marginTopAuto: true } });
  });

  it('justify-content:space-between → spaceBetween（IR 枚举）', () => {
    const src = `<template><div class="row"><span>左</span><span>右</span></div></template>
<style>.row { display:flex; flex-direction:row; justify-content:space-between; }</style>`;
    const { screen } = vueToIr(src);
    expect(validateIr(screen).ok).toBe(true);
    const row = screen.ui.children![0].children![0];
    expect(row.props!.flexDirection).toBe('row');
    expect(row.props!.justifyContent).toBe('spaceBetween');
  });

  it('img 静态 src → image', () => {
    const src = `<template><div class="wrap"><img src="/assets/hero.png" class="pic" /></div></template>
<style>.wrap { display:flex; } .pic { width:100px; height:100px; border-radius:8px; }</style>`;
    const { screen } = vueToIr(src);
    expect(validateIr(screen).ok).toBe(true);
    const img = screen.ui.children![0].children![0].children![0];
    expect(img.type).toBe('image');
    expect(img.props!.src).toBe('/assets/hero.png');
    expect(img.props!.radius).toBe(8);
  });

  it('v-for 数字范围 → 下沉为运行时数组（Vue3 语义 1..N，R108）', () => {
    const src = `<template><div class="l"><span v-for="i in 3">{{ i }}</span></div></template><style>.l{display:flex;}</style>`;
    const r = vueToIr(src);
    expect(((r.runtime ?? '') + JSON.stringify(r.screen.state ?? [])).includes('length')).toBe(true);
  });

  it('插值 {{ }} 编译期报错', () => {
    const src = `<template><div class="l"><span>{{ name }}</span></div></template><style>.l{display:flex;}</style>`;
    expect(() => vueToIr(src)).toThrow(/插值/);
  });

  it('未知标签（组件）编译期报错', () => {
    const src = `<template><div class="l"><MyCard /></div></template><style>.l{display:flex;}</style>`;
    expect(() => vueToIr(src)).toThrow(/未知标签/);
  });

  it('@click 事件 → props.onClick（运行时 JS 函数名）', () => {
    const src = `<template><div class="l"><button @click="go">点我</button></div></template><style>.l{display:flex;}</style>`;
    const { screen, warnings } = vueToIr(src);
    expect(validateIr(screen).ok).toBe(true);
    // 递归查找 button 节点
    const findBtn = (n: { type?: string; children?: unknown[]; props?: Record<string, unknown> }): { props?: Record<string, unknown> } | null => {
      if (n.type === 'button') return n;
      for (const c of n.children ?? []) {
        const r = findBtn(c as { type?: string; children?: unknown[]; props?: Record<string, unknown> });
        if (r) return r;
      }
      return null;
    };
    const btn = findBtn(screen.ui as { type?: string; children?: unknown[] });
    expect(btn?.props?.onClick).toBe('go');
    expect(warnings.some((w) => w.includes('事件绑定'))).toBe(false);
  });

  it('p 内嵌行内元素 → 拍平为文本（R107：内容不丢，行内样式降级）', () => {
    const src = `<template><div class="l"><p>今日已诵<b>12</b>句</p></div></template><style>.l{display:flex;}</style>`;
    const r = vueToIr(src);
    expect(JSON.stringify(r.screen.ui)).toContain('今日已诵');
    expect(JSON.stringify(r.screen.ui)).toContain('12');
  });
});

describe('vue2ir · flex/scroll 语义（2026-10-15）', () => {
  it('flex-grow:1 → flex:1；flex-shrink:0 不报「不在子集」', () => {
    const src = `<template><div class="page"><div class="a">A</div></div></template>
<style>
.page { display:flex; flex-direction:column; height:100%; }
.a { flex-grow:1; flex-shrink:0; }
</style>`;
    const { screen, warnings } = vueToIr(src);
    expect(validateIr(screen).ok).toBe(true);
    const page = screen.ui.children![0].children![0];
    expect(page.props).toMatchObject({ flexDirection: 'column', flex: 1 }); // height:100% → flex:1
    const a = (page.children as { props?: Record<string, unknown> }[])[0];
    expect(a.props).toMatchObject({ flex: 1 }); // flex-grow:1 → flex:1
    expect(warnings.some((w) => w.includes('flex-shrink'))).toBe(false);
  });

  it('overflow:auto → 节点升级为 scroll', () => {
    const src = `<template><div class="page"><div class="list"><span>项</span></div></div></template>
<style>
.page { display:flex; flex-direction:column; height:100%; }
.list { flex-grow:1; overflow:auto; }
</style>`;
    const { screen } = vueToIr(src);
    expect(validateIr(screen).ok).toBe(true);
    const page = screen.ui.children![0].children![0];
    const list = (page.children as { type?: string; props?: Record<string, unknown> }[])[0];
    expect(list.type).toBe('scroll');
    expect(list.props).toMatchObject({ flex: 1 });
  });

  it('scroll + 父确定高度链 → 生成 ScrollView 且 flex 不降级', () => {
    const src = `<template><div class="page"><div class="list"><span>项</span></div><div class="tab">底</div></div></template>
<style>
.page { display:flex; flex-direction:column; height:100%; }
.list { flex-grow:1; overflow:auto; }
.tab { height:64px; }
</style>`;
    const { screen } = vueToIr(src);
    expect(validateIr(screen).ok).toBe(true);
    const warnings: string[] = [];
    const code = generateScreenSource(screen, { warnings });
    expect(code).toContain('ScrollView');
    expect(code).toContain('frame(height: 64)');
    expect(warnings.some((w) => w.includes('R-H3') && w.includes('[2]'))).toBe(false);
  });
});

describe('vue2ir · 组件独立 View（R41）', () => {
  const STAT_CELL = `<script setup lang="ts">
defineProps<{ value: string; label: string }>();
</script>
<template>
  <div class="cell">
    <span class="v">{{ value }}</span>
    <span class="l">{{ label }}</span>
  </div>
</template>
<style>
.cell { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.v { font-size: 17px; font-weight: bold; color: #efeadd; }
.l { font-size: 10.5px; color: #9aa3ba; }
</style>`;

  it('自定义标签 → component 节点（attrs 字面量）+ 独立组件树（text ref，根布局 props 提升）', () => {
    const src = `<template>
  <div class="stats">
    <StatCell value="372.8" label="累计行里" />
    <StatCell :value="32" label="历练次数" />
  </div>
</template>
<style>
.stats { display: flex; gap: 10px; }
</style>`;
    const r = vueToIr(src, { components: { StatCell: STAT_CELL } });
    expect(validateIr(r.screen).ok).toBe(true);
    const stats = r.screen.ui.children![0].children![0];
    expect(stats.children!.length).toBe(2);
    // 使用点 → component 节点：name + attrs + 组件根剥离的 flex:1
    const use1 = stats.children![0];
    expect(use1.type).toBe('component');
    expect(use1.props).toMatchObject({
      name: 'StatCell',
      attrs: { value: '372.8', label: '累计行里' },
      flex: 1, // 组件根 .cell 的 flex:1 提升到使用点
    });
    // :value="'32'" 字面量 → number 32
    const use2 = stats.children![1];
    expect((use2.props as { attrs: Record<string, unknown> }).attrs.value).toBe(32);
    // 组件树：根无 flex（剥离）；{{ prop }} → text ref
    expect(r.components!.length).toBe(1);
    const tree = r.components![0];
    expect(tree.name).toBe('StatCell');
    const root = tree.ui;
    expect(root.props).toMatchObject({ flexDirection: 'column', alignItems: 'center', gap: 2 });
    expect(root.props).not.toHaveProperty('flex');
    const texts = root.children as { props?: { ref?: string } }[];
    expect(texts.map((n) => n.props?.ref)).toEqual(['value', 'label']);
    expect(r.warnings.some((w) => w.includes('R13'))).toBe(false);
  });

  it('组件样式独立作用域：页面同名类不影响组件树（组件类优先）', () => {
    const src = `<template>
  <div class="stats"><StatCell value="1" label="x" /></div>
</template>
<style>
.stats { display: flex; }
.v { color: #ff0000; font-size: 30px; }
</style>`;
    const r = vueToIr(src, { components: { StatCell: STAT_CELL } });
    const tree = r.components![0].ui;
    const v = (tree.children as { props?: Record<string, unknown> }[])[0];
    expect(v.props).toMatchObject({ color: '#efeadd', fontSize: 17 }); // 组件自己的 .v，不混入页面
  });

  it('组件 prop 绑定非常量 → warning（忽略该绑定；组件不引用该 prop 时可正常渲染）', () => {
    const SIMPLE = `<template>
  <div class="cell"><span class="l">{{ label }}</span></div>
</template>
<style>.cell { flex: 1; }</style>`;
    const src = `<template>
  <div class="stats"><StatCell :value="count" label="x" /></div>
</template>
<style>.stats { display: flex; }</style>`;
    const r = vueToIr(src, { components: { StatCell: SIMPLE } });
    expect(validateIr(r.screen).ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('非常量'))).toBe(true);
    const use = r.screen.ui.children![0].children![0].children![0];
    const attrs = (use.props as { attrs: Record<string, unknown> }).attrs;
    expect(attrs).not.toHaveProperty('value'); // 非常量绑定被忽略
    expect(attrs.label).toBe('x');
    // 组件树正常（label 已声明且使用点传入）
    const tree = r.components![0].ui;
    expect((tree.children as { props?: { ref?: string } }[])[0].props?.ref).toBe('label');
  });

  it('组件内插值引用 declareProps 声明但使用点未传 → warning（Swift 编译缺参），不报错', () => {
    const src = `<template>
  <div class="stats"><StatCell label="x" /></div>
</template>
<style>.stats { display: flex; }</style>`;
    const r = vueToIr(src, { components: { StatCell: STAT_CELL } });
    expect(validateIr(r.screen).ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('「value」未传入'))).toBe(true);
    // 组件树照常生成（value 是 defineProps 声明 → ref 节点）
    const tree = r.components![0].ui;
    expect((tree.children as { props?: { ref?: string } }[])[0].props?.ref).toBe('value');
  });

  it('kebab-case 标签 → PascalCase 组件名匹配', () => {
    const src = `<template>
  <div class="stats"><stat-cell value="1" label="x" /></div>
</template>
<style>.stats { display: flex; }</style>`;
    const r = vueToIr(src, { components: { StatCell: STAT_CELL } });
    const stats = r.screen.ui.children![0].children![0];
    expect(stats.children![0].type).toBe('component');
    expect((stats.children![0].props as { name: string }).name).toBe('StatCell');
  });

  it('未注册组件名 → 仍按 R13 报未知标签', () => {
    const src = `<template><div class="l"><MyCard /></div></template><style>.l{display:flex;}</style>`;
    expect(() => vueToIr(src)).toThrow(/未知标签/);
  });
});

/* ============ M1 状态与插值（{{ }} + state + v-model） ============ */

describe('vue2ir · M1 状态与插值', () => {
  const STATE_SRC = `<template>
  <div class="l">
    <span class="tl">当前值</span>
    <span class="t">{{ count }}</span>
    <button @click="inc()">加一</button>
    <button @click="reset()">归零</button>
    <input class="f" v-model="note" placeholder="输入" />
    <span class="e">{{ note }}</span>
  </div>
</template>
<script setup>
const count = ref(0)
const note = ref('')
function inc() { count.value = count.value + 1 }
function reset() { count.value = 0 }
</script>
<style>.l { display: flex; flex-direction: column; } .t { font-size: 20px; } .f { height: 44px; } .e { font-size: 13px; }</style>`;

  it('页面级 {{ state }} → text bind 节点，screen.state 收集 ref', () => {
    const r = vueToIr(STATE_SRC);
    expect(validateIr(r.screen).ok).toBe(true);
    expect(r.screen.state).toEqual([
      { name: 'count', init: 0 },
      { name: 'note', init: '' },
    ]);
    const binds = collectBinds(r.screen.ui);
    expect(binds).toEqual(['count', 'note']);
    // 按钮事件：无参表达式 setter 内联为 Swift 表达式（count + 1 / 0）
    const btns = collectProps(r.screen.ui, 'onSet');
    expect(btns).toContainEqual({ var: 'count', value: 'count + 1', kind: 'expr' });
    expect(btns).toContainEqual({ var: 'count', value: '0', kind: 'expr' });
    // v-model → input 节点 props.value（string state）
    const inputs = collectProps(r.screen.ui, 'value');
    expect(inputs).toContain('note');
  });

  it('未声明状态的 {{ x }} → 编译报错', () => {
    const src = `<template><span>{{ ghost }}</span></template><style></style>`;
    expect(() => vueToIr(src)).toThrow(/未在 <script setup> 中声明为 ref 状态/);
  });

  it('表达式下沉：{{ count + 1 }} 改由 JS 运行时求值（R98）', () => {
    const src = `<template><div class="page"><p class="t">{{ count + 1 }}</p></div></template>
<script setup>const count = ref(1)</script>
<style>.page { background: #0f1832; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    const ui = JSON.stringify(r.screen.ui);
    expect(ui).toContain('"_vrnE0"');
    expect((r.screen.state ?? []).some((st) => st.name === '_vrnE0' && String(st.computed).includes('count'))).toBe(true);
    expect(r.runtime ?? '').toContain('stateStore._vrnE0');
  });

  it('v-model 绑定 number state → warning 忽略（仅 string state 可绑 TextField）', () => {
    const src = `<template><input v-model="count" /></template>
<script setup>const count = ref(0)</script><style></style>`;
    const r = vueToIr(src);
    expect(r.warnings.some((w) => w.includes('仅支持 input/textarea 绑定已声明的 string'))).toBe(true);
    const input = r.screen.ui.children![0] as { props?: { value?: string } };
    expect(input.props?.value).toBeUndefined();
  });

  it('swiftExpr：状态引用 .value → @State 名；单引号字符串 → 双引号', () => {
    // swiftExpr 已在顶部导入
    expect(swiftExpr('count.value + 1')).toBe('count + 1');
    expect(swiftExpr("msg.value + '!'")).toBe('msg + "!"');
    expect(swiftExpr('count.value')).toBe('count');
    expect(swiftExpr('count.value; drop_table()')).toBeNull();
  });
});

function collectBinds(node: { type: string; bind?: { key: string }; props?: unknown; children?: unknown[] }): string[] {
  const out: string[] = [];
  if (node.bind) out.push(node.bind.key);
  const p = (node.props ?? {}) as Record<string, unknown>;
  if (typeof p.bind === 'string') out.push(p.bind);
  for (const c of node.children ?? []) out.push(...collectBinds(c as never));
  return out;
}

function collectProps(
  node: { type: string; props?: unknown; children?: unknown[] },
  key: string,
): unknown[] {
  const out: unknown[] = [];
  const p = (node.props ?? {}) as Record<string, unknown>;
  if (p[key] !== undefined) out.push(p[key]);
  for (const c of node.children ?? []) out.push(...collectProps(c as never, key));
  return out;
}

/* ============ M2 动态结构与表达式（v-for + :class/:style + 列表事件） ============ */

describe('vue2ir · M2 v-for / :class / :style / 列表事件', () => {
  const LIST_SRC = `<template>
  <div class="page">
    <p class="sub">M2 列表</p>
    <div class="list">
      <div v-for="(item, i) in ['云游', '炼气', '归元']" :key="i" class="row"
           :class="{ 'row-on': selected == i }" @click="selected = i">
        <span class="idx">{{ i }}</span>
        <span class="name" :style="{ color: accent }">{{ item }}</span>
        <span class="mark">{{ selected == i ? '✓' : '○' }}</span>
      </div>
    </div>
  </div>
</template>
<script setup>
const selected = ref(0)
const accent = ref('#d9b36c')
</script>
<style>.page { background: #0a0f1e; } .sub { font-size: 10.5px; color: #a8aec2; }
.list { padding: 0 20px; gap: 10px; }
.row { flex-direction: row; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; background: #10182a; }
.row-on { background: #2a2310; }
.idx { font-size: 11px; color: #d9b36c; width: 20px; } .name { font-size: 14px; color: #e9e6dd; }
.mark { font-size: 13px; color: #55d6bc; margin-left: auto; }</style>`;

  it('v-for 静态数组 → for 节点（vfor.list/itemKey/indexKey），项模板含循环变量 bind', () => {
    const r = vueToIr(LIST_SRC);
    expect(validateIr(r.screen).ok).toBe(true);
    const pageDiv = r.screen.ui.children![0].children![0];
    const listDiv = pageDiv.children?.[1];
    expect(listDiv?.type).toBe('group');
    const forNode = listDiv?.children?.[0];
    expect(forNode?.type).toBe('for');
    expect(forNode?.vfor).toEqual({ list: ['云游', '炼气', '归元'], itemKey: 'item', indexKey: 'i' });
    const row = forNode?.children?.[0];
    expect(row?.active).toEqual({ when: 'selected == i', props: expect.objectContaining({ background: '#2a2310' }) });
    expect(row?.props?.onSet).toEqual({ var: 'selected', value: 'i', kind: 'expr' });
    // 项模板 text：循环变量 bind（i / item）与三元 bindExpr
    const spans = (row?.children ?? []).filter((c) => c.type === 'text');
    const texts = spans.map((s) => (s.props ?? {}) as Record<string, unknown>);
    expect(texts.find((p) => p.bind === 'i')).toBeTruthy();
    expect(texts.find((p) => p.bind === 'item')).toBeTruthy();
    expect(texts.find((p) => p.bindExpr === 'selected == i ? "✓" : "○"')).toBeTruthy();
    // :style 动态色
    expect(texts.find((p) => p.colorDynamic === 'accent')).toBeTruthy();
  });

  it(':class 三元 → 真分支生效（warning 提示假分支降级）', () => {
    const src = `<template><div class="l"><p class="t" :class="selected == 1 ? 'a' : 'b'">x</p></div></template>
<script setup>const selected = ref(0)</script>
<style>.l { display: flex; flex-direction: column; } .t { font-size: 14px; } .a { color: #ff0000; } .b { color: #00ff00; }</style>`;
    const r = vueToIr(src);
    const p = r.screen.ui.children![0].children![0].children![0];
    expect(p?.active).toEqual({ when: 'selected == 1', props: expect.objectContaining({ color: '#ff0000' }) });
    expect(r.warnings.some((w) => w.includes('假分支'))).toBe(true);
  });

  it('v-for 数据源未声明 → 运行时自适应（R143）；重复 :key 忽略', () => {
    const r = vueToIr(`<template><div v-for="x in arr" class="l"><span>{{ x }}</span></div></template>
<style>.l { display: flex; }</style>`);
    // R143：不再报错，改为运行时自适应求值（数组/数值都支持）
    expect(r.warnings.some((w) => w.includes('运行时自适应'))).toBe(true);
  });
});

describe('vue2ir · M3 运行时桥', () => {
  it('顶层 function + onMounted → screen.handlers/onMounted；body 重写 x.value → stateStore.x', () => {
    const src = `
<script setup lang="ts">
const count = ref(0)
const note = ref('')
function inc() {
  count.value = count.value + 1
  localStorage.setItem('count', String(count.value))
}
onMounted(() => {
  const saved = localStorage.getItem('count')
  if (saved !== '') { count.value = Number(saved) }
})
</script>
<template><h1 class="t">{{ count }}</h1><button class="b" @click="inc()">加一</button></template>
<style scoped>.t { font-size: 16px; color: #fff; } .b { padding: 8px; }</style>`;
    const r = vueToIr(src, { screenId: 'Counter', height: 640 });
    const ir = r.screen;
    expect(ir.handlers).toBeDefined();
    expect(ir.handlers![0]).toMatchObject({ name: 'inc', params: '' });
    expect(ir.onMounted).toContain('stateStore.count = Number(saved)');
    expect(ir.onMounted).not.toContain('count.value');
    expect(r.runtime).toContain('var stateStore = new Proxy(__stateStore');
    expect(r.runtime).toContain('function inc()');
    expect(r.runtime).toContain('__lsGet("vrn." + k)');
    expect(r.runtime).toContain('function __onMounted()');
    expect(r.warnings.length).toBe(0);
    expect(validateIr(ir).ok).toBe(true);
  });

  it('@click="inc()" 无参调用 → onClick 规范化 inc（Swift invoke 统一补 ()）；单语句纯赋值函数 → 内联 onSet', () => {
    const multi = `
<script setup lang="ts">
const count = ref(0)
function inc() { count.value = count.value + 1; localStorage.setItem('c', String(count.value)) }
</script>
<template><button class="b" @click="inc()">加一</button></template>
<style scoped>.b { padding: 8px; }</style>`;
    const r = vueToIr(multi, { screenId: 'T', height: 640 });
    // 多语句函数（含 localStorage）→ 不能内联 → onClick 名（无参去掉括号）；Swift invoke 统一补 ()
    const btn = r.screen.ui.children![0].children![0];
    expect(btn.props!.onClick).toBe('inc');
    expect(btn.props!.onSet).toBeUndefined();

    const single = `
<script setup lang="ts">
const count = ref(0)
function inc() { count.value = count.value + 1 }
</script>
<template><button class="b" @click="inc()">加一</button></template>
<style scoped>.b { padding: 8px; }</style>`;
    const r2 = vueToIr(single, { screenId: 'T2', height: 640 });
    // 单语句纯赋值 → 自动内联 onSet（无需 JS 引擎，更快）
    const btn2 = r2.screen.ui.children![0].children![0];
    expect(btn2.props!.onSet).toMatchObject({ var: 'count', kind: 'expr' });
    expect(btn2.props!.onClick).toBeUndefined();
  });
});

describe('转换层修复回归（R15 不静默 · 2026 审计）', () => {
  it(':class 多键对象 → 仅应用首键 + warning（不再生成吞键的非法条件）', () => {
    const src = `<template><div class="page"><p class="tag" :class="{ 'on': visible, 'off': !visible }">x</p></div></template>
<script setup>const visible = ref(true)</script>
<style>.page { background: #0a0f1e; } .tag { font-size: 12px; color: #ffffff; } .on { color: #d9b36c; }</style>`;
    const r = vueToIr(src);
    expect(validateIr(r.screen).ok).toBe(true);
    expect(r.warnings.some((w) => w.includes('仅应用首键'))).toBe(true);
    const tag = r.screen.ui.children![0].children![0].children![0];
    expect(tag.active?.when).toBe('visible');
  });

  it('button 内嵌 span → 内联文本并入 label + warning（不再缺 label 中断）', () => {
    const src = `<template><div class="page"><button class="btn"><span>提交订单</span></button></div></template>
<style>.page { background: #0a0f1e; } .btn { font-size: 15px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(validateIr(r.screen).ok).toBe(true);
    const btn = r.screen.ui.children![0].children![0].children![0];
    expect(btn.props!.label).toBe('提交订单');
    expect(r.warnings.some((w) => w.includes('内联文本并入 label'))).toBe(true);
  });

  it(':key 静默跳过（不产生「不支持」噪声警告）', () => {
    const src = `<template><div class="page"><div class="list"><div class="row" v-for="(item, i) in ['a', 'b']" :key="i"><span class="idx">{{ item }}</span></div></div></div></template>
<style>.page { background: #0a0f1e; } .list { padding: 0 20px; } .row { padding: 10px; } .idx { font-size: 12px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(validateIr(r.screen).ok).toBe(true);
    expect(r.warnings.some((w) => w.includes(':key'))).toBe(false);
    expect(r.warnings.some((w) => w.includes('未在 screen.state 中声明'))).toBe(false);
  });

  it('@click 引用未提取函数 → warning（原生端点击将无响应）', () => {
    const src = `<template><div class="page"><button class="btn" @click="ghostFn">x</button></div></template>
<script setup>const unused = 1</script>
<style>.page { background: #0a0f1e; } .btn { font-size: 15px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(r.warnings.some((w) => w.includes('未提取为 runtime handler'))).toBe(true);
  });

  it('<template v-else> → warning（不再静默恒显示该分支）', () => {
    const src = `<template><div class="page"><template v-if="flag"><p class="sub">A</p></template><template v-else><p class="sub">B</p></template></div></template>
<script setup>const flag = ref(true)</script>
<style>.page { background: #0a0f1e; } .sub { font-size: 12px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(r.warnings.some((w) => w.includes('v-else'))).toBe(true);
  });

  it('handler 函数体含 TS 类型标注 → warning（runtime.js 将解析失败）', () => {
    const src = `<template><div class="page"><button class="btn" @click="calc">x</button></div></template>
<script setup>
const count = ref(0)
function calc() { const step: number = 1; count.value = count.value + step }
</script>
<style>.page { background: #0a0f1e; } .btn { font-size: 15px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(r.warnings.some((w) => w.includes('TS 类型标注'))).toBe(true);
  });

  it('多根模板：背景仅从首个根提升（浮层根保留自身背景）', () => {
    const src = `<template><div class="page"><p class="sub">主体</p></div><div class="toast"><p class="sub">浮层</p></div></template>
<style>.page { background: #0a0f1e; } .toast { background: #10182a; } .sub { font-size: 12px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(validateIr(r.screen).ok).toBe(true);
    const roots = r.screen.ui.children![0].children!;
    expect(r.screen.ui.props!.background).toBe('#0a0f1e');
    expect(roots[0].props!.background).toBeUndefined();
    expect(roots[1].props!.background).toBe('#10182a');
  });

  it('v-else（元素级）事件修饰符暂不支持 → warning', () => {
    const src = `<template><div class="page"><button class="btn" @click.stop="doIt">x</button></div></template>
<script setup>function doIt() {}</script>
<style>.page { background: #0a0f1e; } .btn { font-size: 15px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(r.warnings.some((w) => w.includes('事件修饰符暂不支持'))).toBe(true);
  });

  it('R85 成员链插值：{{ a.b.c }} 与 {{ a.list.length }} 生成点路径 fieldOf', () => {
    const src = `<template><div class="page"><p class="t">{{ board.month.label }}</p><p class="t">{{ board.tags.length }}</p><p class="t">{{ board.month.names }}</p></div></template>
<script setup>const board = ref({ month: { label: '10 月', names: '阿明阿亮' }, tags: '生日' })</script>
<style>.page { background: #0f1832; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src);
    expect(r.warnings.filter((w) => w.includes('不是页面状态'))).toEqual([]);
    const nodes = JSON.stringify(r.screen.ui);
    expect(nodes).toContain('"obj":"board","field":"month.label"');
    expect(nodes).toContain('"obj":"board","field":"tags.length"');
    expect(nodes).toContain('"obj":"board","field":"month.names"');
  });

  it('R86 Pinia store 状态折叠：const ui = useUiStore() → ui_<field> 状态 + 拍平取值', () => {
    const storeSrc = `export const useUiStore = defineStore('ui', {
  state: (): UiState => ({ count: 3, dialog: { title: '提示' } }),
})`;
    const src = `<template><div class="page"><p class="t">{{ ui.dialog.title }}</p><p class="t">{{ ui.count }}</p></div></template>
<script setup>import { useUiStore } from '@/stores/ui'
const ui = useUiStore()</script>
<style>.page { background: #0f1832; } .t { font-size: 13px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'S', storeSources: { 'ui.ts': storeSrc } });
    const names = (r.screen.state ?? []).map((x) => x.name);
    expect(names).toContain('ui_count');
    expect(names).toContain('ui_dialog');
    expect((r.screen.state ?? []).find((x) => x.name === 'ui_dialog')?.obj).toBe(true);
    const ui = JSON.stringify(r.screen.ui);
    expect(ui).toContain('"obj":"ui_dialog","field":"title"');
    expect(ui).toContain('"bind":"ui_count"');
  });

  it('R86 续 getter 折叠：可折叠 getter 拍成 state 字段点路径，不可折叠给 warning', () => {
    const storeSrc = `export const useUiStore = defineStore('ui', {
  state: (): UiState => ({ dialog: { visible: false, title: '提示' }, count: 3 }),
  getters: { isOpen: (s) => s.dialog.visible, detail: (s) => s.dialog, bogus: (s) => s.count + 1 },
})`;
    const src = `<template><div class="page"><p class="t">{{ ui.isOpen }}</p><p class="t">{{ ui.bogus }}</p></div></template>
<script setup>import { useUiStore } from '@/stores/ui'
const ui = useUiStore()</script>
<style>.page { background: #0f1832; } .t { font-size: 13px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'S', storeSources: { 'ui.ts': storeSrc } });
    const ui = JSON.stringify(r.screen.ui);
    expect(ui).toContain('"obj":"ui_dialog","field":"visible"');
    // R90 起：含计算的 getter 降级读底层字段（不再产出占位），必须有显式告警
    expect(r.warnings.some((w) => w.includes('R90') && w.includes('含计算逻辑'))).toBe(true);
  });

  it('R87 store action 折叠：@click 与 handler 体内的 action 调用变成状态赋值', () => {
    const storeSrc = `export const useUiStore = defineStore('ui', {
  state: (): UiState => ({ skin: 'warm', seq: 0 }),
  actions: { setSkin(skin) { this.skin = skin }, bump() { this.seq++ }, reset() { this.skin = 'warm' } },
})`;
    const src = `<template><div class="page">
      <button class="b" @click="ui.setSkin('night')">夜间</button>
      <button class="b" @click="ui.bump()">加一</button>
      <button class="b" @click="viaHandler">自检</button>
    </div></template>
<script setup>import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
function viaHandler() { ui.reset() }</script>
<style>.page { background: #0b1020; padding: 16px; } .b { font-size: 15px; color: #ffd98e; background: #16203c; }</style>`;
    const r = vueToIr(src, { screenId: 'S', storeSources: { 'ui.ts': storeSrc } });
    const btns = (r.screen.ui.children?.[0]?.children?.[0]?.children ?? []) as { props?: Record<string, unknown> }[];
    expect(JSON.stringify(btns[0].props)).toContain('"var":"ui_skin","value":"night"');
    expect(JSON.stringify(btns[1].props)).toContain('ui_seq + 1');
    expect(r.runtime ?? '').toContain('stateStore.ui_skin = "warm"');
    expect(r.warnings).toEqual([]);
  });

  it('R88 v-for 数据源扩展：store 常量数组（含布尔/嵌套值）与带类型标注的页面常量数组', () => {
    const storeSrc = `export const SKINS: SkinMeta[] = [
  { key: 'warm', name: '暖阳', gradient: ['#f6a57a', '#f47c8a'] },
  { key: 'night', name: '暗夜', dark: true },
]`;
    const pageSrc = `<template><div class="page">
      <div class="row" v-for="s in SKINS" :key="s.key"><p class="t">{{ s.name }}</p></div>
      <div class="row" v-for="w in WAYS" :key="w.k"><p class="t">{{ w.label }}</p></div>
    </div></template>
<script setup>import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
const WAYS: { k: string; label: string }[] = [{ k: 'a', label: '扫码' }, { k: 'b', label: '文件' }]</script>
<style>.page { background: #0b1020; padding: 16px; } .row { display: flex; flex-direction: row; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(pageSrc, { screenId: 'S', storeSources: { 'ui.ts': storeSrc } });
    const loops = JSON.stringify(r.screen.ui);
    expect(loops).toContain('"list"');
    expect(loops).toContain('暖阳');
    expect(loops).toContain('扫码');
  });

  it('R89 computed/常量折叠 + 前置插值不再丢数据', () => {
    const storeSrc = `export const useLibraryStore = defineStore('library', { state: (): S => ({ upcoming: [] }) })`;
    const src = `<template><div class="page">
      <p class="t">{{ monthLabel }}生日</p>
      <p class="t">共 {{ all.length }} 条</p>
    </div></template>
<script setup>import { computed } from 'vue'
import { useLibraryStore } from '@/stores/library'
const store = useLibraryStore()
const monthLabel = \`\${new Date().getMonth() + 1}月\`
const all = computed(() => store.upcoming)</script>
<style>.page { background: #0b1020; padding: 16px; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'S', storeSources: { 'library.ts': storeSrc } });
    const month = (r.screen.state ?? []).find((x) => x.name === 'monthLabel');
    expect(month?.init).toMatch(/^\d+月$/); // 编译期求值
    const ui = JSON.stringify(r.screen.ui);
    expect(ui).toContain('"fieldOf":{"obj":"store_upcoming","field":"length"}');
    expect(ui).toContain('"bind":"monthLabel"'); // 前置插值未被静态文本吞掉
    expect(r.warnings).toEqual([]);
  });

  it('R90 getter 降级：含计算逻辑的 getter 读底层 state，可折叠 getter 走点路径并告警', () => {
    const storeSrc = `export const useUiStore = defineStore('ui', {
  state: (): S => ({ skin: 'warm', list: [] }),
  getters: {
    isDark(): boolean { return this.skin === 'night' },
    rows(): number[] { return this.list.filter((x) => x).map((x) => x) },
  },
})`;
    const src = `<template><div class="page"><p class="t">{{ ui.isDark }}</p><p class="t">共 {{ ui.rows.length }} 条</p></div></template>
<script setup>import { useUiStore } from '@/stores/ui'
const ui = useUiStore()</script>
<style>.page { background: #0b1020; padding: 16px; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'S', storeSources: { 'ui.ts': storeSrc } });
    const ui = JSON.stringify(r.screen.ui);
    // isDark 含比较运算 → 降级读底层 skin 字段
    expect(ui).toContain('"bind":"ui_skin"');
    // rows 含计算 → 降级读底层 list，并给出显式告警（不静默）
    expect(ui).toContain('"obj":"ui_list","field":"length"');
    expect(r.warnings.some((w) => w.includes('含计算逻辑') && w.includes('R90'))).toBe(true);
  });

  it('R91 模板表达式归一化：可选链与空值兜底', () => {
    const src = `<template><div class="page">
      <p class="t">{{ article?.title }}</p>
      <p class="t">{{ nick || '未命名' }}</p>
    </div></template>
<script setup>const article = ref({ title: '赤壁赋' })
const nick = ref('')</script>
<style>.page { background: #0b1020; padding: 16px; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'S' });
    const ui = JSON.stringify(r.screen.ui);
    expect(ui).toContain('"obj":"article","field":"title"'); // ?. 归一化后按点路径取值
    expect(ui).toContain('bindExpr'); // || 兜底走三元通道
    expect(r.warnings.some((w) => w.includes('可选链'))).toBe(true);
  });

  it('R92 点路径兜底：{{ a.b ?? \'默认\' }} → fieldOf 带 fallback（两端 vrnField 第三参）', () => {
    const src = `<template><div class="page">
      <p class="t">{{ card.title ?? '未命名' }}</p>
      <p class="t">{{ card.sub || '暂无' }}</p>
    </div></template>
<script setup>const card = ref({ title: '', sub: '' })</script>
<style>.page { background: #0b1020; padding: 16px; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const r = vueToIr(src, { screenId: 'S' });
    const ui = JSON.stringify(r.screen.ui);
    expect(ui).toContain('"fallback":"未命名"');
    expect(ui).toContain('"fallback":"暂无"');
    expect(validateIr(r.screen).ok).toBe(true);
    // 产物级验证放在 codegen.swiftui.test.ts（本文件只做转换层断言）
  });

});
