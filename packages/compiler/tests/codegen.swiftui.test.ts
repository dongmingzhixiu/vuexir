import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateIr } from '../src/ir/schema';
import type { IrScreen, IrNode } from '../src/ir/schema';
import { generateScreenSource, generateComponentSource, collectTheme, buildTheme, generateThemeSource } from '../src/codegen/swiftui';
import { vueToIr } from '../src/transform/vue2ir';

const SAMPLE_VUE = fileURLToPath(new URL('../../../examples/vuexir-demo/pages/Guide.vue', import.meta.url));

function loadSample(): IrScreen {
  const { screen } = vueToIr(readFileSync(SAMPLE_VUE, 'utf-8'), { screenId: 'Guide' });
  const r = validateIr(screen);
  if (!r.ok) throw new Error(`样例校验失败: ${r.issues.map((i) => i.message).join('; ')}`);
  return screen;
}

describe('R85 对象态点路径取值', () => {
  it('ref({...}) 声明为 JSON 字符串状态，模板点路径生成 vrnField 调用', () => {
    const src = `<template><div class="page"><p class="t">共 {{ board.month.label }} 条 · {{ board.tags.length }}</p></div></template>
<script setup>const board = ref({ month: { label: '10 月' }, tags: '生日' })</script>
<style>.page { background: #0f1832; } .t { font-size: 13px; color: #ffffff; }</style>`;
    const { screen } = vueToIr(src, { screenId: 'BoardCase' });
    expect(validateIr(screen).ok).toBe(true);
    const st = (screen.state ?? []).find((x) => x.name === 'board');
    expect(st?.obj).toBe(true);
    expect(String(st?.init)).toContain('"label"');
    const swift = generateScreenSource(screen, { theme: buildTheme(collectTheme(screen.ui)) });
    expect(swift).toContain('vrnField(board, "month.label")');
    expect(swift).toContain('vrnField(board, "tags.length")');
    expect(swift).toContain('@State private var board');
  });
});

