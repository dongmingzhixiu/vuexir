/**
 * SwiftUI 生成器 v0（P0.3）
 *
 * 职责：IR 节点树 → 自包含 SwiftUI 源码字符串（可直接 swiftc -parse / 进 Xcode 工程）
 *
 * 遵循 RULES.md：
 * - R14：生成器产出必须可直接过 swiftc 编译
 * - R16：fill → .frame(maxWidth/maxHeight:.infinity)；禁绝对像素（固定物除外）
 * - R26：颜色直接生成 Color(red:green:blue:opacity:) 数值表达式
 *
 * 映射表（R25 薄抽象层）：
 *   root        → ZStack + 全屏 frame + 背景
 *   group       → VStack / HStack（flexDirection）+ spacing(gap) + padding + 背景/圆角/描边
 *   text        → Text + font/foregroundColor/multilineTextAlignment/lineSpacing
 *   button      → Button(label:) + 尺寸/背景/圆角
 *   scroll      → ScrollView(.vertical) + VStack（flex:1 → maxHeight:.infinity）
 *   spacer      → Spacer(minLength: 0)
 *   divider     → Rectangle().fill().frame(height:)
 *   image       → 占位 RoundedRectangle（P0 无真实图片链路）
 *
 * P0 简化声明：justifyContent 仅 start/center/spaceBetween；breakpoints 未实现；
 * flex 仅支持容器主轴方向的 maxHeight/maxWidth:.infinity。
 */

import type { IrAction, IrNode, IrProps, IrScreen, Size } from '../ir/schema.js';

/* ============ 颜色表达式 ============ */

function parseColor(c: string): { r: number; g: number; b: number; a: number } {
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map((h) => h + h).join('');
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  return { r: 0, g: 0, b: 0, a: 1 };
}

function colorExpr(c: string): string {
  const { r, g, b, a } = parseColor(c);
  // R42：色板已收集时 → Theme.<name> 引用（抽离重复颜色字面量）
  const name = currentColorNames?.get(rgbHex(r, g, b));
  const base = name !== undefined ? `Theme.${name}` : `Color(red: ${r}/255.0, green: ${g}/255.0, blue: ${b}/255.0)`;
  return a >= 1 ? base : `${base}.opacity(${a})`;
}

/* ============ R42 Theme token：颜色/字体抽离 ============ */

/** 语义色表（基本色；其余 → c<hex> 确定性命名） */
const SEMANTIC_COLORS: Record<string, string> = {
  '000000': 'black',
  'ffffff': 'white',
  'ff0000': 'red',
  '00ff00': 'green',
  '0000ff': 'blue',
  'ffff00': 'yellow',
  'ffa500': 'orange',
  'ffc0cb': 'pink',
  '800080': 'purple',
  'a52a2a': 'brown',
  '808080': 'gray',
  'c0c0c0': 'silver',
};

/** 字体 weight 简写（token 命名用） */
const FW_SHORT: Record<string, string> = { normal: 'r', medium: 'm', bold: 'b' };

