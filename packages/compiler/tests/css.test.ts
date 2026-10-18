import { describe, expect, it } from 'vitest';
import { CssParseError, mergeIrProps, parseCss, parseInlineStyle } from '../src/transform/css';

describe('CSS 子集解析（R15 降级警告 + 新映射 · 2026 审计修复）', () => {
  it('flex:N 数值映射（不再仅 flex:1）', () => {
    const r = parseCss('.a { flex: 2; }', []);
    expect(r.classProps.get('a')).toEqual({ flex: 2 });
  });

  it('flex:0 → 合法空映射（不伸展即 IR 缺省）', () => {
    const warnings: string[] = [];
    const r = parseCss('.a { flex: 0; }', warnings);
    expect(Object.keys(r.classProps.get('a') ?? {}).length).toBe(0);
    expect(warnings.length).toBe(0);
  });

  it('font-weight 数值归档（300→normal / 600→bold / 800→bold / 500→medium）', () => {
    const r = parseCss('.a { font-weight: 300; } .b { font-weight: 600; } .c { font-weight: 800; } .d { font-weight: 500; }', []);
    expect(r.classProps.get('a')).toEqual({ fontWeight: 'normal' });
    expect(r.classProps.get('b')).toEqual({ fontWeight: 'bold' });
    expect(r.classProps.get('c')).toEqual({ fontWeight: 'bold' });
    expect(r.classProps.get('d')).toEqual({ fontWeight: 'medium' });
  });

  it('line-height 支持 px；无单位比值拒绝并警告', () => {
    const warnings: string[] = [];
    const r = parseCss('.a { line-height: 24px; } .b { line-height: 1.5; }', warnings);
    expect(r.classProps.get('a')).toEqual({ lineHeight: 24 });
    expect(Object.keys(r.classProps.get('b') ?? {}).length).toBe(0);
    expect(warnings.some((w) => w.includes('无单位比值'))).toBe(true);
  });

  it('named 颜色拒绝并警告；var() 保留（交给 codegen 按 tokens 解析）', () => {
    const warnings: string[] = [];
    const r = parseCss('.a { color: red; background: var(--bg); }', warnings);
    const props = r.classProps.get('a') ?? {};
    expect(props.color).toBeUndefined();
    expect(props.background).toBe('var(--bg)');
    expect(warnings.filter((w) => w.includes('仅支持 #rgb')).length).toBe(1);
  });

  it('border 非法颜色 → 拒绝（border 简写颜色同样校验）', () => {
    const warnings: string[] = [];
    const r = parseCss('.a { border: 1px solid red; }', warnings);
    expect(Object.keys(r.classProps.get('a') ?? {}).length).toBe(0);
    expect(warnings.some((w) => w.includes('border 颜色值'))).toBe(true);
  });

  it('子集外值（display:block）→ 显式警告（不再静默丢弃）', () => {
    const warnings: string[] = [];
    parseCss('.a { display: block; }', warnings);
    expect(warnings.some((w) => w.includes('不在子集内'))).toBe(true);
  });

  it('opacity 保留（schema 已支持，端到端生成 .opacity / Modifier.alpha）', () => {
    const r = parseCss('.a { opacity: 0.5; }', []);
    expect(r.classProps.get('a')).toEqual({ opacity: 0.5 });
  });

  it('border-radius 百分比 → 拒绝并警告', () => {
    const warnings: string[] = [];
    const r = parseCss('.a { border-radius: 50%; }', warnings);
    expect(Object.keys(r.classProps.get('a') ?? {}).length).toBe(0);
    expect(warnings.some((w) => w.includes('百分比'))).toBe(true);
  });

  it('语法错误 → CssParseError（vue2ir 转 VueCompileError，不产出半份样式表）', () => {
    expect(() => parseCss('.a { color: #fff;', [])).toThrow(CssParseError);
  });

  it('parseInlineStyle 同样走警告路径', () => {
    const warnings: string[] = [];
    const props = parseInlineStyle('color: #ffffff; position: sticky;', warnings);
    expect(props).toEqual({ color: '#ffffff' });
    expect(warnings.some((w) => w.includes('position: sticky'))).toBe(true);
  });
});

describe('R70/R71 样式扩展（单边边框 / 单边内距 / 裁剪）', () => {
  it('border-bottom 三条声明合并为同一 side（不互相覆盖）', () => {
    const r = parseCss('.a { border-bottom-width: 0.5px; border-bottom-color: #22304a; border-bottom-style: solid; }', []);
    expect(r.classProps.get('a')).toEqual({ borderSides: { bottom: { width: 0.5, color: '#22304a' } } });
  });

  it('border-{side} 简写 → borderSides（含 0.5px 发丝线）', () => {
    const r = parseCss('.a { border-top: 0.5px solid #22304a; }', []);
    expect(r.classProps.get('a')).toEqual({ borderSides: { top: { width: 0.5, color: '#22304a' } } });
  });

  it('border-{side}-style: none → 该边宽度归零；dashed → 警告且忽略', () => {
    const warnings: string[] = [];
    const r = parseCss('.a { border-bottom-style: none; } .b { border-top-style: dashed; }', warnings);
    expect(r.classProps.get('a')).toEqual({ borderSides: { bottom: { width: 0 } } });
    expect(Object.keys(r.classProps.get('b') ?? {}).length).toBe(0);
    expect(warnings.some((w) => w.includes('dashed'))).toBe(true);
  });

  it('padding 简写 + 单边声明合并为四边对象', () => {
    const r = parseCss('.a { padding: 15px 16px; padding-top: 8px; }', []);
    expect(r.classProps.get('a')).toEqual({ padding: { top: 8, right: 16, bottom: 15, left: 16 } });
  });

  it('margin-bottom / margin-right / margin-left（含 auto）', () => {
    const r = parseCss('.a { margin-bottom: 12px; margin-right: 6px; margin-left: auto; }', []);
    expect(r.classProps.get('a')).toEqual({ marginBottom: 12, marginRight: 6, marginLeftAuto: true });
  });

  it('overflow: hidden → clip；auto → overflow（scroll 节点）', () => {
    const r = parseCss('.a { overflow: hidden; } .b { overflow: auto; }', []);
    expect(r.classProps.get('a')).toEqual({ clip: true });
    expect(r.classProps.get('b')).toEqual({ overflow: 'auto' });
  });

  it('mergeIrProps 深合并（跨 class 应用，padding/borderSides 不丢边）', () => {
    const base = { padding: 16 as unknown, borderSides: { bottom: { width: 1, color: '#111111' } } as unknown };
    mergeIrProps(base as object, { padding: { top: 0 } });
    mergeIrProps(base as object, { borderSides: { top: { width: 2 } } });
    expect(base.padding).toEqual({ top: 0, right: 16, bottom: 16, left: 16 });
    expect(base.borderSides).toEqual({ bottom: { width: 1, color: '#111111' }, top: { width: 2 } });
  });
});