describe('R92 点路径兜底产物', () => {
  it('fieldOf 带 fallback 时生成 vrnField 三参调用', () => {
    const src = `<template><div class="page"><p class="t">{{ card.title ?? '未命名' }}</p></div></template>
<script setup>const card = ref({ title: '' })</script>
<style>.page { background: #0b1020; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const { screen } = vueToIr(src, { screenId: 'CardCase' });
    expect(validateIr(screen).ok).toBe(true);
    const swift = generateScreenSource(screen, { theme: buildTheme(collectTheme(screen.ui)) });
    expect(swift).toContain('vrnField(card, "title", "未命名")');
  });
});

describe('R74 保留名自动重命名（产物断言）', () => {
  it('模板中名为 body 的状态生成 bodyText，且 SwiftUI 结构合法', () => {
    const src = `<template><div class="page"><p class="t">{{ body }}</p></div></template>
<script setup>const body = ref('你好')</script>
<style>.page { background: #0a0f1e; } .t { font-size: 15px; color: #ffffff; }</style>`;
    const { screen } = vueToIr(src, { screenId: 'BodyCase' });
    const r = validateIr(screen);
    expect(r.ok).toBe(true);
    const stateNames = (screen.state ?? []).map((st) => st.name);
    expect(stateNames).toContain('bodyText');
    expect(stateNames).not.toContain('body');
    const swift = generateScreenSource(screen, { theme: buildTheme(collectTheme(screen.ui)) });
    expect(swift).toContain('@State private var bodyText');
    // 视图结构体自身的 body 属性不能被覆盖
    expect(swift.match(/var body: some View/g)?.length).toBe(1);
  });
});

describe('SwiftUI 生成器 v0（P0.3）', () => {
  it('生成 Guide.vue 源码且包含关键结构', () => {
    const src = generateScreenSource(loadSample());
    expect(src).toContain('import SwiftUI');
    expect(src).toContain('struct GuideView: View');
    expect(src).toContain('Text("开发指南 · 5 项")');
    expect(src).toContain('Vuexir');
    
    expect(src).toContain('.frame(maxWidth: .infinity)'); // R16 fill 语义
    expect(src).toContain('Color(red: 217/255.0, green: 179/255.0, blue: 108/255.0)'); // 鎏金
        expect(src).toContain('RoundedRectangle(cornerRadius: 14).stroke('); // 卡片描边
  });

  it('swiftc -parse 语法检查零错误（R14 自验）', () => {
    const src = generateScreenSource(loadSample());
    const dir = mkdtempSync(join(tmpdir(), 'vrn-swift-'));
    const file = join(dir, 'ScreenView.swift');
    writeFileSync(file, src);
    const r = spawnSync('swiftc', ['-parse', file], { encoding: 'utf-8' });
    expect(r.status, r.stderr || r.stdout).toBe(0);
  });

  it('未知屏 id 生成合法标识符', () => {
    const screen = loadSample();
    screen.id = 'x-in-fa';
    const src = generateScreenSource(screen);
    expect(src).toContain('struct XInFaView: View');
  });
});

describe('R-H/R-G 解释器布局语义（2026-10-15）', () => {
  function gen(ui: IrNode): { src: string; warnings: string[] } {
    const screen: IrScreen = {
      id: 'Test',
      title: 't',
      runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [ui] },
    };
    const r = validateIr(screen);
    expect(r.ok, r.issues.map((i) => i.message).join(';')).toBe(true);
    const warnings: string[] = [];
    const src = generateScreenSource(screen, { warnings });
    return { src, warnings };
  }
  const count = (src: string, sub: string) => (src.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

  it('R-G2: gap 透传 <template> condition 子项（多 tab 兄弟）', () => {
    const { src } = gen({
      type: 'group',
      props: { flexDirection: 'column', gap: 16 },
      children: [
        {
          type: 'group',
          props: { flexDirection: 'column' },
          sourceTag: 'template',
          condition: 'tabIndex == 0',
          children: [{ type: 'text', props: { text: 'A' } }, { type: 'text', props: { text: 'B' } }],
        },
        {
          type: 'group',
          props: { flexDirection: 'column' },
          sourceTag: 'template',
          condition: 'tabIndex == 1',
          children: [{ type: 'text', props: { text: 'C' } }],
        },
      ],
    });
    expect(src).toContain('if tabIndex == 0 {');
    // 外层 .screen 容器 + 每个 condition 内部内容层均为 spacing:16（透传）
    expect(count(src, 'spacing: 16')).toBeGreaterThanOrEqual(2);
  });

  it('R-G2: <div v-if>（无 sourceTag）不透传 gap，内部 spacing 保持 0', () => {
    const { src } = gen({
      type: 'group',
      props: { flexDirection: 'column', gap: 16 },
      children: [
        {
          type: 'group',
          props: { flexDirection: 'column' },
          condition: 'show',
          children: [{ type: 'text', props: { text: 'A' } }],
        },
      ],
    });
    expect(count(src, 'spacing: 16')).toBe(1); // 仅外层，内部不透传
  });

  it('R-H4: column 无确定高度 + justify-content:center → 降级无 Spacer + warning', () => {
    const { src, warnings } = gen({
      type: 'group',
      props: { flexDirection: 'column', justifyContent: 'center' },
      children: [{ type: 'text', props: { text: 'A' } }],
    });
    expect(src).not.toContain('Spacer');
    expect(warnings.some((w) => w.includes('R-H4'))).toBe(true);
  });

  it('R-H4: row justify-content:spaceBetween 永不降级（水平分配恒有确定宽度）', () => {
    const { src, warnings } = gen({
      type: 'group',
      props: { flexDirection: 'row', justifyContent: 'spaceBetween' },
      children: [{ type: 'text', props: { text: 'A' } }, { type: 'text', props: { text: 'B' } }],
    });
    expect(src).toContain('Spacer(minLength: 0)');
    expect(warnings.some((w) => w.includes('R-H4'))).toBe(false);
  });

  it('R-H3: column flex:1 子项父高度不确定 → 降级无 maxHeight + warning', () => {
    const { src, warnings } = gen({
      type: 'group',
      props: { flexDirection: 'column' },
      children: [
        {
          type: 'group',
          props: { flexDirection: 'column', flex: 1 },
          children: [{ type: 'text', props: { text: 'A' } }],
        },
      ],
    });
    // root 撑满屏自身也有 maxHeight；子项弹性拉伸的专用格式是 alignment: .top
    expect(src).not.toContain('minHeight: 0, maxHeight: .infinity)');
    expect(warnings.some((w) => w.includes('R-H3'))).toBe(true);
  });

  it('R-H3: flex:1 子项父高度确定（数字 height）→ 保留 maxHeight，无 warning', () => {
    const { src, warnings } = gen({
      type: 'group',
      props: { flexDirection: 'column', height: 300 },
      children: [
        {
          type: 'group',
          props: { flexDirection: 'column', flex: 1 },
          children: [{ type: 'text', props: { text: 'A' } }],
        },
      ],
    });
    expect(src).toContain('minHeight: 0, maxHeight: .infinity)');
    expect(warnings.some((w) => w.includes('R-H3'))).toBe(false);
  });

  it('R-H5: row align-items:stretch 容器高度不确定 → 降级无拉高 + warning', () => {
    const { src, warnings } = gen({
      type: 'group',
      props: { flexDirection: 'row', alignItems: 'stretch' },
      children: [{ type: 'text', props: { text: 'A' } }],
    });
    expect(src).not.toContain('.frame(maxHeight: .infinity, alignment: .top)');
    expect(warnings.some((w) => w.includes('R-H5'))).toBe(true);
  });
});

describe('R41 组件独立 View 生成', () => {
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

  it('使用点 component 节点 → <Name>View(prop: "…") + 位置 frame（flex:1 提升）', () => {
    const src = `<template>
  <div class="stats"><StatCell value="372.8" label="累计行里" /></div>
</template>
<style>.stats { display: flex; }</style>`;
    const r = vueToIr(src, { components: { StatCell: STAT_CELL } });
    const screen: IrScreen = {
      id: 'Test',
      title: 't',
      runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [r.screen.ui.children![0]] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('StatCellView(value: "372.8", label: "累计行里")');
    // 组件根 flex:1 已提升到使用点 → 使用点带位置 frame（占满父容器交叉/主轴，具体形态随容器轴）
    expect(out).toContain('.frame(maxWidth: .infinity');
    // 页面不再内联展开组件内容（无 .v/.l 文本）
    expect(out).not.toContain('Text("累计行里")');
  });

  it('generateComponentSource → struct + let props + Text(ref)，swiftc -parse 通过', () => {
    const src = `<template>
  <div class="stats"><StatCell value="1" label="x" /></div>
</template>
<style>.stats { display: flex; }</style>`;
    const r = vueToIr(src, { components: { StatCell: STAT_CELL } });
    const comp = r.components![0];
    const out = generateComponentSource(comp.name, comp.ui);
    expect(out).toContain('struct StatCellView: View');
    expect(out).toContain('let value: String');
    expect(out).toContain('let label: String');
    expect(out).toContain('Text(value)'); // {{ value }} → Swift 属性引用
    expect(out).toContain('Text(label)');
    expect(out).not.toContain('flex'); // 根布局 props 已剥离
    // swiftc -parse 语法校验
    const dir = mkdtempSync(join(tmpdir(), 'vrn-comp-'));
    const file = join(dir, 'StatCellView.swift');
    writeFileSync(file, out);
    const rr = spawnSync('swiftc', ['-parse', file], { encoding: 'utf-8' });
    expect(rr.status, rr.stderr || rr.stdout).toBe(0);
  });
});

describe('R42 Theme token 抽离', () => {
  it('collectTheme/buildTheme/generateThemeSource：颜色去重命名 + 字体常量', () => {
    const tokens = collectTheme(
      { type: 'group', props: { flexDirection: 'column', background: '#f3dca0', borderColor: '#d9b36c' }, children: [
        { type: 'text', props: { text: 'a', fontSize: 17, fontWeight: 'bold', color: '#f3dca0' } },
        { type: 'text', props: { text: 'b', fontSize: 10.5, color: '#000000' } },
        { type: 'button', props: { label: 'x', color: '#ffffff' } },
      ] },
    );
    const theme = buildTheme(tokens);
    expect(theme.colorNames.get('f3dca0')).toBe('cf3dca0'); // 非语义色 → c<hex>
    expect(theme.colorNames.get('d9b36c')).toBe('cd9b36c');
    expect(theme.colorNames.get('000000')).toBe('black'); // 语义色
    expect(theme.colorNames.get('ffffff')).toBe('white');
    const src = generateThemeSource(theme);
    expect(src).toContain('static let cf3dca0 = Color(red: 243/255.0, green: 220/255.0, blue: 160/255.0)');
    expect(src).toContain('static let black = Color(red: 0/255.0, green: 0/255.0, blue: 0/255.0)');
    expect(src).toContain('static let fs17b = Font.system(size: 17, weight: .bold)');
    expect(src).toContain('static let fs10_5r = Font.system(size: 10.5, weight: .regular)');
    expect(src).toContain('static let fs15m = Font.system(size: 15, weight: .medium)'); // button 默认
  });

  it('theme 模式：生成 Theme.* 引用，不再内联 Color(red:…) 长表达式', () => {
    const tokens = collectTheme({
      type: 'group',
      props: { flexDirection: 'column', background: '#101828' },
      children: [{ type: 'text', props: { text: '道印', fontSize: 17, fontWeight: 'bold', color: '#f3dca0' } }],
    });
    const theme = buildTheme(tokens);
    const screen: IrScreen = {
      id: 'Test',
      title: 't',
      runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', background: '#101828' }, children: [
          { type: 'text', props: { text: '道印', fontSize: 17, fontWeight: 'bold', color: '#f3dca0' } },
        ] },
      ] },
    };
    const out = generateScreenSource(screen, { theme });
    expect(out).toContain('.background(Theme.c101828)');
    expect(out).toContain('.foregroundColor(Theme.cf3dca0)');
    expect(out).toContain('.font(Theme.fs17b)');
    expect(out).not.toContain('Color(red: 243/255.0');
  });

  it('无 theme（回退）：保持旧内联 Color(red:…) 格式', () => {
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'text', props: { text: 'x', color: '#f3dca0' } },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('Color(red: 243/255.0, green: 220/255.0, blue: 160/255.0)');
  });
});

