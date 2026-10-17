import { describe, expect, it } from 'vitest';
import { buildNavHost, emitNode, parseRouter, RUNTIME_KT } from '../src/codegen/compose';
import { vueToIr } from '../src/transform/vue2ir';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IrNode } from '../src/ir/schema';

const ROUTER_TS = fileURLToPath(new URL('../../../examples/vuexir-demo/router.ts', import.meta.url));
const SAMPLE_DIR = fileURLToPath(new URL('../../../examples/vuexir-demo', import.meta.url));

const TABS = [
  { id: 'guide', title: '开发指南', icon: 'book.fill', path: '/guide' },
  { id: 'base', title: '基础组件', icon: 'square.grid.2x2.fill', path: '/base' },
];

describe('buildNavHost（Android 详情页导航栏 · 对位 iOS NavigationStack）', () => {
  const out = buildNavHost(
    'com.vrn.vuexirdemo',
    TABS,
    [
      { id: 'button', title: 'Button', path: '/comp/button' },
      { id: 'custom', title: 'RouterTitle', path: '/comp/custom', bg: '#121826' },
    ],
  );

  it('详情路由生成 TopAppBar（标题 + 返回箭头 + popBackStack）', () => {
    expect(out).toContain('composable("/comp/button")');
    expect(out).toContain('TopAppBar(');
    expect(out).toContain('Text("Button", fontSize = 17.sp, fontWeight = FontWeight.Medium)');
    expect(out).toContain('IconButton(onClick = { navController.popBackStack() })');
    expect(out).toContain('Icons.AutoMirrored.Filled.ArrowBack');
  });

  it('详情路由内容包内层 Scaffold 且消费 innerPadding', () => {
    expect(out).toContain('ButtonDetailContent(modifier = Modifier.padding(innerPadding))');
  });

  it('IR navBar.bg / 标题覆盖（R66 子集：bg → TopAppBar containerColor）', () => {
    expect(out).toContain('composable("/comp/custom")');
    expect(out).toContain('Text("RouterTitle"');
    expect(out).toContain('containerColor = Color(0xFF121826)');
  });

  it('未声明 navBar 的详情页背景走 InkBar 主题色', () => {
    expect(out).toContain('containerColor = InkBar');
  });

  it('R-CHROME：tab 顶/底栏归路由自身的 TabScaffold（不再由容器按 currentRoute 开关）', () => {
    // tab 路由包一层 TabScaffold（顶栏 + 底栏）；tab id 与 path 双键都走同一外壳
    expect(out).toContain('composable("guide") { TabScaffold("guide", onSelectTab)');
    expect(out).toContain('composable("/guide") { TabScaffold("guide", onSelectTab)');
    expect(out).toContain('fun TabScaffold(currentTab: String, onSelectTab: (String) -> Unit, content: @Composable (PaddingValues) -> Unit)');
    // 容器层不再有按路由开关的 if/ setOf（该结构会导致导航瞬间退出页内边距塌缩、内容顶到系统栏）
    expect(out).not.toContain('currentRoute in setOf');
    expect(out).not.toContain('currentBackStackEntryAsState');
  });

  it('详情路由不出现底部 tab 栏（对位 iOS push 盖住 tab 栏）', () => {
    const detail = out.slice(out.indexOf('composable("/comp/button")'), out.indexOf('composable("/comp/custom")'));
    expect(detail).not.toContain('NavigationBar');
    expect(detail).toContain('Scaffold(');
  });

  it('生成源包含 AutoMirrored ArrowBack / FontWeight import', () => {
    expect(out).toContain('import androidx.compose.material.icons.automirrored.filled.*');
    expect(out).toContain('import androidx.compose.ui.text.font.FontWeight');
  });

  it('parseRouter：非 tab 路由全部归入 details（含 path）', () => {
    const { tabs, details } = parseRouter(readFileSync(ROUTER_TS, 'utf-8'), SAMPLE_DIR);
    expect(tabs.length).toBeGreaterThan(0);
    const button = details.find((d) => d.id === 'button');
    expect(button?.path).toBe('/comp/button');
    expect(button?.title).toBe('Button');
  });

  it('detail backText：navigationIcon 内 Row（箭头 + 文案）', () => {
    const out = buildNavHost('com.vrn.vuexirdemo', TABS, [
      { id: 'button', title: 'Button', path: '/comp/button', backText: '返回' },
    ]);
    expect(out).toContain('Text(" 返回")');
    expect(out).toContain('Icons.AutoMirrored.Filled.ArrowBack');
  });

  it('detail mode=transparent → containerColor Color.Transparent', () => {
    const out = buildNavHost('com.vrn.vuexirdemo', TABS, [
      { id: 'button', title: 'Button', path: '/comp/button', mode: 'transparent' },
    ]);
    expect(out).toContain('containerColor = Color.Transparent');
  });
});