function rgbHex(r: number, g: number, b: number): string {
  return [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** 当前工程的色板（hex → Theme 名 / fontKey → Theme 名）；generateScreenSource 设置 */
let currentStateNames: Set<string> = new Set();

let currentColorNames: Map<string, string> | undefined;
let currentFontNames: Map<string, string> | undefined;
/** R43：frame 组合抽离为 View 扩展方法（theme 模式启用） */
let currentFrameShort = false;
/** M1：页面 state 类型表（name → 'number'|'string'），text bind 决定 Text("\(x)") 还是 Text(x) */
let currentStateTypes: Record<string, 'number' | 'string' | 'boolean'> = {};

/** R42 收集 IR 树中的颜色与字体组合（生成 Theme.swift 的输入） */
export function collectTheme(...nodes: (IrNode | undefined)[]): { colors: Set<string>; fonts: Set<string> } {
  const colors = new Set<string>();
  const fonts = new Set<string>();
  const walk = (n: IrNode | undefined) => {
    if (!n) return;
    const p = n.props ?? {};
    for (const key of ['background', 'color', 'borderColor'] as const) {
      if (typeof p[key] === 'string') colors.add(p[key] as string);
    }
    if (p.colorActive && typeof p.colorActive.color === 'string') colors.add(p.colorActive.color);
    if (p.colorActive && typeof p.color === 'string') colors.add(p.color as string);
    if (n.type === 'text' || n.type === 'button') {
      const fs = p.fontSize ?? 15;
      const def = n.type === 'text' ? 'normal' : 'medium';
      fonts.add(`${String(fs).replace('.', '_')}${FW_SHORT[p.fontWeight ?? def]}`);
    }
    for (const c of n.children ?? []) walk(c);
  };
  for (const n of nodes) walk(n);
  return { colors, fonts };
}

/** R42 构建色板：hex/fontKey → Theme 名（确定性：语义色表 + c<hex> / fs<size><w>） */
export function buildTheme(tokens: { colors: Set<string>; fonts: Set<string> }): {
  colorNames: Map<string, string>;
  fontNames: Map<string, string>;
} {
  const colorNames = new Map<string, string>();
  for (const c of tokens.colors) {
    const { r, g, b } = parseColor(c);
    const hex = rgbHex(r, g, b);
    if (colorNames.has(hex)) continue;
    colorNames.set(hex, SEMANTIC_COLORS[hex] ?? `c${hex}`);
  }
  const fontNames = new Map<string, string>();
  for (const f of tokens.fonts) {
    if (!fontNames.has(f)) fontNames.set(f, `fs${f}`);
  }
  return { colorNames, fontNames };
}

/** R42 生成 Theme.swift（颜色/字体去重常量） */
export const VRN_HELPERS_SWIFT = `import Foundation

// vuexir 运行时辅助（R78 对象字段取值）
/// R78 对象字段取值：状态里存 JSON 字符串时按 key 取值（非 JSON → 返回空串）
/// R85 点路径取值：key 支持 "a.b.c" 与末段 ".length"（数组/字典/字符串长度）
/// R110 判真：JS 里的 truthiness 近似（空串/"false"/"0"/"null" 为假）
func vrnTruthy(_ v: String) -> Bool {
    if v.isEmpty { return false }
    if v == "false" || v == "0" || v == "null" || v == "undefined" { return false }
    return true
}

func vrnField(_ json: String, _ path: String, _ fallback: String = "") -> String {
    let raw = vrnFieldRaw(json, path)
    return raw.isEmpty ? fallback : raw
}

/// 原始取值（不套兜底）：点路径下钻，缺失返回空串
private func vrnFieldRaw(_ json: String, _ path: String) -> String {
    guard let data = json.data(using: .utf8),
          let root = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return "" }
    var cur: Any = root
    for seg in path.split(separator: ".").map(String.init) {
        if seg == "length" || seg == "size" {
            if let a = cur as? [Any] { cur = a.count }
            else if let d = cur as? [String: Any] { cur = d.count }
            else if let s = cur as? String { cur = s.count }
            else { return "" }
            continue
        }
        if let d = cur as? [String: Any], let next = d[seg] { cur = next } else { return "" }
    }
    if let s = cur as? String { return s }
    if let b = cur as? Bool { return b ? "true" : "false" }
    if let n = cur as? NSNumber { return n.stringValue }
    return String(describing: cur)
}
`;

export function generateThemeSource(palette: { colorNames: Map<string, string>; fontNames: Map<string, string> }): string {
  const lines: string[] = ['import SwiftUI', '', '// GENERATED by vue-render-native compiler · R42 theme tokens', 'enum Theme {'];
  const colors = [...palette.colorNames.entries()].map(([hex, name]) => {
    const { r, g, b } = parseColor(`#${hex}`);
    return `    static let ${name} = Color(red: ${r}/255.0, green: ${g}/255.0, blue: ${b}/255.0)`;
  });
  if (colors.length > 0) {
    lines.push('    // 颜色', ...colors);
  }
  const fonts = [...palette.fontNames.entries()].map(([key, name]) => {
    const m = key.match(/^(\d+(?:_\d+)?)([rmb])$/);
    if (!m) return null;
    const size = m[1].replace('_', '.');
    const weight = { r: '.regular', m: '.medium', b: '.bold' }[m[2] as 'r' | 'm' | 'b'];
    return `    static let ${name} = Font.system(size: ${size}, weight: ${weight})`;
  }).filter((x): x is string => x !== null);
  if (fonts.length > 0) {
    lines.push('    // 字体', ...fonts);
  }
  lines.push('}', '');
  // R43：frame 组合抽离（View 扩展，theme 模式下 codegen 用短调用）
  lines.push(...generateViewExtensions().split('\n'));
  return lines.join('\n');
}

/** 字体引用：色板有映射 → Theme.fs<size><w>；否则内联 .system(size:, weight:) */
function fontExpr(size: number, weight: 'normal' | 'medium' | 'bold' | undefined, def: 'normal' | 'medium'): string {
  const fw = weight ?? def;
  const key = `${String(size).replace('.', '_')}${FW_SHORT[fw]}`;
  const name = currentFontNames?.get(key);
  return name !== undefined ? `Theme.${name}` : `.system(size: ${size}, weight: ${FW_MAP[fw]})`;
}

/** R43 frame 组合：theme 模式 → View 扩展短调用（.fillW(.leading) / .fillW0()…）；否则内联 */
function frameExpr(kind: 'fillW' | 'fillW0' | 'fillH' | 'fillH0' | 'fillAll', align?: string): string {
  if (currentFrameShort) {
    return kind === 'fillAll' ? '.fillAll()' : `.${kind}(${align ?? ''})`;
  }
  switch (kind) {
    case 'fillW':
      return align ? `.frame(maxWidth: .infinity, alignment: ${align})` : '.frame(maxWidth: .infinity)';
    case 'fillW0':
      return '.frame(minWidth: 0, maxWidth: .infinity)';
    case 'fillH':
      return align ? `.frame(maxHeight: .infinity, alignment: ${align})` : '.frame(maxHeight: .infinity)';
    case 'fillH0':
      return '.frame(minHeight: 0, maxHeight: .infinity)';
    case 'fillAll':
      return '.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)';
  }
}

/** R43/R44 View 扩展源码（Theme.swift 内；theme 模式引用） */
export function generateViewExtensions(): string {
  return [
    '',
    'extension View {',
    '    /// 横向撑满（等价 .frame(maxWidth: .infinity)）；align 默认 .center',
    '    func fillW(_ align: Alignment = .center) -> some View { frame(maxWidth: .infinity, alignment: align) }',
    '    /// 横向撑满且允许收缩到 0（等价 .frame(minWidth: 0, maxWidth: .infinity)）',
    '    func fillW0(_ align: Alignment = .center) -> some View { frame(minWidth: 0, maxWidth: .infinity, alignment: align) }',
    '    /// 纵向撑满（等价 .frame(maxHeight: .infinity)）；align 默认 .center',
    '    func fillH(_ align: Alignment = .center) -> some View { frame(maxHeight: .infinity, alignment: align) }',
    '    /// 纵向撑满且允许收缩到 0（等价 .frame(minHeight: 0, maxHeight: .infinity)）',
    '    func fillH0() -> some View { frame(minHeight: 0, maxHeight: .infinity) }',
    '    /// 双轴撑满 + 左上对齐（等价 .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)）',
    '    func fillAll() -> some View { frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading) }',
    '    /// 四边内边距（等价 .padding(.top, t).padding(.trailing, r).padding(.bottom, b).padding(.leading, l)）',
    '    func pad(top: CGFloat = 0, right: CGFloat = 0, bottom: CGFloat = 0, left: CGFloat = 0) -> some View {',
    '        padding(EdgeInsets(top: top, leading: left, bottom: bottom, trailing: right))',
    '    }',
    '    /// 胶囊标签：同色背景 + 全圆角 + 同色描边（等价 padding(h,v)+background(.opacity(bg))+cornerRadius+overlay stroke）',
    '    func tagCapsule(_ color: Color, radius: CGFloat, bg: Double, stroke: Double, h: CGFloat, v: CGFloat) -> some View {',
    '        self.padding(.horizontal, h).padding(.vertical, v)',
    '            .background(color.opacity(bg))',
    '            .cornerRadius(radius)',
    '            .overlay(RoundedRectangle(cornerRadius: radius).stroke(color.opacity(stroke), lineWidth: 1))',
    '    }',
    '}',
    '',
    'extension Color {',
    '    /// M2 :style 动态色（state 存 hex 字符串 → 运行时解析为 Color）',
    '    init(hex: String) {',
    '        let s = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)',
    '        var v: UInt64 = 0',
    '        Scanner(string: s).scanHexInt64(&v)',
    '        let r = Double((v >> 16) & 0xff) / 255.0',
    '        let g = Double((v >> 8) & 0xff) / 255.0',
    '        let b = Double(v & 0xff) / 255.0',
    '        self.init(red: r, green: g, blue: b)',
    '    }',
    '}',
    '',
    '/// M5 按压态按钮样式：.cls:active 的 background → 按压时覆盖显示 pressBg（常规背景保持）',
    'struct PressButtonStyle: ButtonStyle {',
    '    let pressBg: Color',
    '    func makeBody(configuration: Configuration) -> some View {',
    '        configuration.label.overlay(pressBg.opacity(configuration.isPressed ? 1 : 0))',
    '    }',
    '}',
    '',
  ].join('\n');
}

/* ============ 工具 ============ */

function swiftStringEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function indent(level: number): string {
  return '    '.repeat(level);
}

function toSwiftIdentifier(id: string): string {
  const parts = id.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const camel = parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
  return camel[0].toUpperCase() + camel.slice(1);
}

const FW_MAP: Record<string, string> = { normal: '.regular', medium: '.medium', bold: '.bold' };
const ALIGN_MAP: Record<string, string> = { start: '.leading', center: '.center', end: '.trailing', left: '.leading', right: '.trailing' };
const FLEX_START_MAP: Record<string, string> = { start: '.leading', center: '.center', end: '.trailing' };

/* ============ 布局上下文 ============ */

interface Ctx {
  /** 父容器主轴方向（决定 flex 子节点撑哪一维） */
  parentAxis: 'row' | 'column' | null;
  level: number;
  /** 当前节点获得的垂直建议高度是否确定（数字 height / root 撑满屏 / flex 链确定）。
   *  R-H3/H5：flex:1 与 align-items:stretch 仅在父高度确定时有剩余空间可分配。 */
  definiteHeight: boolean;
  /** 布局降级告警收集（R-H3/H4/H5） */
  warnings: string[];
  /** 节点路径（warning 定位，如 ui[0].children[1]） */
  path: string;
  /** R114：当前页面状态名集合（条件兜底用） */
  stateNames?: Set<string>;
  /** R-G2：父容器 gap 透传给子项（仅 <template> 来源的单 condition 子项） */
  inheritGap?: number;
  /** M4a：页面运行时引用表达式（Runtime.shared / Runtime.forPage("<id>")） */
  runtime: string;
  /** M1：页面 state 类型表（name → 'number'|'string'），text bind 决定 Text("\(x)") 还是 Text(x) */
  stateTypes?: Record<string, 'number' | 'string' | 'boolean'>;
  /** M2 v-for 项模板上下文：item/index 为 ForEach 内局部变量（let item = list[i]），text bind 命中 → Text("\(name)") */
  loop?: { itemKey: string; indexKey?: string; indexVar: string };
  /** R-VFOBJ-D：静态 v-for 数组 → struct 属性声明（数据与布局分离，如 private let rows: [[String: String]] = […]） */
  dataProps?: string[];
}

/** R-H：节点自身高度是否确定（数字 height / height:'fill'；或 flex 子项且父链确定） */
function heightDefinite(props: IrProps, parentDefinite: boolean): boolean {
  // 'fill' = 撑满父高（root 高度固定，fill 仅出现在 root 内层包裹 → 高度确定链成立）
  if (props.height === 'fill') return true;
  return typeof props.height === 'number' || (props.flex !== undefined && parentDefinite);
}

/** R-G2：父 gap 是否透传给该子项 —— 仅「<template> 来源的 condition 子项 + 子项自身无 gap」。
 *  <template> 在 CSS 中透明（不产生盒子），父容器 gap 应作用于其展开后的渲染兄弟；
 *  <div v-if> 等真实元素不透传（父 gap 只作用于盒子与兄弟之间）。
 *  额外要求：父容器全部子项均为 <template> condition（同一渲染层，如多 tab 分支）才透传；
 *  混入真实元素时父 gap 作用于真实盒子之间，不透传（R-G3 复杂混合场景降级）。 */
function gapInheritFor(child: IrNode, parentGap: number | undefined, siblings: IrNode[]): number | undefined {
  if (!parentGap || parentGap <= 0) return undefined;
  if (!child.condition || child.sourceTag !== 'template' || child.props?.gap !== undefined) return undefined;
  if (!siblings.every((s) => s.condition && s.sourceTag === 'template')) return undefined;
  return parentGap;
}

/* ============ 节点发射 ============ */

function sizeModifiers(props: IrProps, axis: 'row' | 'column', ctx: Ctx): string[] {
  const mods: string[] = [];
  const { width, height, flex } = props;
  if (width === 'fill') mods.push(frameExpr('fillW'));
  else if (typeof width === 'number') mods.push(`.frame(width: ${width})`);
  if (typeof height === 'number') mods.push(`.frame(height: ${height})`);
  if (flex !== undefined) {
    // R-H3：flex 沿父容器主轴拉伸占满剩余空间；但父容器高度不确定时（auto 链）无剩余空间可分配，
    // SwiftUI 的 .infinity 会沿祖先链漂移到屏幕高度 → 降级为内容高并告警（与 CSS flex-grow 语义一致）
    if (axis === 'column' && !ctx.definiteHeight) {
      ctx.warnings.push(`${ctx.path}: flex:1 处于高度不确定的 column 容器，无剩余空间可分配，已降级为内容高（R-H3）`);
    } else {
      // 注意：SwiftUI 中 ScrollView 需 minHeight:0 才能被正确压缩/拉伸（经典坑，探针验证）
      mods.push(axis === 'column' ? frameExpr('fillH0') : frameExpr('fillW0'));
    }
  }
  return mods;
}

function paddingModifiers(props: IrProps): string[] {
  const p = props.padding;
  if (p === undefined) return [];
  if (typeof p === 'number') return [`.padding(${p})`];
  const mods: string[] = [];
  // R44：theme 模式下 ≥2 边 → 单次 .pad(top:right:bottom:left:)（视觉等价 EdgeInsets 一次内缩）
  if (currentFrameShort) {
    const sides = [p.top, p.right, p.bottom, p.left];
    if (sides.every((v) => v !== undefined && v === sides[0])) return [`.padding(${sides[0]})`];
    if (p.top !== undefined && p.right !== undefined && p.bottom !== undefined && p.left !== undefined) {
      return [`.pad(top: ${p.top}, right: ${p.right}, bottom: ${p.bottom}, left: ${p.left})`];
    }
    // 部分边：仅当 ≥2 边才 .pad，单边保留原短表达式
    const parts: string[] = [];
    if (p.top !== undefined) parts.push(`top: ${p.top}`);
    if (p.right !== undefined) parts.push(`right: ${p.right}`);
    if (p.bottom !== undefined) parts.push(`bottom: ${p.bottom}`);
    if (p.left !== undefined) parts.push(`left: ${p.left}`);
    if (parts.length >= 2) return [`.pad(${parts.join(', ')})`];
    for (const [k, v] of [['.top', p.top], ['.trailing', p.right], ['.bottom', p.bottom], ['.leading', p.left]] as const) {
      if (v !== undefined) mods.push(`.padding(${k}, ${v})`);
    }
    return mods;
  }
  if (p.top !== undefined) mods.push(`.padding(.top, ${p.top})`);
  if (p.right !== undefined) mods.push(`.padding(.trailing, ${p.right})`);
  if (p.bottom !== undefined) mods.push(`.padding(.bottom, ${p.bottom})`);
  if (p.left !== undefined) mods.push(`.padding(.leading, ${p.left})`);
  return mods;
}

/** R44 胶囊标签判定：大圆角（≥90）+ 同色背景/描边（hex 一致）+ 对称 padding → 抽 tagCapsule */
function isCapsule(props: IrProps, padMods: string[]): boolean {
  if (padMods.length === 0 || props.radius === undefined || props.radius < 90) return false;
  if (props.borderColor === undefined || props.borderWidth === undefined || props.background === undefined) return false;
  const b = parseColor(props.background);
  const c = parseColor(props.borderColor);
  if (b.r !== c.r || b.g !== c.g || b.b !== c.b) return false;
  const p = props.padding;
  if (typeof p === 'number') return true;
  if (p === undefined) return false;
  const topBotOk = p.top === undefined || p.bottom === undefined || p.top === p.bottom;
  const leftRightOk = p.left === undefined || p.right === undefined || p.left === p.right;
  return topBotOk && leftRightOk;
}

/** R44 胶囊调用（基色取 rgb 的 Theme 名，alpha 作参数） */
function capsuleExpr(props: IrProps): string {
  const color = capsuleColorExpr(props.borderColor!);
  const bgA = parseColor(props.background!).a;
  const stA = parseColor(props.borderColor!).a;
  const p = props.padding;
  let h = 10;
  let v = 3;
  if (typeof p === 'number') {
    h = p;
    v = p;
  } else if (p) {
    h = p.left ?? p.right ?? 10;
    v = p.top ?? p.bottom ?? 3;
  }
  return `.tagCapsule(${color}, radius: ${props.radius}, bg: ${bgA}, stroke: ${stA}, h: ${h}, v: ${v})`;
}

/** R44 胶囊基色引用：只取 rgb 的 Theme 名（alpha 单独传参，避免双重 .opacity） */
function capsuleColorExpr(c: string): string {
  const { r, g, b } = parseColor(c);
  const hex = rgbHex(r, g, b);
  const name = currentColorNames?.get(hex);
  return name !== undefined ? `Theme.${name}` : `Color(red: ${r}/255.0, green: ${g}/255.0, blue: ${b}/255.0)`;
}

function boxModifiers(props: IrProps): string[] {
  const mods: string[] = [];
  if (props.background !== undefined) mods.push(`.background(${colorExpr(props.background)})`);
  if (props.radius !== undefined) mods.push(`.cornerRadius(${props.radius})`);
  if (props.borderWidth !== undefined && props.borderColor !== undefined && props.borderWidth > 0) {
    mods.push(`.overlay(RoundedRectangle(cornerRadius: ${props.radius ?? 0}).stroke(${colorExpr(props.borderColor)}, lineWidth: ${props.borderWidth}))`);
  }
  // R70 单边边框（发丝分隔线）：每条边一个 overlay 矩形贴边（Web border-{side} 语义）
  const sides = props.borderSides;
  if (sides !== undefined) {
    const defs: { side: 'top' | 'right' | 'bottom' | 'left'; align: string; frame: (w: number) => string }[] = [
      { side: 'top', align: '.top', frame: (w) => `.frame(height: ${w})` },
      { side: 'bottom', align: '.bottom', frame: (w) => `.frame(height: ${w})` },
      { side: 'left', align: '.leading', frame: (w) => `.frame(width: ${w})` },
      { side: 'right', align: '.trailing', frame: (w) => `.frame(width: ${w})` },
    ];
    for (const d of defs) {
      const sv = sides[d.side];
      if (sv === undefined || sv.width <= 0) continue;
      mods.push(`.overlay(alignment: ${d.align}) { Rectangle().fill(${colorExpr(sv.color ?? props.borderColor ?? '#2a3550')})${d.frame(sv.width)} }`);
    }
  }
  // R71 overflow:hidden → 裁剪溢出内容（置于背景/边框之后，保留圆角裁剪语义）
  if (props.clip === true) mods.push('.clipped()');
  return mods;
}

function emitChildren(
  children: IrNode[] | undefined,
  axis: 'row' | 'column',
  ctx: Ctx,
  alignRaw = 'stretch',
  stretchCross = false,
): string {
  if (!children || children.length === 0) return '';
  const gap = ctx.inheritGap ?? 0;
  return children
    .map((c, i) => {
      const childCtx: Ctx = {
        parentAxis: axis,
        level: ctx.level,
        definiteHeight: ctx.definiteHeight,
        runtime: ctx.runtime,
        warnings: ctx.warnings,
        path: `${ctx.path}[${i}]`,
        inheritGap: gapInheritFor(c, gap, children),
      };
      const body = emitNode(c, childCtx);
      // CSS margin-top:auto → 前置 Spacer 推到底部（自身尺寸不变）
      if (c.props?.marginTopAuto && axis === 'column') {
        return `${indent(ctx.level)}Spacer(minLength: 0)\n${body}`;
      }
      // CSS margin-top:<px> → 前置固定高度空隙（margin 语义，不影响子项自身尺寸）
      if (c.props?.marginTop !== undefined && axis === 'column') {
        return `${indent(ctx.level)}Color.clear.frame(height: ${c.props.marginTop})\n${body}`;
      }
      // CSS margin-left:auto → 前置 Spacer 推到行尾（> 等行尾元素）
      if (c.props?.marginLeftAuto && axis === 'row') {
        return `${indent(ctx.level)}Spacer(minLength: 0)\n${body}`;
      }
      // R70 其余单边外边距：行内用 Color.clear 间隔（后置/前置），与 marginTop 同构
      const pre: string[] = [];
      const post: string[] = [];
      if (c.props?.marginLeft !== undefined && axis === 'row') pre.push(`Color.clear.frame(width: ${c.props.marginLeft})`);
      if (c.props?.marginRight !== undefined && axis === 'row') post.push(`Color.clear.frame(width: ${c.props.marginRight})`);
      if (c.props?.marginBottom !== undefined && axis === 'column') post.push(`Color.clear.frame(height: ${c.props.marginBottom})`);
      if (pre.length === 0 && post.length === 0) return body;
      return [...pre.map((x) => indent(ctx.level) + x), body, ...post.map((x) => indent(ctx.level) + x)].join('\n');
    })
    .map((body, i) => {
      const c = children[i];
      // 盒模型（R29）：column 子项默认填满父宽（div block）；row 子项默认内容高，
      // 仅显式 align-items:stretch 才拉满交叉轴；condition 块跳过
      if (c.condition) return body;
      if (axis === 'column' && c.props?.width === undefined) {
        // column：仅默认 stretch 时子项填满父宽（div block 语义）；显式 start/center/end → 内容宽对齐
        const explicitCol = alignRaw === 'start' || alignRaw === 'center' || alignRaw === 'end';
        if (!explicitCol) {
          return body + '\n' + indent(ctx.level) + frameExpr('fillW', '.leading');
        }
        return body;
      }
      // R-H5：row 交叉轴拉伸仅当容器高度确定时有意义，否则降级（CSS：auto 高容器 stretch 无剩余空间）
      if (axis === 'row' && (stretchCross || c.props?.flex !== undefined) && c.props?.height === undefined) {
        if (!ctx.definiteHeight) {
          ctx.warnings.push(`${ctx.path}[${i}]: align-items:stretch/flex 在高度不确定的 row 上无剩余空间，已降级（R-H5）`);
          return body;
        }
        return body + '\n' + indent(ctx.level) + frameExpr('fillH', '.top');
      }
      return body;
    })
    .join('\n');
}

function emitNode(node: IrNode, ctx: Ctx): string {
  if (node.condition) {
    const L = ctx.level;
    const inner = emitNodeInner(node, ctx);
    const known = ctx.stateNames && ctx.stateNames.size > 0 ? ctx.stateNames : undefined;
    const swiftCond = swiftCondExpr(node.condition, known);
    return `${indent(L)}if ${swiftCond} {\n${inner}\n${indent(L)}}`;
  }
  return emitNodeInner(node, ctx);
}

/** JS 条件表达式 → Swift 兼容：===/!== 为 JS 严格比较，Swift 用 ==/!=；字符串字面量单引号 → 双引号 */
function swiftCondExpr(expr: string, known?: Set<string>): string {
  // R128：下沉的条件状态 → 判真
  const sunk = expr.match(/^__vrnCond:(\w+)$/);
  if (sunk) return `vrnTruthy(${sunk[1]})`;
  // R114：条件引用原生端不存在的标识符 → true（保留内容），避免整页编译失败
  const knownSet = known && known.size > 0 ? known : currentStateNames;
  if (knownSet && knownSet.size > 0) {
    // 先剥掉字符串字面量，避免把 "success" 之类当成标识符
    const stripped = expr.replace(/'[^']*'|"[^"]*"/g, '""');
    const ids = [...stripped.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const unknown = ids.filter(
      (id) => !knownSet.has(id) && !['true', 'false', 'Math', 'String', 'Number', 'vrnTruthy'].includes(id),
    );
    if (unknown.length > 0) return 'true';
  }
  // R78 续（G12）：对象字段条件 → 非空判断
  const f = expr.match(/^__vrnField__:(\w+):(\w+)$/);
  if (f) return `!vrnField(${f[1]}, "${f[2]}").isEmpty`;
  let s = expr.replace(/!==/g, '!=').replace(/===/g, '==');
  s = s.replace(/'(\[^]|[^'\\])*'/g, (m) => '"' + m.slice(1, -1).replace(/"/g, '\\"') + '"');
  // R110：`.length` → Swift `.count`
  s = s.replace(/\.length\b/g, '.count');
  // R110：非布尔条件（字符串/数量）→ 真值比较
  if (/^[A-Za-z_$][\w$]*\.count$/.test(s)) return `${s} > 0`;
  // R110：取反的长度条件 → == 0
  const neg = s.match(/^!([A-Za-z_$][\w$]*)\.count$/);
  if (neg) return `${neg[1]}.count == 0`;
  // R110：数值状态直接当条件（Swift 不接受 Int 当 Bool）
  if (/^[A-Za-z_$][\w$]*$/.test(s)) return `vrnTruthy(String(${s}))`;
  // R121：复合条件（a && b / a || b / !a）→ 逐段翻译后重组（每段按单条件规则判真）
  if (/&&|\|\|/.test(s) && !/__vrnField__/.test(s) && !/[()]/.test(s)) {
    const parts = s.split(/(&&|\|\|)/);
    return parts
      .map((seg) => (seg === '&&' || seg === '||' ? seg : swiftCondExpr(seg.trim(), known)))
      .join(' ');
  }
  if (/^![A-Za-z_$][\w$]*$/.test(s)) return `!vrnTruthy(String(${s.slice(1)}))`;
  // R113：对象字段条件（form.avatarData）→ 走 vrnField 取 JSON 字段
  const negField = s.match(/^!([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
  if (negField) return `vrnField(${negField[1]}, "${negField[2]}").isEmpty`;
  const posField = s.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
  if (posField) return `!vrnField(${posField[1]}, "${posField[2]}").isEmpty`;
  // R113：对象字段比较（form.calendar == "gregorian"）→ vrnField 取值后比较
  const cmpField = s.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*(==|!=)\s*(.+)$/);
  if (cmpField) return `vrnField(${cmpField[1]}, "${cmpField[2]}") ${cmpField[3]} ${cmpField[4]}`;
  // R110：裸标识符条件（状态可能是字符串/对象/布尔）→ 统一走判真
  if (/^[A-Za-z_$][\w$]*$/.test(s) && !['true', 'false'].includes(s)) return `vrnTruthy(String(${s}))`;
  // R112：循环项字段的 && 组合（item && item.cd）→ 判真
  const andExpr = s.match(/^([A-Za-z_$][\w$.]*)\s*&&\s*([A-Za-z_$][\w$.]*)$/);
  if (andExpr) {
    const truthy = (v: string) => (v.includes('.') ? `!vrnField(${v.split('.')[0]}, "${v.split('.').slice(1).join('.')}").isEmpty` : `vrnTruthy(String(${v}))`);
    return `${truthy(andExpr[1])} && ${truthy(andExpr[2])}`;
  }
  return s;
}

function emitNodeInner(node: IrNode, ctx: Ctx): string {
  const L = ctx.level;
  const pad = (s: string) => indent(L) + s;
  const props: IrProps = node.props ?? {};
  const axis = ctx.parentAxis ?? 'column';
  // box-sizing:border-box（CSS 默认）：固定 height 应包含 padding。
  // 故 height 为数字且存在 padding 时，padding 置于 frame(height) 之前、
  // frame 限定总视觉高度（否则 padding 加在 frame 外 → 视觉高 = height + 2×padding）。
  const size = sizeModifiers(props, axis, ctx);
  let padMods = paddingModifiers(props);
  let boxMods = boxModifiers(props);
  // R44：胶囊标签（大圆角+同色背景描边+对称 padding）→ 单次 .tagCapsule(...)
  const capsule = currentFrameShort && isCapsule(props, padMods) ? capsuleExpr(props) : undefined;
  if (capsule !== undefined) {
    padMods = [];
    boxMods = boxMods.filter((m) => !m.startsWith('.background(') && !m.startsWith('.cornerRadius(') && !m.startsWith('.overlay('));
  }
  const box =
    typeof props.height === 'number' && (padMods.length > 0 || capsule !== undefined)
      ? [...size.filter((m) => !m.startsWith('.frame(height: ')), ...(capsule !== undefined ? [capsule] : []), ...padMods, `.frame(height: ${props.height})`, ...boxMods]
      : [...size, ...(capsule !== undefined ? [capsule] : []), ...padMods, ...boxMods];

  // M5 transform：scale / rotate / translate → 原生修饰符（视觉变换，不影响布局占位）
  const t = props.transform;
  if (t !== undefined) {
    if (t.scale !== undefined) box.push(`.scaleEffect(${t.scale})`);
    if (t.rotate !== undefined) box.push(`.rotationEffect(.degrees(${t.rotate}))`);
    if ((t.translateX ?? 0) !== 0 || (t.translateY ?? 0) !== 0) {
      box.push(`.offset(x: ${t.translateX ?? 0}, y: ${t.translateY ?? 0})`);
    }
  }
  // M5 position:absolute → 脱离文档流（父容器已转 ZStack；offset 实现 top/left 定位）
  if (props.position === 'absolute') {
    const x = props.absLeft ?? 0;
    const y = props.absTop ?? 0;
    box.push(`.offset(x: ${x}, y: ${y})`);
    if (props.absRight !== undefined || props.absBottom !== undefined) {
      ctx.warnings.push(`${ctx.path}: absolute 的 right/bottom 定位暂不支持（仅 left/top），已忽略`);
    }
  }
  // M5 v-show → opacity 动画切换（保留占位；状态名引用页面/容器同名 @State/@Binding）
  if (props.show !== undefined) {
    box.push(`.opacity(${props.show} ? 1 : 0)`);
    box.push(`.animation(.easeInOut(duration: 0.25), value: ${props.show})`);
  }
  // CSS opacity（0~1）：静态透明度（与 v-show 的条件透明叠加）
  if (props.opacity !== undefined) {
    box.push(`.opacity(${props.opacity})`);
  }
  // R-TEXTCLICK：@click 挂在非 button 节点（<span>/<div @click>）→ onTapGesture（此前静默丢失交互）
  if (node.type !== 'button' && (props.onClick !== undefined || props.onSet !== undefined)) {
    box.push(`.onTapGesture ${actionExpr(props, ctx)}`);
  }

  switch (node.type) {
    case 'root': {
      // root 直接子节点撑满全屏（对齐 flex alignItems:stretch 语义）
      // 注意：.frame(maxWidth/maxHeight:.infinity) 默认 alignment=.center，会把
      // 高度未撑满的子节点（无 flex/Spacer）垂直居中 → 必须显式 topLeading 对齐 CSS 文档流贴顶
      const inner = (node.children ?? []).map((c, i) => {
        const s = emitNode(c, {
          parentAxis: 'column',
          level: L + 1,
          definiteHeight: true, // root 撑满全屏 → 子项建议高度确定（R-H3 可分配）
          stateNames: ctx.stateNames,
          warnings: ctx.warnings,
          path: `${ctx.path}[${i}]`,
          inheritGap: gapInheritFor(c, props.gap, node.children ?? []),
          loop: ctx.loop, // M2：v-for 作用域透传
          runtime: ctx.runtime, // M4a：页面运行时引用透传
          dataProps: ctx.dataProps, // R-VFOBJ-D：数据声明收集透传
        });
        // condition 子节点（if 块）不能追加修饰符（if 非 View 值）；内部由自身布局
        if (c.condition) return s;
        return s + '\n' + indent(L + 1) + frameExpr('fillAll');
      }).join('\n');
      // M4b：页面背景改为 ZStack 内首层 Color —— TabView 内容区高度建议不可靠时
      // .background() modifier 只盖内容高（下半透白）；Color 用 maxHeight:.infinity 撑满内容区。
      // R-SAFEAREA：必须 ignoresSafeArea —— 否则底部安全区（home indicator）露出容器/系统底色
      // （浅色模式下是白条），表现为「详情页底部颜色与页面不一致、像高度不够」
      const bgLayer =
        props.background !== undefined
          ? indent(L + 1) + `${colorExpr(props.background)}.frame(maxWidth: .infinity, maxHeight: .infinity).ignoresSafeArea()`
          : null;
      // R-PAGESCROLL：页面根 = 可滚动视口（对位 Web 的 body 默认滚动）
      //  - 内容高于视口 → ScrollView 可滚动（此前仅 external tab 页按按钮数启发式包装，详情页不可滚动）
      //  - 内容不足 → minHeight = 视口高，页面仍铺满，Spacer/flex 贴底语义不变
      const innerIndented = inner.split('\n').map((l) => (l ? indent(L + 4) + l : l)).join('\n');
      const scrolled =
        indent(L + 1) + 'GeometryReader { _vrnViewport in\n' +
        indent(L + 2) + 'ScrollView {\n' +
        indent(L + 3) + 'VStack(alignment: .leading, spacing: 0) {\n' +
        innerIndented + '\n' +
        indent(L + 3) + '}\n' +
        indent(L + 3) + '.frame(maxWidth: .infinity, minHeight: _vrnViewport.size.height, alignment: .topLeading)\n' +
        indent(L + 2) + '}\n' +
        indent(L + 1) + '}';
      return [
        pad('ZStack(alignment: .topLeading) {'),
        bgLayer,
        scrolled,
        pad('}') + '    .frame(maxWidth: .infinity, maxHeight: .infinity)',
      ]
        .filter((x): x is string => x !== null)
        .join('\n');
    }

    case 'group': {
      const dir = props.flexDirection ?? 'column';
      const isRow = dir === 'row';
      const children = node.children ?? [];
      // M5：position:absolute 子节点 → 父容器转 ZStack（alignment: topLeading，脱离文档流叠放）
      const hasAbsolute = children.some((c) => c.props?.position === 'absolute');
      // R-G2：spacing 优先自身 gap；单 <template> condition 子项时取父透传 gap
      const spacing = props.gap ?? ctx.inheritGap ?? 0;
      // CSS align-items 默认 stretch（子项拉伸到容器交叉轴全宽），SwiftUI VStack 无 stretch
      // → 子项显式 .frame(maxWidth:.infinity) 实现（内容仍左对齐）
      const alignRaw = props.alignItems ?? 'stretch';
      const align = isRow ? (ALIGN_MAP[alignRaw] ?? '.top') : (FLEX_START_MAP[alignRaw] ?? '.leading');
      const stack = hasAbsolute ? 'ZStack' : isRow ? 'HStack' : 'VStack';
      const stackAlign = hasAbsolute ? '.topLeading' : align;
      const just = props.justifyContent;
      // R-H4：justify-content 的弹性分配仅在「分配方向」有确定空间时有意义。
      // column（主轴=垂直）需要容器高度确定（CSS：auto 高容器无剩余空间）；
      // row（主轴=水平）宽度总是确定（父宽）→ 永远有效，不降级。
      const selfDefinite = heightDefinite(props, ctx.definiteHeight);
      const justFlex = just === 'center' || just === 'spaceBetween';
      if (justFlex && !isRow && !selfDefinite) {
        ctx.warnings.push(`${ctx.path}: justify-content:${just} 在高度不确定的 column 容器上无剩余空间，已降级（R-H4）`);
      }
      // hasAbsolute 时无 flex 语义（ZStack 叠放）
      const justActive = justFlex && (isRow || selfDefinite) && !hasAbsolute;
      // justifyContent：center → 首尾 Spacer；spaceBetween → 子间 Spacer（仅 column 需高度确定）
      const body: string[] = [];
      if (just === 'center' && justActive) {
        body.push(indent(L + 1) + 'Spacer(minLength: 0)');
      }
      children.forEach((c, i) => {
        if (just === 'spaceBetween' && justActive && i > 0) body.push(indent(L + 1) + 'Spacer(minLength: 0)');
        const childCode = emitNode(c, {
          parentAxis: dir,
          level: L + 1,
          definiteHeight: selfDefinite,
          warnings: ctx.warnings,
          runtime: ctx.runtime,
          path: `${ctx.path}[${i}]`,
          inheritGap: gapInheritFor(c, props.gap, children),
          loop: ctx.loop, // M2：v-for 作用域透传
          dataProps: ctx.dataProps, // R-VFOBJ-D
        });
        // 盒模型（R29 重建 div 语义）：margin 用「透明包装容器」表达，而非独立兄弟占位——
        // VStack(spacing) 对每个独立兄弟前后各计一次 spacing，独立占位会与 gap 叠加双计
        // （实测：gap16 + margin16 被算成 16+16+16=48pt，CSS 应为 32pt）。
        // 包装后：padding(.top:) 是容器自身的透明间隙，只叠加一次 gap（R-H6）。
        const mt = c.props?.marginTop;
        const mtAuto = c.props?.marginTopAuto;
        const mlAuto = c.props?.marginLeftAuto;
        if (mt !== undefined && dir === 'column') {
          const inner = childCode.split('\n').map((l) => (l ? indent(L + 2) + l : l)).join('\n');
          body.push(`${indent(L + 1)}VStack(alignment: .leading, spacing: 0) {\n${inner}\n${indent(L + 1)} }.padding(.top, ${mt})`);
        } else if (mtAuto && dir === 'column') {
          const inner = childCode.split('\n').map((l) => (l ? indent(L + 2) + l : l)).join('\n');
          body.push(`${indent(L + 1)}VStack(alignment: .leading, spacing: 0) {\n${indent(L + 2)}Spacer(minLength: 0)\n${inner}\n${indent(L + 1)} }`);
        } else if (mlAuto && dir === 'row') {
          const inner = childCode.split('\n').map((l) => (l ? indent(L + 2) + l : l)).join('\n');
          body.push(`${indent(L + 1)}HStack(alignment: .top, spacing: 0) {\n${indent(L + 2)}Spacer(minLength: 0)\n${inner}\n${indent(L + 1)} }`);
        } else {
          body.push(childCode);
        }
        if (c.condition) return;
        if (isRow) {
          // R-H5：row 交叉轴拉伸仅当本容器高度确定时有剩余空间可分配
          const stretchChild = props.alignItems === 'stretch';
          if (stretchChild && c.props?.height === undefined) {
            if (!selfDefinite) {
              ctx.warnings.push(`${ctx.path}[${i}]: align-items:stretch 在高度不确定的 row 上无剩余空间，已降级（R-H5）`);
            } else {
              body.push(indent(L + 1) + frameExpr('fillH', '.top'));
            }
          }
        } else if (c.props?.width === undefined && c.props?.position !== 'absolute') {
          // column：仅默认 stretch（未显式声明 align-items）时子项填满父宽（div block 语义）；
          // 显式 start/center/end → 子项按内容宽对齐（CSS 交叉轴对齐语义）
          const explicitCol = props.alignItems === 'start' || props.alignItems === 'center' || props.alignItems === 'end';
          if (!explicitCol) {
            body.push(indent(L + 1) + frameExpr('fillW', '.leading'));
          }
        }
      });
      if (just === 'center' && justActive) {
        body.push(indent(L + 1) + 'Spacer(minLength: 0)');
      }
      // ZStack 无 spacing 参数（hasAbsolute → ZStack）；VStack/HStack 带 spacing
      const open = `${stack}(alignment: ${stackAlign}${hasAbsolute ? '' : `, spacing: ${spacing}`}) {`;
      // M2 :class 选中态背景（active.props.background）→ 条件真时切换背景（命中时覆盖静态 background）
      // R68 续：在 box 修饰符层面替换当前节点自身 background，绝不字符串 replace 整段
      // （replace 会误删第一个匹配——子节点的 background，如 switch 内 absolute knob）
      const actBg = node.active?.props?.background;
      let actBox: string[] | null = null;
      if (actBg !== undefined) {
        const actColor = colorExpr(actBg as string);
        const base = props.background !== undefined ? colorExpr(props.background) : 'Color.clear';
        actBox = [`.background(${node.active!.when} ? ${actColor} : ${base})`];
      }
      const effBox = actBox !== null ? [...actBox, ...box.filter((m) => !m.startsWith('.background('))] : box;
      let out = [pad(open), ...body, pad('}') + effBox.map((m) => ' ' + m).join('')].join('\n');
      // div@click → Button 包裹（语义可点 + AX 可达；onSet 直接写状态，onClick 走 JS）
      // M3：onSet 内联赋值后推送 stateStore（JS 侧状态同步，供 handler 读取）
      if (props.onSet || props.onClick) {
        // R-VFOBJ：onClick 含循环变量字段（router.push(item.path)）→ Swift 内联展开（JS 无 item 作用域）
        const loopAction = props.onClick ? loopClickAction(props.onClick, ctx.loop) : null;
        const action = props.onSet
          ? `action: { ${props.onSet.var} = ${
              props.onSet.kind === 'expr'
                ? String(props.onSet.value)
                : typeof props.onSet.value === 'string'
                  ? `"${swiftStringEscape(props.onSet.value)}"`
                  : props.onSet.value
            }; ${ctx.runtime}.pushState("${props.onSet.var}", ${props.onSet.var}) }`
          : loopAction
            ? `action: { ${loopAction} }`
            : `action: { ${ctx.runtime}.invoke("${swiftStringEscape(props.onClick!)}") }`;
        const inner = out.split('\n').map((l) => (l ? '    ' + l : l)).join('\n');
        out = `${pad(`Button(${action}) {`)}\n${inner}\n${pad('}')}.buttonStyle(.plain)`;
      }
      return out;
    }

    case 'text': {
      // R41：组件 View 内 {{ prop }} → props.ref → Text(prop)（Swift 属性引用，非字面量）
      // M1：页面级 {{ state }} → props.bind / node.bind → Text(<@State 名>)（状态引用，非字面量）
      const isRef = props.ref !== undefined;
      const bindKey = (props.bind as string | undefined) ?? node.bind?.key;
      const isBind = bindKey !== undefined;
      const content = props.text !== undefined ? props.text : '';
      const fs = props.fontSize ?? 15;
      let line = isRef
        ? pad(`Text(${props.ref})`)
        : props.bindExpr !== undefined
          ? pad(`Text(${String(props.bindExpr).includes('.') ? '""' : props.bindExpr})`)
          : props.fieldOf !== undefined
            ? pad(
                `Text(vrnField(${props.fieldOf.obj}, "${props.fieldOf.field}"${
                  props.fieldOf.fallback !== undefined ? `, "${swiftStringEscape(props.fieldOf.fallback)}"` : ''
                }))`,
              )
            : props.dynField !== undefined
            ? pad(`Text(${dictFieldExpr(props.dynField.var, props.dynField.field)})`)
            : props.bindParts !== undefined
              ? pad(
                  `Text("${props.bindParts
                    .map((p) =>
                      'text' in p
                        ? swiftStringEscape(p.text)
                        : 'bind' in p
                          ? `\\(${p.bind})`
                          : 'fieldOf' in p
                            ? `\\(vrnField(${p.fieldOf.obj}, "${p.fieldOf.field}"${
                                p.fieldOf.fallback !== undefined ? `, "${swiftStringEscape(p.fieldOf.fallback)}"` : ''
                              }))`
                            : `\\(${dictFieldExpr(p.dynField.var, p.dynField.field)})`,
                    )
                    .join('')}")`,
                )
              : isBind
            ? ctx.loop && (bindKey === ctx.loop.itemKey || bindKey === ctx.loop.indexKey)
              ? pad(`Text("\\(${bindKey})")`)
              : currentStateTypes[bindKey] === 'number'
                ? pad(`Text("\\(${bindKey})")`)
                : currentStateTypes[bindKey] === 'boolean'
                  // 布尔 state → String(describing:)（Text(Bool) 无构造匹配，typecheck 失败）
                  ? pad(`Text(String(describing: ${bindKey}))`)
                  : pad(`Text(${bindKey})`)
            : pad(`Text("${swiftStringEscape(content)}")`);
      line += `.font(${fontExpr(fs, props.fontWeight, 'normal')})`;
      // M2 :style 动态 → 运行时从 state 读取（fontSize 数值 / color hex 字符串）
      if (props.fontSizeDynamic !== undefined) {
        line += `.font(.system(size: ${props.fontSizeDynamic}))`;
      }
      // :class 动态色 → when ? activeColor : baseColor（base 由 vue2ir 注入，缺省白）
      if (props.colorActive) {
        line += `.foregroundColor(${props.colorActive.when} ? ${colorExpr(props.colorActive.color)} : ${colorExpr(props.color ?? '#ffffff')})`;
      } else if (props.colorDynamic !== undefined) {
        line += `.foregroundColor(Color(hex: ${props.colorDynamic}))`;
      } else if (props.color !== undefined) {
        line += `.foregroundColor(${colorExpr(props.color)})`;
      }
      if (props.textAlign !== undefined && props.textAlign !== 'left') {
        line += `.multilineTextAlignment(${ALIGN_MAP[props.textAlign]})`;
      }
      if (props.lineHeight !== undefined && props.fontSize !== undefined && props.lineHeight > props.fontSize) {
        line += `.lineSpacing(${props.lineHeight - props.fontSize})`;
      }
      // R-FLEXALIGN：text-align 对单行 Text 无效（multilineTextAlignment 只影响多行行内对齐），
      // 需通过 frame alignment 生效。flex:1（fillW0）或 fillW 的 frame 默认 .center → 右/左对齐丢失。
      // 例：cell 行 .row-desc { flex:1; text-align:right } → desc 需在撑满区域内右对齐而非居中。
      const effBox =
        props.textAlign === 'right'
          ? box.map((m) =>
              m === '.frame(minWidth: 0, maxWidth: .infinity)'
                ? '.frame(minWidth: 0, maxWidth: .infinity, alignment: .trailing)'
                : m === '.frame(maxWidth: .infinity)'
                  ? '.frame(maxWidth: .infinity, alignment: .trailing)'
                  : m === '.fillW0()'
                    ? '.fillW0(.trailing)'
                    : m === '.fillW()'
                      ? '.fillW(.trailing)'
                      : m,
            )
          : props.textAlign === 'center'
            ? box.map((m) =>
                m === '.frame(minWidth: 0, maxWidth: .infinity)'
                  ? '.frame(minWidth: 0, maxWidth: .infinity, alignment: .center)'
                  : m === '.frame(maxWidth: .infinity)'
                    ? '.frame(maxWidth: .infinity, alignment: .center)'
                    : m === '.fillW0()'
                      ? '.fillW0(.center)'
                      : m === '.fillW()'
                        ? '.fillW(.center)'
                        : m,
              )
            : box;
      for (const m of effBox) line += m;
      return line;
    }

    case 'button': {
      // R108：动态按钮文案（props.bind → @State）优先于静态 label
      const label =
        props.bind !== undefined
          ? props.bind
          : props.label !== undefined
            ? props.label
            : '按钮';
      const fs = props.fontSize ?? 15;
      // 事件：onSet（状态直接赋值）优先，其次 onClick（JS 运行时），无事件则空 action
      // M1：onSet.kind==='expr' → 表达式原样嵌入（count + 1）；literal → 数字原样/字符串加引号
      // R-BTNEMPTY：无事件的 button 也必须带 action 参数（Button(action:) 必填，空 action 会生成 Button() 不可编译）
      const action = actionExpr(props, ctx) ?? (ctx.warnings.push(`${ctx.path}: button 无 onSet/onClick，生成空 action（不可交互）`), '{}');
      let line = pad(`Button(action: ${action}) {`);
      line += `\n${indent(L + 1)}Text("${swiftStringEscape(label)}")`;
      line += `.font(${fontExpr(fs, props.fontWeight, 'medium')})`;
      if (props.fontSizeDynamic !== undefined) {
        line += `.font(.system(size: ${props.fontSizeDynamic}))`;
      }
      if (props.colorDynamic !== undefined) {
        line += `.foregroundColor(Color(hex: ${props.colorDynamic}))`;
      } else if (props.color !== undefined) {
        line += `.foregroundColor(${colorExpr(props.color)})`;
      }
      line += `\n${pad('}')}`;
      for (const m of box) line += m;
      if (props.pressBg !== undefined) {
        line += `.buttonStyle(PressButtonStyle(pressBg: ${colorExpr(props.pressBg as string)}))`;
      }
      return line;
    }

    case 'input': {
      // M1 v-model：值绑定已声明 string 状态 → TextField 原生 @State 双向（$x）；
      // M3 双向桥：@State 变更 → onChange 推送 stateStore（JS 侧同步，供 handler 读取）
      const placeholder = props.placeholder ?? '';
      const fs = props.fontSize ?? 15;
      let line = props.value
        ? pad(`TextField("${swiftStringEscape(placeholder)}", text: $${props.value})`)
        : pad(`TextField("${swiftStringEscape(placeholder)}", text: .constant(""))`);
      line += `.font(${fontExpr(fs, props.fontWeight, 'normal')})`;
      if (props.fontSizeDynamic !== undefined) {
        line += `.font(.system(size: ${props.fontSizeDynamic}))`;
      }
      if (props.colorDynamic !== undefined) {
        line += `.foregroundColor(Color(hex: ${props.colorDynamic}))`;
      } else if (props.color !== undefined) {
        line += `.foregroundColor(${colorExpr(props.color)})`;
      }
      if (props.value) {
        line += `.onChange(of: ${props.value}) { newValue in ${ctx.runtime}.pushState("${props.value}", newValue) }`;
      }
      for (const m of box) line += m;
      return line;
    }

    case 'scroll': {
      const dir = props.flexDirection ?? 'column';
      // R-G2：spacing 优先自身 gap；单 <template> condition 子项时取父透传 gap
      const spacing = props.gap ?? ctx.inheritGap ?? 0;
      const alignRaw = props.alignItems ?? 'stretch';
      // ScrollView 内容高度由内容决定 → 子项建议高度不确定（除非显式 height）
      const scrollDefinite = typeof props.height === 'number';
      // 交叉轴拉满仅当显式 align-items:stretch（盒模型 R29：默认内容高）
      const inner = emitChildren(
        node.children,
        dir,
        {
          parentAxis: dir,
          level: L + 1,
          definiteHeight: scrollDefinite,
          runtime: ctx.runtime,
          warnings: ctx.warnings,
          path: ctx.path,
          // 孙级透传源：scroll 自身 gap 优先，其次父级透传 gap
          inheritGap: props.gap ?? ctx.inheritGap,
          loop: ctx.loop, // M2：v-for 作用域透传
        },
        alignRaw,
        props.alignItems === 'stretch',
      );
      const body =
        pad(`ScrollView(.vertical, showsIndicators: ${props.showsIndicators ?? true}) {`) +
        `\n${indent(L + 1)}VStack(alignment: ${FLEX_START_MAP[alignRaw] ?? '.leading'}, spacing: ${spacing}) {` +
        `\n${inner}` +
        `\n${indent(L + 1)}}` +
        `\n${pad('}')}`;
      return body + box.map((m) => ' ' + m).join('');
    }

    case 'spacer': {
      const h = props.height;
      // height 只接受数字（'fill'/'auto' 原样内插会生成非法 Swift）
      const hNum = typeof h === 'number' ? h : undefined;
      return pad(hNum !== undefined ? `Spacer().frame(height: ${hNum})` : 'Spacer(minLength: 0)');
    }

    case 'divider': {
      let line = pad('Rectangle()');
      line += `.fill(${colorExpr(props.background ?? '#5b647e')})`;
      line += `.frame(height: ${typeof props.height === 'number' ? props.height : 1})`;
      line += frameExpr('fillW');
      return line + box.map((m) => ' ' + m).join('');
    }

    case 'image': {
      const w = typeof props.width === 'number' ? props.width : 40;
      const h = typeof props.height === 'number' ? props.height : 40;
      // box（absolute/transform/v-show/padding）与通用分支一致拼接，避免定位/显隐静默失效
      return pad(`RoundedRectangle(cornerRadius: ${props.radius ?? 0})`)
        + `.fill(Color.gray.opacity(0.25))`
        + `.frame(width: ${w}, height: ${h})`
        + `.overlay(Text("img"))`
        + box.map((m) => ' ' + m).join('');
    }

    case 'component': {
      // R41 使用点：<Name>View(prop1: "…", prop2: …) + 位置修饰（flex/width 来自组件根布局 props）
      // R-VFOBJ：循环字段表达式 prop → item["field"] ?? ""；onClick 含循环字段 → Swift 内联 routerPush
      const args = Object.entries(props.attrs ?? {})
        .map(([k, v]) =>
          typeof v === 'object' && v !== null && 'expr' in v
            ? `${k}: ${loopFieldExpr(v.expr, ctx.loop)}`
            : `${k}: ${swiftLiteral(v as string | number | boolean)}`,
        )
        .join(', ');
      let view = pad(`${props.name}View(${args})`);
      // 需 maxWidth:.infinity 以在父容器占满宽（组件 View 默认大小=内容）——父 row/column 的
      // alignItems:stretch 语义由使用点 frame 承担；组件根自身不携带布局。
      if (props.onClick) {
        const loopAction = loopClickAction(props.onClick, ctx.loop);
        const action = loopAction
          ? `action: { ${loopAction} }`
          : `action: { ${ctx.runtime}.invoke("${swiftStringEscape(props.onClick)}") }`;
        view =
          pad(`Button(${action}) {`) +
          `\n${indent(L + 1)}${view}` +
          `\n${pad('}')}.buttonStyle(.plain)`;
      }
      return view + box.map((m) => ' ' + m).join('');
    }

    case 'for': {
      // M2 v-for：静态数组字面量 → ForEach(0..<n, id: \.self)；闭包内 let item = [list][i]
      // M4b 动态列表（listState）：stateStore 数组（JSON 字符串桥）→ JSONSerialization 解码 → ForEach(enumerated)
      // 项模板内 {{ item }}/{{ i }} → Text("\(item)")/Text("\(i)")；onSet expr 直接引用局部变量
      const vf = node.vfor;
      if (!vf || !node.children || node.children.length === 0) {
        ctx.warnings.push(`${ctx.path}: for 节点缺 vfor/项模板，跳过`);
        return pad('// for: 缺 vfor 或项模板');
      }
      // 索引变量名跟随 v-for 声明（(item, idx) → idx；硬编码 'i' 会与模板 {{ idx }} 脱节）
      const indexVar = vf.indexKey ?? 'i';
      const items = node.children.map((c, i) =>
        emitNode(c, {
          parentAxis: 'column',
          level: L + 1,
          definiteHeight: false, // ForEach 项高度由内容决定（列表内无剩余空间分配）
          runtime: ctx.runtime,
          warnings: ctx.warnings,
          path: `${ctx.path}.for[${i}]`,
          loop: { itemKey: vf.itemKey, indexKey: vf.indexKey, indexVar },
          dataProps: ctx.dataProps, // R-VFOBJ-D
        }),
      );
      let body: string;
      if (vf.listState) {
        // 动态列表：解码失败或空数组时保持空（ForEach 不渲染）；if 语句不能直接挂修饰符 → Group 包裹
        body =
          `Group {\n` +
          indent(L + 1) +
          `if let _vrnArr = try? JSONSerialization.jsonObject(with: Data(${vf.listState}.utf8)) as? [Any] {\n` +
          indent(L + 2) +
          `ForEach(Array(_vrnArr.enumerated()), id: \\.offset) { _vrnPair in\n` +
          indent(L + 3) +
          `let ${vf.itemKey} = _vrnPair.element\n` +
          (vf.indexKey ? `${indent(L + 3)}let ${vf.indexKey} = _vrnPair.offset\n` : '') +
          items.join('\n') +
          `\n${indent(L + 2)}}` +
          `\n${indent(L + 1)}}` +
          `\n${pad('}')}`;
      } else {
        // R-VFOBJ-D：静态数组抽离为 struct 属性（数据与布局分离；属性名复用 script const 名或 list）
        const propName = vf.srcName && /^[A-Za-z_]\w*$/.test(vf.srcName) ? vf.srcName : 'vforList';
        const isObjArr = vf.list!.every((v) => typeof v === 'object' && v !== null);
        const typeName = isObjArr
          ? '[[String: String]]'
          : vf.list!.every((v) => typeof v === 'number')
            ? '[Int]'
            : '[String]';
        const lit = vf.list!.map((v) => '        ' + swiftLiteral(v)).join(',\n');
        if (ctx.dataProps) {
          ctx.dataProps.push(
            `    private let ${propName}: ${typeName} = [\n${lit}\n    ]`,
          );
        }
        body =
          pad(`ForEach(${propName}.indices, id: \\.self) { ${indexVar} in`) +
          `\n${indent(L + 1)}let ${vf.itemKey} = ${propName}[${indexVar}]` +
          `\n${items.join('\n')}` +
          `\n${pad('}')}`;
      }
      return body + box.map((m) => ' ' + m).join('');
    }

    default:
      return pad('// unknown node: ' + node.type);
  }
}

/* ============ 屏级发射 ============ */

/** M7 导航栏与沉浸式：navBar 配置 → SwiftUI 修饰符（参数标准 R66） */
function navBarModifiers(
  screen: IrScreen,
  warnings: string[],
): string {
  const nav = screen.navBar;
  if (!nav) {
    // R66 兜底：页面未声明 navBar 时用 IR title（多页模式 = 路由 meta.title）渲染页面级导航栏，
    // 对位 Android 详情页 TopAppBar（标题 + 系统返回箭头）。iOS 26 容器级 navigationTitle 不生效（R68），
    // 页面级才可靠；此前无 navBar 的详情页完全没有标题（与 Android 行为不一致）
    return [
      `    .navigationTitle("${swiftStringEscape(screen.title)}")`,
      `    .navigationBarTitleDisplayMode(.inline)`,
      `    .toolbarColorScheme(.dark, for: .navigationBar)`,
    ].join('\n');
  }
  const mods: string[] = [];
  const mode = nav.mode ?? 'fixed';
  const title = nav.title ?? screen.title;
  mods.push(`    .navigationTitle("${swiftStringEscape(title)}")`);
  // R68：导航栏文字统一浅色（深色 UI；iOS 默认黑字在深色背景下看不清）
  mods.push(`    .toolbarColorScheme(.dark, for: .navigationBar)`);
  if (mode === 'scroll') {
    // 大标题滚动自动折叠（系统原生行为：滚上去 title 收成内联 + 出现背景）
    mods.push(`    .navigationBarTitleDisplayMode(.large)`);
  } else {
    mods.push(`    .navigationBarTitleDisplayMode(.inline)`);
    if (mode === 'transparent') {
      mods.push(`    .toolbarBackground(.hidden, for: .navigationBar)`);
    } else {
      mods.push(`    .toolbarBackground(.visible, for: .navigationBar)`);
      if (nav.bg) mods.push(`    .toolbarBackground(${colorExpr(nav.bg)}, for: .navigationBar)`);
    }
  }
  if (nav.backText) {
    // backText：隐藏系统返回 + 自定义返回按钮（onTapGesture 规避 iOS 26 Button 重载歧义）
    mods.push(`    .navigationBarBackButtonHidden(true)`);
    mods.push(`    .toolbar {`);
    mods.push(`        ToolbarItem(placement: .topBarLeading) {`);
    mods.push(`            HStack(spacing: 4) {`);
    mods.push(`                Image(systemName: "chevron.left").font(.system(size: 14))`);
    mods.push(`                Text("${swiftStringEscape(nav.backText)}").font(.system(size: 16))`);
    mods.push(`            }`);
    mods.push(`            .foregroundColor(${colorExpr('#d9b36c')})`);
    mods.push(`            .contentShape(Rectangle())`);
    mods.push(`            .onTapGesture { dismiss() }`);
    mods.push(`        }`);
    mods.push(`    }`);
  }
  if (nav.immersive) {
    // 背景顶到状态栏（edge-to-edge）：仅背景色扩展，内容留在安全区
    const bg = nav.bg ?? (screen.ui.props?.background as string | undefined) ?? '#0a0f1e';
    mods.push(`    .background(${colorExpr(bg)}.ignoresSafeArea(edges: .top))`);
    if (!nav.bg && mode === 'fixed') {
      warnings.push(`navBar.immersive 未指定 bg，使用页面根背景 ${bg} 作为状态栏底色（R66）`);
    }
  }
  return mods.join('\n');
}

export function generateScreenSource(
  screen: IrScreen,
  opts: {
    warnings?: string[];
    theme?: { colorNames: Map<string, string>; fontNames: Map<string, string> };
    /** M4a 多页：页面运行时引用（默认 Runtime.shared 单例；多页传 Runtime.forPage("<id>") 隔离 JS 上下文） */
    runtime?: string;
    /** M4b Tabs：状态提升到容器（页面用 @Binding、不生成 onAppear；绑定+onMounted 由容器统一驱动） */
    bindingMode?: 'external';
  } = {},
): string {
  const __stateNames = new Set((screen.state ?? []).map((st) => st.name));
  currentStateNames = __stateNames;
  const rt = opts.runtime ?? 'Runtime.shared';
  // R42：色板存在时颜色/字体走 Theme token；R43：frame 走 View 扩展短调用
  currentColorNames = opts.theme?.colorNames;
  currentFontNames = opts.theme?.fontNames;
  currentFrameShort = opts.theme !== undefined;
  currentStateTypes = Object.fromEntries(
    (screen.state ?? []).map((s) => [
      s.name,
      typeof s.init === 'string' ? 'string' : typeof s.init === 'boolean' ? 'boolean' : 'number',
    ]),
  );
  const structName = `${toSwiftIdentifier(screen.id)}View`;
  const warnings = opts.warnings ?? [];
  // R-PAGESCROLL：根容器始终为可滚动视口（见 emitNode root 分支），无需内容高度启发式
  const dataProps: string[] = [];
  const body = emitNode(screen.ui, {
      stateNames: __stateNames,
    parentAxis: 'column',
    level: 1,
    definiteHeight: true, // root 撑满全屏（maxHeight:.infinity）→ 根容器高度确定
    warnings,
    path: 'ui',
    runtime: rt,
    dataProps,
  });
  const stateDecls = (screen.state ?? [])
    .map((s) => {
      // M4b Tabs：状态提升到容器（external）→ 页面用 @Binding（不可 private，否则成员 init 变私有无法调用）；单页保持 @State
      if (opts.bindingMode === 'external') {
        return `    @Binding var ${s.name}: ${
          typeof s.init === 'string' ? 'String' : typeof s.init === 'boolean' ? 'Bool' : 'Int'
        }`;
      }
      const init =
        s.obj && typeof s.init === 'string'
          ? `#"${s.init}"#` // R85 对象态：JSON 原文（vrnField 按点路径解析）
          : typeof s.init === 'string'
          ? `"${swiftStringEscape(s.init)}"`
          : typeof s.init === 'boolean'
            ? (s.init ? 'true' : 'false')
            : String(s.init);
      return `    @State private var ${s.name} = ${init}`;
    })
    .join('\n');
  const hasLogic = (screen.handlers?.length || screen.onMounted) !== undefined;
  const needDismiss = screen.navBar?.backText !== undefined && screen.navBar.backText.length > 0;
  return [
    'import SwiftUI',
    '',
    '// GENERATED by vue-render-native compiler · P0.3',
    `// source: ${screen.id}.ir.json (${screen.width ?? 360}x${screen.height ?? 640})`,
    '',
    `struct ${structName}: View {`,
    ...(stateDecls ? [stateDecls, ''] : []),
    ...(needDismiss ? ['    @Environment(' + '\\' + '.dismiss) private var dismiss', ''] : []),
    // R-VFOBJ-D：静态 v-for 数据属性（数据与布局分离，body 只留 ForEach + 组件引用）
    ...(dataProps.length ? [dataProps.join('\n'), ''] : []),
    '    var body: some View {',
    body +
      // R68：导航栏标题与文字色挂页面级——iOS 26 容器级 navigationTitle/toolbarColorScheme 不生效
      // （tab 容器只保留背景/沉浸控制；页面级渲染标题才能保证浅色可读）
      (opts.bindingMode === 'external'
        ? externalNavBarTitle(screen)
        : (() => { const nav = navBarModifiers(screen, warnings); return nav && '\n' + nav; })()) +
      (!opts.bindingMode && hasLogic ? '\n' + onAppearBlock(screen, rt) : ''),
    '    }',
    '}',
    '',
  ].join('\n');
}

/** R68：external（tab 容器）模式页面级导航栏颜色兜底——标题由容器动态生成（selected 条件），
 *  页面级 toolbarColorScheme 保证标题浅色（iOS 26 容器级不生效）；页面级不再挂 navigationTitle，
 *  避免 ZStack 常驻多页面时标题取第一个导致切换不跟随 */
function externalNavBarTitle(screen: IrScreen): string {
  return `\n    .toolbarColorScheme(.dark, for: .navigationBar)`;
}

/** M3：onAppear 注册 @State ↔ stateStore 绑定 + 触发 onMounted（有 JS 逻辑时追加到 root 链尾）
 * M4b：改用 .task——iOS 26 模拟器上 if 分支切换的视图 .onAppear 偶发不触发，.task 在视图出现时必定启动 */
function onAppearBlock(screen: IrScreen, rt: string): string {
  const lines: string[] = [];
  for (const s of screen.state ?? []) {
    const type =
      typeof s.init === 'string' ? 'string' : typeof s.init === 'boolean' ? 'boolean' : 'number';
    const swiftType = type === 'string' ? 'String' : type === 'boolean' ? 'Bool' : 'Int';
    lines.push(`        ${rt}.bindState("${s.name}") { v in ${s.name} = v as? ${swiftType} ?? ${s.name} }`);
  }
  if (screen.onMounted !== undefined) {
    lines.push(`        ${rt}.invoke("__onMounted")`);
  }
  return (
    '        .onAppear {\n' + lines.join('\n') + '\n        }'
  );
}

/** 事件动作占位注释（P0 运行时阶段实现，这里仅生成可读注释便于对拍） */
export function actionComment(action: IrAction): string {
  return `// action: ${action.kind} ${action.path ?? action.fn ?? ''}`;
}

/* ============ R41 组件 View 独立文件生成 ============ */

/** 组件 props 字面量 → Swift 参数（组件 View 属性均为 String：数字/布尔 → 字符串字面量） */
function swiftLiteral(v: string | number | boolean | Record<string, string | number>): string {
  // R-VFOBJ：对象 → Swift 字典字面量（[String: String]；全字符串值可推断，混数字值会推断失败 → build 报错可见）
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v)
      .map(([k, val]) => `"${k}": ${typeof val === 'string' ? `"${swiftStringEscape(val)}"` : String(val)}`)
      .join(', ');
    return `[${entries}]`;
  }
  if (typeof v === 'string') return `"${swiftStringEscape(v)}"`;
  // 数字 → 原样（Swift Int/双精度字面量）；布尔 → Swift Bool 字面量
  if (typeof v === 'number') return String(v);
  return String(v);
}

/** R-VFOBJ：循环变量字段表达式 item.name → item["name"] ?? ""（组件动态 props / onClick 内联） */
function loopFieldExpr(expr: string, loop: { itemKey: string } | undefined): string {
  const m = expr.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
  if (m && loop && m[1] === loop.itemKey) return `${m[1]}["${m[2]}"] ?? ""`;
  return `"${swiftStringEscape(expr)}"`;
}

/** M4b dynField 字段取值：元素可能是动态列表解码出的 Any → 统一 as? [String: Any] 取值（静态 [String:String] 字典同样命中） */
function dictFieldExpr(varName: string, field: string): string {
  return `((${varName} as? [String: Any])?[\"${field}\"] as? String) ?? \"\"`;
}

/** 事件 action 体（onSet 状态赋值优先 / onClick JS 运行时）：button 用 `action: <体>`，其余节点用 `.onTapGesture <体>` */
function actionExpr(props: IrProps, ctx: { runtime: string }): string | undefined {
  if (props.onSet !== undefined) {
    const v = props.onSet.value;
    const lit =
      props.onSet.kind === 'expr'
        ? String(v)
        : typeof v === 'string'
          ? `"${swiftStringEscape(v)}"`
          : v;
    return `{ ${props.onSet.var} = ${lit}; ${ctx.runtime}.pushState("${props.onSet.var}", ${props.onSet.var}) }`;
  }
  if (props.onClick !== undefined) {
    return `{ ${ctx.runtime}.invoke("${swiftStringEscape(props.onClick)}") }`;
  }
  return undefined;
}

/** R-VFOBJ：onClick 表达式含循环变量字段 → 返回 Swift 内联 action 体；否则 null。
 *  支持 router.push(item.path) → Runtime.routerPushHandler?(item["path"] ?? "")；
 *  其他含循环字段表达式不支持（warning 由调用方给出）。 */
function loopClickAction(onClick: string, loop: { itemKey: string } | undefined): string | null {
  if (!loop) return null;
  const re = new RegExp(`${loop.itemKey}\\.([A-Za-z_][\\w$]*)`, 'g');
  if (!re.test(onClick)) return null;
  const m = onClick.match(/^router\.push\((.*)\)$/s);
  if (!m) return null;
  const arg = m[1].replace(re, `${loop.itemKey}["$1"] ?? ""`);
  return `Runtime.routerPushHandler?(${arg})`;
}

/** 收集组件 IR 树中所有 text ref → prop 名（组件 View 的 let 属性集合） */
function collectRefs(node: IrNode, out: Set<string>): Set<string> {
  if (node.type === 'text' && node.props?.ref !== undefined) out.add(node.props.ref);
  for (const c of node.children ?? []) collectRefs(c, out);
  return out;
}

/**
 * R41 组件 → 独立 Swift 文件源码：
 *   struct StatCellView: View { let value: String; let label: String; var body: some View { … } }
 * - body = 组件 IR 树（组件样式独立作用域；组件根布局 props 已剥离，View 大小由内容决定）
 * - {{ prop }} → Text(prop)
 */
export function generateComponentSource(
  name: string,
  ui: IrNode,
  opts: { warnings?: string[]; theme?: { colorNames: Map<string, string>; fontNames: Map<string, string> } } = {},
): string {
  const warnings = opts.warnings ?? [];
  // R42：组件 View 与页面共享同一 Theme.swift；R43：frame 短调用同步启用
  if (opts.theme) {
    currentColorNames = opts.theme.colorNames;
    currentFontNames = opts.theme.fontNames;
    currentFrameShort = true;
    currentStateTypes = {};
  }
  const props = collectRefs(ui, new Set());
  const dataProps: string[] = [];
  const body = emitNode(ui, {
    parentAxis: 'column',
    level: 1,
    definiteHeight: false, // 组件 View 高度由内容决定（父容器不预知）
    runtime: 'Runtime.shared', // 组件内事件引用默认单例运行时（组件无独立状态上下文）
    warnings,
    path: `${name}View.body`,
    dataProps,
  });
  const propDecls = [...props]
    .map((p) => `    let ${p}: String`)
    .join('\n');
  return [
    'import SwiftUI',
    '',
    '// GENERATED by vue-render-native compiler · R41 component view',
    `// source: components/${name}.vue`,
    '',
    `struct ${name}View: View {`,
    ...(propDecls ? [propDecls, ''] : []),
    // R-VFOBJ-D：静态 v-for 数据属性（组件内同样分离）
    ...(dataProps.length ? [dataProps.join('\n'), ''] : []),
    '    var body: some View {',
    body,
    '    }',
    '}',
    '',
  ].join('\n');
}