describe('R43 frame 组合抽离', () => {
  it('theme 模式：高频 frame 组合 → View 扩展短调用', () => {
    const tokens = collectTheme({
      type: 'group',
      props: { flexDirection: 'column', background: '#101828' },
      children: [
        { type: 'text', props: { text: 'a', color: '#f3dca0' } },
        { type: 'group', props: { flexDirection: 'row', flex: 1 }, children: [] },
        { type: 'divider', props: {} },
      ],
    });
    const theme = buildTheme(tokens);
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', background: '#101828' }, children: [
          { type: 'text', props: { text: 'a', color: '#f3dca0' } },
        ] },
        // root 直子（definiteHeight=true）→ flex:1 生效 → fillH0()
        { type: 'group', props: { flexDirection: 'row', flex: 1 }, children: [] },
        { type: 'divider', props: {} },
      ] },
    };
    const out = generateScreenSource(screen, { theme });
    expect(out).toContain('.fillW(.leading)');  // column 子项默认填满父宽
    expect(out).toContain('.fillH0()');         // root 直子 flex:1（minHeight 0）
    expect(out).toContain('.fillW()');          // divider / width:fill
    expect(out).toContain('.fillAll()');        // root 直子撑满
    expect(out).not.toContain('.frame(maxWidth: .infinity, alignment: .leading)');
    expect(out).not.toContain('.frame(minHeight: 0, maxHeight: .infinity)');
  });

  it('View 扩展源码：生成 fillW/fillW0/fillH/fillH0/fillAll 方法', () => {
    const tokens = collectTheme({ type: 'text', props: { text: 'x', color: '#ffffff' } });
    const src = generateThemeSource(buildTheme(tokens));
    expect(src).toContain('func fillW(_ align: Alignment = .center) -> some View { frame(maxWidth: .infinity, alignment: align) }');
    expect(src).toContain('func fillW0(_ align: Alignment = .center) -> some View { frame(minWidth: 0, maxWidth: .infinity, alignment: align) }');
    expect(src).toContain('func fillH(_ align: Alignment = .center) -> some View { frame(maxHeight: .infinity, alignment: align) }');
    expect(src).toContain('func fillH0() -> some View { frame(minHeight: 0, maxHeight: .infinity) }');
    expect(src).toContain('func fillAll() -> some View { frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading) }');
  });

  it('无 theme（回退）：保持内联 frame 表达式', () => {
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', flex: 1 }, children: [] },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('.frame(minHeight: 0, maxHeight: .infinity)');
  });
});