describe('Android 生成器修复回归（emitNode · 2026 审计 P0/P1）', () => {
  const ctx = {
    warnings: [] as string[],
    pageId: 'p',
    states: [
      { name: 'toast', type: 'string' as const, init: 'success' },
      { name: 'show', type: 'boolean' as const, init: false },
    ],
    handlers: [{ name: 'openPopup', params: '', body: 'show = true' }],
  };

  it('v-if 条件 === 归一为 == 且单引号转双引号（原生 Kotlin 合法）', () => {
    const node: IrNode = {
      type: 'group',
      props: { background: '#10182a' },
      condition: "toast === 'success'",
      children: [{ type: 'text', props: { text: 'ok' } }],
    };
    const out = emitNode(node, ctx, 1);
    expect(out).toContain('if (toast == "success")');
    expect(out).not.toContain('===');
  });

  it('radius+background：clip 先于 background（圆角裁切生效）', () => {
    const node: IrNode = {
      type: 'group',
      props: { background: '#0F1832', radius: 14 },
      children: [{ type: 'text', props: { text: 'x' } }],
    };
    const out = emitNode(node, ctx, 1);
    const clip = out.indexOf('.clip(RoundedCornerShape(14.dp))');
    const bg = out.indexOf('.background(Color(0xFF0F1832))');
    expect(clip).toBeGreaterThanOrEqual(0);
    expect(clip).toBeLessThan(bg);
  });

  it('column 子项未声明宽度 → fillMaxWidth（对齐 CSS block 拉伸语义）', () => {
    const node: IrNode = {
      type: 'group',
      props: { flexDirection: 'column' },
      children: [{ type: 'text', props: { text: '宽' } }],
    };
    const out = emitNode(node, ctx, 1);
    expect(out).toContain('fillMaxWidth()');
  });

  it('无参赋值 handler 内联（@click 引用的 handler body 为纯状态赋值）', () => {
    const node: IrNode = { type: 'text', props: { text: '打开', onClick: 'openPopup' } };
    const out = emitNode(node, ctx, 1);
    expect(out).toContain('.clickable { show = true }');
  });

  it('v-show → Modifier.alpha(if (show) 1f else 0f)', () => {
    const node: IrNode = { type: 'text', props: { text: '浮层', show: 'show' } };
    const out = emitNode(node, ctx, 1);
    expect(out).toContain('.alpha(if (show) 1f else 0f)');
  });
});

describe('MainActivity 系统栏样式（R-SYSTEMBAR · 固定深色主题）', () => {
  it('固定 SystemBarStyle.dark（不跟随系统明暗，避免浅色系统下深色图标不可读）', async () => {
    const { MAIN_ACTIVITY, STYLES_XML } = await import('../src/codegen/compose');
    const kt = MAIN_ACTIVITY('VuexirDemo');
    expect(kt).toContain('statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)');
    expect(kt).toContain('navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)');
    expect(kt).not.toContain('enableEdgeToEdge()\n');
    expect(STYLES_XML).toContain('android:windowLightStatusBar">false');
  });
});

