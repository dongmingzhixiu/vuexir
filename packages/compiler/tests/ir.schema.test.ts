import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAndValidateIr, validateIr, type IrNode, type IrScreen } from '../src/ir/schema';
import { vueToIr } from '../src/transform/vue2ir';

const SAMPLE_VUE = fileURLToPath(new URL('../../../examples/vuexir-demo/pages/Guide.vue', import.meta.url));

/** 构造最小合法 root 节点 */
function root(children: IrNode[] = [], props: Record<string, unknown> = {}): IrNode {
  return { type: 'root', props: { width: 'fill', height: 640, ...props }, children };
}

function screen(ui: IrNode): IrScreen {
  return { id: 't', title: 'T', runtime: 'native', width: 360, height: 640, ui };
}

describe('IR Schema v0：合法样例', () => {
  it('Guide.vue 转换产物通过校验（Vue→IR→Schema）', () => {
    const { screen } = vueToIr(readFileSync(SAMPLE_VUE, 'utf-8'), { screenId: 'Guide' });
    const r = validateIr(screen);
    expect(r.ok, r.issues.map((i) => `${i.path}: ${i.message}`).join('\n')).toBe(true);
    expect(screen.id).toBe('Guide');
    expect(screen.ui.type).toBe('root');
    // 根包裹层 → 模板根 div.screen（padding/gap/background 生效）
    const screenGroup = screen.ui.children![0];
    expect(screenGroup.type).toBe('group');
    expect(screenGroup.children![0].props).toMatchObject({ padding: 16, gap: 14 });
    // M4b：背景提升到 root
    expect(screen.ui.props).toMatchObject({ background: '#0a0f1e' });
  });

  it('8 种节点类型各自最小合法用例通过', () => {
    const nodes: IrNode[] = [
      { type: 'group', props: { flexDirection: 'row', gap: 4 }, children: [{ type: 'text', props: { text: 'x' } }] },
      { type: 'text', props: { text: 'hello', fontSize: 14, color: '#efeadd' } },
      { type: 'image', props: { width: 24, height: 24, src: 'x.png' } },
      { type: 'button', props: { label: 'OK', height: 44 } },
      { type: 'scroll', props: { flexDirection: 'column' }, children: [{ type: 'text', props: { text: 'x' } }] },
      { type: 'spacer', props: { flex: 1 } },
      { type: 'divider', props: { height: 1, background: '#5b647e' } },
    ];
    for (const n of nodes) {
      const r = validateIr(screen(root([n])));
      expect(r.ok, `${n.type}: ${r.issues.map((i) => i.message).join('; ')}`).toBe(true);
    }
  });
});

describe('IR Schema v0：非法输入拦截', () => {
  it('未知节点类型被拒绝', () => {
    const r = validateIr(screen(root([{ type: 'video' } as unknown as IrNode])));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('未知节点类型'))).toBe(true);
  });

  it('未知 prop 被拒绝（防 Taro 化 R17）', () => {
    const r = validateIr(screen(root([{ type: 'text', props: { text: 'x', shadowBlur: 9 } as unknown as IrNode['props'] }])));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('不在 text 允许集内'))).toBe(true);
  });

  it('绝对像素宽度超限被拒绝（R16）', () => {
    const r = validateIr(screen(root([{ type: 'group', props: { width: 336, flexDirection: 'column' }, children: [root([])] }])));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('违反 R16'))).toBe(true);
  });

  it('text 无内容被拒绝（ref 模式豁免：组件 View 内 {{ prop }} → Text(prop)）', () => {
    const r = validateIr(screen(root([{ type: 'text', props: { fontSize: 14 } }])));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('必须有 props.text / props.ref / props.bind / props.bindExpr / props.fieldOf 或 bind'))).toBe(true);
    // ref 模式合法
    const ok = validateIr(screen(root([{ type: 'text', props: { ref: 'value' } }])));
    expect(ok.ok).toBe(true);
  });

  it('容器无 children / 叶子带 children 被拒绝', () => {
    expect(validateIr(screen(root([{ type: 'group', props: { flexDirection: 'row' } }]))).ok).toBe(false);
    expect(validateIr(screen(root([{ type: 'text', props: { text: 'x' }, children: [root([])] }]))).ok).toBe(false);
  });

  it('重复 key 被拒绝', () => {
    const r = validateIr(screen(root([
      { type: 'text', key: 'dup', props: { text: 'a' } },
      { type: 'text', key: 'dup', props: { text: 'b' } },
    ])));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('key 重复'))).toBe(true);
  });

  it('非法颜色值被拒绝', () => {
    const r = validateIr(screen(root([{ type: 'text', props: { text: 'x', color: 'blue-ish' } }])));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('"color" 值非法'))).toBe(true);
  });

  it('JSON 语法错误给出定位信息', () => {
    const r = parseAndValidateIr('{ bad json');
    expect(r.ok).toBe(false);
    expect(r.issues[0].path).toBe('(json)');
  });
});