describe('R44 padding 链 / 胶囊标签抽离', () => {
  it('theme 模式：4 边 padding → .pad(top:right:bottom:left:)', () => {
    const tokens = collectTheme({ type: 'text', props: { text: 'x', color: '#ffffff' } });
    const theme = buildTheme(tokens);
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', padding: { top: 15, right: 20, bottom: 15, left: 20 }, background: '#101828' }, children: [
          { type: 'text', props: { text: 'a', color: '#f3dca0' } },
        ] },
      ] },
    };
    const out = generateScreenSource(screen, { theme });
    expect(out).toContain('.pad(top: 15, right: 20, bottom: 15, left: 20)');
    expect(out).not.toContain('.padding(.top, 15) .padding(.trailing, 20)');
  });

  it('theme 模式：胶囊标签（大圆角+同色背景描边+对称 padding）→ .tagCapsule(...)', () => {
    const tokens = collectTheme({
      type: 'group',
      props: { flexDirection: 'column', radius: 99, background: '#d9b36c', borderColor: '#d9b36c', borderWidth: 1, padding: { top: 3, right: 10, bottom: 3, left: 10 } },
      children: [{ type: 'text', props: { text: '道心稳固', fontSize: 9.5, color: '#f3dca0' } }],
    });
    const theme = buildTheme(tokens);
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', radius: 99, background: '#d9b36c', borderColor: '#d9b36c', borderWidth: 1, padding: { top: 3, right: 10, bottom: 3, left: 10 } }, children: [
          { type: 'text', props: { text: '道心稳固', fontSize: 9.5, color: '#f3dca0' } },
        ] },
      ] },
    };
    const out = generateScreenSource(screen, { theme });
    expect(out).toContain('.tagCapsule(Theme.cd9b36c, radius: 99, bg: 1, stroke: 1, h: 10, v: 3)');
    expect(out).not.toContain('.cornerRadius(99) .overlay(RoundedRectangle(cornerRadius: 99)');
  });

  it('胶囊判定保守：背景/描边不同色 → 不抽离', () => {
    const tokens = collectTheme({ type: 'text', props: { text: 'x', color: '#ffffff' } });
    const theme = buildTheme(tokens);
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', radius: 99, background: '#101828', borderColor: '#d9b36c', borderWidth: 1, padding: { top: 3, right: 10, bottom: 3, left: 10 } }, children: [] },
      ] },
    };
    const out = generateScreenSource(screen, { theme });
    expect(out).not.toContain('.tagCapsule(');
    expect(out).toContain('.cornerRadius(99)');
  });

  it('无 theme（回退）：保持 4 段 padding 链', () => {
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'group', props: { flexDirection: 'column', padding: { top: 15, right: 20, bottom: 15, left: 20 } }, children: [] },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('.padding(.top, 15)');
    expect(out).toContain('.padding(.leading, 20)');
  });
});