describe('R72 Android 协程生成（async handler 形状子集）', () => {
  const ctx: {
    warnings: string[];
    pageId: string;
    needsScope?: boolean;
    states: { name: string; type: 'string' | 'number' | 'boolean'; init: string | number | boolean }[];
    handlers: { name: string; params: string; body: string; async?: boolean }[];
  } = {
    warnings: [] as string[],
    pageId: 'p',
    states: [
      { name: 'status', type: 'string' as const, init: 'idle' },
      { name: 'count', type: 'number' as const, init: 0 },
    ],
    handlers: [
      {
        name: 'load',
        params: '',
        async: true,
        body: "stateStore.status = 'loading'\nconst res = await fetch('https://x/list.json')\nconst list = JSON.parse(String(res))\nstateStore.count = list.length\nstateStore.status = 'done'",
      },
      { name: 'timer', params: '', body: "setTimeout(function () { stateStore.status = 'timeout' }, 500)" },
      { name: 'weird', params: '', async: true, body: 'const x = await somethingUnsupported(1, 2, 3).map(a => a)' },
    ],
  };

  it('async handler：await fetch → withContext(Dispatchers.IO) + URL().readText()', () => {
    const node: IrNode = { type: 'button', props: { label: '加载', onClick: 'load' } };
    const out = emitNode(node, ctx, 1);
    expect(out).toContain('vrnScope.launch {');
    expect(out).toContain('withContext(Dispatchers.IO) { java.net.URL("https://x/list.json").readText() }');
    expect(out).toContain('val list = org.json.JSONArray(res)');
    expect(out).toContain('count = list.length()');
    expect(ctx.needsScope).toBe(true);
  });

  it('setTimeout（同步 handler 内）→ delay + 续行', () => {
    const node: IrNode = { type: 'button', props: { label: '定时', onClick: 'timer' } };
    const out = emitNode(node, ctx, 1);
    expect(out).toContain('delay(500.toLong())');
    expect(out).toContain('status = "timeout"');
  });

  it('形状外的 async handler → TODO 占位 + 编译期 warning（R15 不静默）', () => {
    const localCtx = { ...ctx, warnings: [] as string[] };
    const node: IrNode = { type: 'button', props: { label: '怪', onClick: 'weird' } };
    const out = emitNode(node, localCtx, 1);
    expect(out).toContain('形状超出协程子集');
    expect(localCtx.warnings.some((w) => w.includes('超出协程子集'))).toBe(true);
  });
});

describe('R94 Compose 颜色与内联 lambda', () => {
  it('rgba() 生成合法 Color 字面量（不再拼出 0xFFRGBA(...)）', () => {
    const src = `<template><div class="page"><div class="mask"><p class="t">遮罩</p></div></div></template>
<style>.page { background: #0b1020; } .mask { background: rgba(0,0,0,0.45); padding: 20px; } .t { font-size: 14px; color: #ffffff; }</style>`;
    const { screen } = vueToIr(src, { screenId: 'Mask' });
    const localCtx = { warnings: [] as string[], pageId: 'p', states: [], handlers: [] };
    const kt = emitNode(screen.ui, localCtx, 1);
    expect(kt).not.toContain('RGBA');
    expect(kt).toMatch(/Color\(0x[0-9A-F]{8}\)/);
  });
});

describe('R95 P1 Android JS 运行时（QuickJS）', () => {
  it('Runtime.kt 暴露 VrnJs（init/eval/drain），与 iOS JavaScriptCore 对位', () => {
    const kt = RUNTIME_KT('com.vrn.demo');
    expect(kt).toContain('object VrnJs');
    expect(kt).toContain('fun eval(');
    expect(kt).toContain('fun drain(');
    expect(kt).toContain('__vrnOut');
    expect(kt).toContain('localStorage');
  });
});