describe('IR Schema 补强（2026 审计 · 交叉校验）', () => {
  it('title 缺失 → issue', () => {
    const s = screen(root([{ type: 'text', props: { text: 'x' } }]));
    delete (s as { title?: string }).title;
    const r = validateIr(s);
    expect(r.issues.some((i) => i.path === 'title')).toBe(true);
  });

  it('navBar：mode 枚举 / bg 非法 / backText 类型', () => {
    const s = screen(root([{ type: 'text', props: { text: 'x' } }]));
    s.navBar = { title: 'T', mode: 'sticky' as unknown as 'fixed', bg: 'blue', backText: 1 as unknown as string };
    const r = validateIr(s);
    expect(r.issues.some((i) => i.path === 'navBar.mode')).toBe(true);
    expect(r.issues.some((i) => i.path === 'navBar.bg')).toBe(true);
    expect(r.issues.some((i) => i.path === 'navBar.backText')).toBe(true);
  });

  it('state 重名 → issue（原生端重名声明编译失败）', () => {
    const s = screen(root([{ type: 'text', props: { text: 'x' } }]));
    s.state = [
      { name: 'count', init: 0 },
      { name: 'count', init: '' },
    ];
    const r = validateIr(s);
    expect(r.issues.some((i) => i.message.includes('重复'))).toBe(true);
  });

  it('handlers：name 非标识符 / body 缺失 → issue', () => {
    const s = screen(root([{ type: 'text', props: { text: 'x' } }]));
    s.handlers = [
      { name: 'not a name', params: '', body: '' },
      { name: 'ok', params: '', body: undefined } as unknown as { name: string; params: string; body: string },
    ];
    const r = validateIr(s);
    expect(r.issues.some((i) => i.path === 'handlers[0].name')).toBe(true);
    expect(r.issues.some((i) => i.path === 'handlers[1].body')).toBe(true);
  });

  it('onMounted 非 string → issue', () => {
    const s = screen(root([{ type: 'text', props: { text: 'x' } }]));
    s.onMounted = 42 as unknown as string;
    const r = validateIr(s);
    expect(r.issues.some((i) => i.path === 'onMounted')).toBe(true);
  });

  it('bind/value 未声明 state → issue；循环内 bind 循环变量 → 通过', () => {
    const s = screen(root([
      { type: 'text', props: { bind: 'ghost' } },
      { type: 'for', vfor: { list: ['a'], itemKey: 'item', indexKey: 'i' }, children: [{ type: 'text', props: { bind: 'item' } }] },
    ]));
    s.state = [{ name: 'count', init: 0 }];
    const r = validateIr(s);
    expect(r.issues.some((i) => i.message.includes('bind: ghost'))).toBe(true);
    expect(r.issues.some((i) => i.message.includes('bind: item'))).toBe(false);
  });

  it('vfor.listState 未声明 → issue', () => {
    const s = screen(root([
      { type: 'for', vfor: { listState: 'rows', itemKey: 'item' }, children: [{ type: 'text', props: { bind: 'item' } }] },
    ]));
    s.state = [{ name: 'count', init: 0 }];
    const r = validateIr(s);
    expect(r.issues.some((i) => i.message.includes('listState'))).toBe(true);
  });

  it('opacity 越界 → issue；合法值通过', () => {
    const bad = screen(root([{ type: 'text', props: { text: 'x', opacity: 1.5 } }]));
    expect(validateIr(bad).issues.some((i) => i.message.includes('"opacity" 值非法'))).toBe(true);
    const good = screen(root([{ type: 'text', props: { text: 'x', opacity: 0.5 } }]));
    expect(validateIr(good).ok).toBe(true);
  });
});