/* ============ M1 状态与插值生成（@State + Text(bind) + TextField + onSet expr） ============ */

describe('M1 状态与插值生成', () => {
  it('页面 state → @State 声明；{{ state }} → Text(<@State 名>)', () => {
    const screen: IrScreen = {
      id: 'State', title: 't', runtime: 'native',
      state: [
        { name: 'count', init: 0 },
        { name: 'note', init: '' },
      ],
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'text', bind: { key: 'count' } },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('@State private var count = 0');
    expect(out).toContain('@State private var note = ""');
    expect(out).toContain('Text("\\(count)")');
    expect(out).not.toContain('Text("{{ count }}")');
  });

  it('onSet kind=expr → Swift 表达式原样嵌入（不加引号）；literal 字符串保持加引号', () => {
    const screen: IrScreen = {
      id: 'State', title: 't', runtime: 'native',
      state: [{ name: 'count', init: 0 }],
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'button', props: { label: '+', onSet: { var: 'count', value: 'count + 1', kind: 'expr' } } },
        { type: 'button', props: { label: 'set', onSet: { var: 'note', value: 'hi', kind: 'literal' } } },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('action: { count = count + 1; Runtime.shared.pushState("count", count) }');
    expect(out).toContain('action: { note = "hi"; Runtime.shared.pushState("note", note) }');
  });

  it('v-model input → TextField 绑定 $<state>；placeholder 透传', () => {
    const screen: IrScreen = {
      id: 'State', title: 't', runtime: 'native',
      state: [{ name: 'note', init: '' }],
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'input', props: { value: 'note', placeholder: '输入备注…' } },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('TextField("输入备注…", text: $note)');
  });

  it('无 value 绑定的 input → 只读空 TextField（.constant("")）', () => {
    const screen: IrScreen = {
      id: 'State', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [
        { type: 'input', props: { placeholder: 'x' } },
      ] },
    };
    const out = generateScreenSource(screen);
    expect(out).toContain('TextField("x", text: .constant(""))');
  });
});

/* ============ M2 动态结构生成（ForEach + 循环变量 + 三元 + 动态样式） ============ */

describe('M2 v-for / 表达式生成', () => {
  function listScreen(): IrScreen {
    return {
      id: 'List', title: 't', runtime: 'native',
      state: [
        { name: 'selected', init: 0 },
        { name: 'accent', init: '#d9b36c' },
      ],
      ui: {
        type: 'root', props: { width: 'fill', height: 640 }, children: [
          {
            type: 'for', vfor: { list: ['云游', '炼气', '归元'], itemKey: 'item', indexKey: 'i' },
            children: [
              {
                type: 'group', props: { flexDirection: 'row', onSet: { var: 'selected', value: 'i', kind: 'expr' } },
                active: { when: 'selected == i', props: { background: '#2a2310' } },
                children: [
                  { type: 'text', bind: { key: 'i' } },
                  { type: 'text', bind: { key: 'item' } },
                  { type: 'text', props: { bindExpr: 'selected == i ? "✓" : "○"' } },
                  { type: 'text', props: { bind: 'accent', colorDynamic: 'accent' } },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  it('for 节点（R-VFOBJ-D 数据抽离）→ ForEach(list.indices) + let item = list[i]；数据声明为 struct 属性', () => {
    const out = generateScreenSource(listScreen());
    expect(out).toContain('private let vforList: [String] = [');
    expect(out).toContain('ForEach(vforList.indices, id: \\.self) { i in');
    expect(out).toContain('let item = vforList[i]');
    expect(out).toContain('Text("\\(i)")');
    expect(out).toContain('Text("\\(item)")');
    expect(out).toContain('Text(accent)');
  });

  it('onSet expr 原样嵌入（selected = i）；active 背景条件切换；三元 bindExpr → Text(expr)', () => {
    const out = generateScreenSource(listScreen());
    expect(out).toContain('action: { selected = i; Runtime.shared.pushState("selected", selected) }');
    expect(out).toContain('.background(selected == i ? Color(red: 42/255.0, green: 35/255.0, blue: 16/255.0) : Color.clear)');
    expect(out).toContain('Text(selected == i ? "✓" : "○")');
    expect(out).toContain('.foregroundColor(Color(hex: accent))');
  });

  it('数字数组 → 属性声明 [Int]，插值 Text("\(item)") 兼容', () => {
    const screen = listScreen();
    (screen.ui.children![0] as IrNode).vfor = { list: [1, 2, 3], itemKey: 'item', indexKey: 'i' };
    const out = generateScreenSource(screen);
    expect(out).toContain('private let vforList: [Int] = [');
    expect(out).toContain('let item = vforList[i]');
  });

  it('fontSizeDynamic → .font(.system(size: <state>))', () => {
    const screen = listScreen();
    (screen.ui.children![0] as IrNode).children = [
      { type: 'text', props: { text: 'x', fontSizeDynamic: 'fs' } },
    ];
    const out = generateScreenSource(screen);
    expect(out).toContain('.font(.system(size: fs))');
  });
});

describe('iOS 生成器修复回归（2026 审计 P0/P1）', () => {
  function genRaw(ui: IrNode, extra: Partial<IrScreen> = {}): { src: string; warnings: string[] } {
    const screen: IrScreen = {
      id: 'Test', title: 't', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [ui] },
      ...extra,
    };
    const r = validateIr(screen);
    expect(r.ok, r.issues.map((i) => i.message).join(';')).toBe(true);
    const warnings: string[] = [];
    const src = generateScreenSource(screen, { warnings });
    return { src, warnings };
  }

  it('R-BTNEMPTY：无事件 button → Button(action: {}) + warning（不生成非法 Button()）', () => {
    const { src, warnings } = genRaw({
      type: 'group', props: { flexDirection: 'column' },
      children: [{ type: 'button', props: { label: '无事件' } }],
    });
    expect(src).toContain('Button(action: {}) {');
    expect(warnings.some((w) => w.includes('button 无 onSet/onClick'))).toBe(true);
  });

  it('Text(Bool) → String(describing:)（Text(Bool) 无构造匹配，typecheck 失败）', () => {
    const { src } = genRaw(
      { type: 'group', props: { flexDirection: 'column' }, children: [{ type: 'text', props: { bind: 'done' } }] },
      { state: [{ name: 'done', init: false }] },
    );
    expect(src).toContain('Text(String(describing: done))');
  });

  it('R-TEXTCLICK：@click 挂在 text 上 → onTapGesture（此前静默丢失交互）', () => {
    const { src } = genRaw({
      type: 'group', props: { flexDirection: 'column' },
      children: [{ type: 'text', props: { text: '点我', onClick: 'doThing' } }],
    });
    expect(src).toContain('.onTapGesture { Runtime.shared.invoke("doThing") }');
  });

  it('M4b 动态列表 dynField → as? [String: Any] 取值（Any 元素下标可编译）', () => {
    const { src } = genRaw(
      {
        type: 'group', props: { flexDirection: 'column' },
        children: [{
          type: 'for', vfor: { listState: 'rows', itemKey: 'item', indexKey: 'i' },
          children: [{ type: 'text', props: { dynField: { var: 'item', field: 'name' } } }],
        }],
      },
      { state: [{ name: 'rows', init: '' }] },
    );
    expect(src).toContain('(item as? [String: Any])?["name"] as? String');
  });

  it('divider/spacer height 仅数字（fill 降级为 Spacer(minLength: 0) 而非非法 Swift）', () => {
    const { src } = genRaw({
      type: 'group', props: { flexDirection: 'column' },
      children: [{ type: 'divider', props: { height: 2 } }, { type: 'spacer', props: { height: 'fill' } }],
    });
    expect(src).toContain('.frame(height: 2)');
    expect(src).toContain('Spacer(minLength: 0)');
    expect(src).not.toContain('height: fill');
  });

  it('CSS opacity → .opacity(N)（schema 已支持，端到端渲染）', () => {
    const { src } = genRaw({
      type: 'group', props: { flexDirection: 'column' },
      children: [{ type: 'text', props: { text: '半透明', opacity: 0.5 } }],
    });
    expect(src).toContain('.opacity(0.5)');
  });

  it('navBar 修饰链只出现一次（此前 navBarModifiers 被调用两次产生重复链）', () => {
    const screen: IrScreen = {
      id: 'Nav', title: 't', runtime: 'native',
      navBar: { title: '标题X' },
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [{ type: 'group', props: { flexDirection: 'column' }, children: [{ type: 'text', props: { text: 'x' } }] }] },
    };
    expect(validateIr(screen).ok).toBe(true);
    const src = generateScreenSource(screen);
    expect((src.match(/\.navigationTitle\(/g) ?? []).length).toBe(1);
  });

  it('navBar.backText 颜色走 colorExpr（不再引用不存在的 Theme.cd9b36c）', () => {
    const screen: IrScreen = {
      id: 'NavB', title: 't', runtime: 'native',
      navBar: { title: '标题Y', backText: '返回' },
      ui: { type: 'root', props: { width: 'fill', height: 640 }, children: [{ type: 'group', props: { flexDirection: 'column' }, children: [{ type: 'text', props: { text: 'x' } }] }] },
    };
    expect(validateIr(screen).ok).toBe(true);
    const src = generateScreenSource(screen);
    expect(src).toContain('返回');
    expect(src).not.toContain('Theme.cd9b36c');
  });

  it('indexVar 跟随 v-for 声明的 indexKey（不再硬编码 i）', () => {
    const screen: IrScreen = {
      id: 'Idx', title: 't', runtime: 'native',
      ui: {
        type: 'root', props: { width: 'fill', height: 640 }, children: [
          { type: 'for', vfor: { list: ['a', 'b'], itemKey: 'item', indexKey: 'idx' }, children: [{ type: 'text', props: { bind: 'idx' } }] },
        ],
      },
    };
    expect(validateIr(screen).ok).toBe(true);
    const src = generateScreenSource(screen);
    expect(src).toContain('let item = vforList[idx]');
    expect(src).toContain('{ idx in');
  });
});

describe('页面根滚动与安全区（R-PAGESCROLL / R-SAFEAREA）', () => {
  function page(extra: Partial<IrScreen> = {}): IrScreen {
    return {
      id: 'Scroll', title: 't', runtime: 'native',
      ui: {
        type: 'root',
        props: { width: 'fill', height: 640, background: '#0a0f1e' },
        children: [{ type: 'group', props: { width: 'fill', height: 'fill' }, children: [{ type: 'text', props: { text: 'x' } }] }],
      },
      ...extra,
    };
  }

  it('根内容统一包 ScrollView + 视口 minHeight（内容超高可滚动，内容不足仍铺满视口）', () => {
    const src = generateScreenSource(page());
    expect(src).toContain('GeometryReader { _vrnViewport in');
    expect(src).toContain('ScrollView {');
    expect(src).toContain('.frame(maxWidth: .infinity, minHeight: _vrnViewport.size.height, alignment: .topLeading)');
  });

  it('背景层 ignoresSafeArea（否则底部安全区露出系统底色，浅色模式为白条）', () => {
    const src = generateScreenSource(page());
    expect(src).toContain('Color(red: 10/255.0, green: 15/255.0, blue: 30/255.0).frame(maxWidth: .infinity, maxHeight: .infinity).ignoresSafeArea()');
  });

  it('详情页（默认绑定模式）同样可滚动，不再依赖按钮数启发式', () => {
    const src = generateScreenSource(page());
    expect(src).toContain('ScrollView {');
  });
});

describe('iOS 详情页导航栏兜底（R66 · 对位 Android TopAppBar）', () => {
  it('未声明 navBar 的页面 → 用 IR title 渲染页面级导航栏', () => {
    const screen: IrScreen = {
      id: 'CalendarDetail', title: 'Calendar', runtime: 'native',
      ui: { type: 'root', props: { width: 'fill', height: 640, background: '#0a0f1e' }, children: [{ type: 'group', props: {}, children: [{ type: 'text', props: { text: 'x' } }] }] },
    };
    const src = generateScreenSource(screen);
    expect(src).toContain('.navigationTitle("Calendar")');
    expect(src).toContain('.navigationBarTitleDisplayMode(.inline)');
    expect(src).toContain('.toolbarColorScheme(.dark, for: .navigationBar)');
  });

  it('声明 navBar 的页面仍以 navBar.title 优先', () => {
    const screen: IrScreen = {
      id: 'X', title: 'IRTitle', runtime: 'native', navBar: { title: '自定义标题' },
      ui: { type: 'root', props: { width: 'fill', height: 640, background: '#0a0f1e' }, children: [{ type: 'group', props: {}, children: [{ type: 'text', props: { text: 'x' } }] }] },
    };
    const src = generateScreenSource(screen);
    expect(src).toContain('.navigationTitle("自定义标题")');
    expect(src).not.toContain('.navigationTitle("IRTitle")');
  });
});

describe('R70/R71 双端渲染（单边边框 / 裁剪）', () => {
  function boxScreen(props: Record<string, unknown>): IrScreen {
    return {
      id: 'Box', title: 't', runtime: 'native',
      ui: {
        type: 'root', props: { width: 'fill', height: 640, background: '#0a0f1e' },
        children: [{ type: 'group', props: { width: 'fill', ...props }, children: [{ type: 'text', props: { text: 'x' } }] }],
      },
    };
  }
  it('单边边框 → overlay 矩形贴边（0.5px 发丝线）', () => {
    const src = generateScreenSource(boxScreen({ borderSides: { bottom: { width: 0.5, color: '#22304a' } } }));
    expect(src).toContain('.overlay(alignment: .bottom) { Rectangle().fill(');
    expect(src).toContain('.frame(height: 0.5) }');
  });
  it('overflow:hidden → .clipped()', () => {
    const src = generateScreenSource(boxScreen({ clip: true }));
    expect(src).toContain('.clipped()');
  });
  it('borderWidth:0（border-style:none）不生成描边 overlay', () => {
    const src = generateScreenSource(boxScreen({ borderWidth: 0, borderColor: '#22304a' }));
    expect(src).not.toContain('.stroke(');
  });
});
