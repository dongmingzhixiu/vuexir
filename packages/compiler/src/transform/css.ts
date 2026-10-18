/**
 * CSS 子集解析与映射：Vue `<style>` 块（postcss 解析）→ IR props。
 *
 * 支持子集（R15 降级表编译期报错，不静默产出错误原生代码）：
 *  - 布局：display:flex / flex-direction / width(px|100%) / height(px)
 *           padding / gap / flex:1 / margin-top:auto(→flex:1 贴底语义) / justify-content / align-items
 *  - 视觉：background(-color) / color / border-radius / border(1px solid rgba/c #hex)
 *  - 文本：font-size / font-weight / line-height / text-align
 *  - 其他：opacity
 * 不在子集内的属性 → 收集到 warnings（编译期提示，不静默忽略）。
 */
import postcss from 'postcss';

export interface CssParseResult {
  /** className（去点）→ IR props */
  classProps: Map<string, Record<string, unknown>>;
  /** 组合选择器规则（如 .a.b）：元素同时具备全部类时生效，优先级最高 */
  comboRules: { classes: string[]; props: Record<string, unknown> }[];
  /** M5 后代/子选择器（.a .b / .a > .b）：目标类 + 祖先类链 */
  scopedRules: { target: string; ancestors: string[]; direct: boolean; props: Record<string, unknown> }[];
  /** M5 伪类（.btn:active / :hover）：按压态样式（仅 background 生效） */
  pseudoRules: { cls: string; pseudo: 'active' | 'hover'; props: Record<string, unknown> }[];
  warnings: string[];
}

const px = (v: string): number | null => {
  const s = v.trim();
  const m = s.match(/^([\d.]+)px$/);
  if (m) return Number(m[1]);
  // CSS 中 0 可无单位（padding:0 16px 等简写场景）
  return s === '0' ? 0 : null;
};

const num = (v: string): number | null => {
  const m = v.trim().match(/^([\d.]+)$/);
  return m ? Number(m[1]) : null;
};

/** 与 schema isColor 同源的 CSS 颜色校验：仅 #rgb / #rrggbb / rgb[a]() / hsl[a]()（named/var() 原生端不可解析，拒绝） */
function isCssColor(v: string): boolean {
  const s = v.trim();
  if (/^var\([^)]*\)$/.test(s)) return true; // CSS 变量（含 fallback 形态）：值留给 codegen 按项目 tokens 解析
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return true;
  if (/^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*([\d.]+%?|0))?\s*\)$/.test(s)) return true;
  if (/^hsla?\(\s*[\d.]+(deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*([\d.]+|0))?\s*\)$/.test(s)) return true;
  return false;
}

/** CSS <style> 块语法错误（postcss parse 抛出）→ 显式类型，vue2ir 转为 VueCompileError（R15：不静默吞掉） */
export class CssParseError extends Error {}

/** CSS 声明 → IR props 列表（一条声明可映射多个 prop，如 border → borderWidth+borderColor）。
 *  值不在子集内 → 返回 null，由包装函数统一推送 R15 降级警告（不静默丢弃）。 */
function mapDecl(prop: string, value: string, warnings: string[]): [string, unknown][] | null {
  const mapped = mapDeclInner(prop, value, warnings);
  if (mapped === null) {
    warnings.push(`CSS 属性「${prop}: ${value}」不在子集内，已忽略（R15 降级表）`);
    return [];
  }
  return mapped;
}

function mapDeclInner(prop: string, value: string, warnings: string[]): [string, unknown][] | null {
  const v = value.trim();
  switch (prop) {
    case 'grid-template-columns': {
      // R136：CSS grid 的最小支持——`repeat(N, 1fr)` / `1fr 1fr 1fr` → 列数
      const rep = String(v).match(/repeat\(\s*(\d+)\s*,/);
      if (rep) return [['gridColumns', Number(rep[1])]];
      const cols = String(v).trim().split(/\s+/).filter((x) => x.endsWith('fr')).length;
      return cols > 1 ? [['gridColumns', cols]] : null;
    }
    case 'display':
      // display:flex → 容器语义；display:block/none 不映射（flex 为默认容器）
      // R135：CSS 的 display:flex 默认 main axis 是 row（此前默认 column →
      // 横向工具栏/星期行被渲染成纵向堆叠，日历标题栏就是这么坏掉的）
      return v === 'flex' ? [['flexDirection', 'row']] : null;
    case 'flex-direction':
      return [['flexDirection', v]];
    case 'flex': {
      // flex:N（N 为正整数）→ 弹性占比；flex:0 语义为不伸展（IR 缺省即无 flex，合法空映射）
      const n = num(v);
      if (n === null || Number.isInteger(n) === false) return null;
      return n > 0 ? [['flex', n]] : [];
    }
    case 'flex-grow':
      // flex-grow:N → IR flex（弹性占比）；CSS 子项在剩余空间分配中按 grow 比例伸展
      return /^[0-9]+$/.test(v) && Number(v) > 0 ? [['flex', Number(v)]] : null;
    case 'flex-shrink':
      // flex-shrink:0 = 不压缩：iOS 端 flex:1 生成 maxHeight/.infinity 天然不压缩，
      // 默认内容自适应亦不压缩 → 语义已满足，无需 IR 字段（仅消除「不在子集」误报）
      return /^[0-9]+$/.test(v) ? [] : null;
    case 'overflow':
      // overflow:auto → 标记转 scroll 节点（vue2ir 消费后删除）
      // R71 overflow:hidden → IR clip（裁剪超出容器内容，对位 Web overflow 语义）
      if (v === 'auto') return [['overflow', 'auto']];
      if (v === 'hidden') return [['clip', true]];
      return null;
    case 'width': {
      if (v === '100%') return [['width', 'fill']];
      const n = px(v);
      return n !== null ? [['width', n]] : null;
    }
    case 'height': {
      // height:100% → 撑满父高（转 flex:1；父高度确定链上占满，root 撑满屏场景等价）
      if (v === '100%') return [['flex', 1]];
      const n = px(v);
      return n !== null ? [['height', n]] : null;
    }
    case 'padding': {
      // 支持 1~4 值简写：1=四边相等；2=上下/左右；3=上/左右/下；4=上右下左
      const parts = v.split(/\s+/).filter(Boolean).map(px);
      if (parts.length === 1 && parts[0] !== null) return [['padding', parts[0]]];
      if (parts.length >= 2 && parts.every((n) => n !== null)) {
        const [t, r, b, l] = parts as number[];
        return [['padding', { top: t, right: r, bottom: b ?? t, left: l ?? r }]];
      }
      return null;
    }
    case 'padding-top':
    case 'padding-right':
    case 'padding-bottom':
    case 'padding-left': {
      // R70 单边 padding → 与简写统一为对象形式（classProps 合并时按边深合并）
      const n = px(v);
      if (n === null) return null;
      const side = prop.slice('padding-'.length);
      return [['padding', { [side]: n }]];
    }
    case 'margin-bottom':
    case 'margin-right':
    case 'margin-left': {
      // R70 单边外边距（margin-top 已支持 auto/px）
      if (v === 'auto') {
        // 仅 margin-left:auto 在 row 内有「推到行尾」语义；其余方向 auto 暂不支持
        return prop === 'margin-left' ? [['marginLeftAuto', true]] : null;
      }
      const n = px(v);
      if (n === null) return null;
      const map: Record<string, string> = { 'margin-bottom': 'marginBottom', 'margin-right': 'marginRight', 'margin-left': 'marginLeft' };
      return [[map[prop], n]];
    }
    case 'gap': {
      const n = px(v);
      return n !== null ? [['gap', n]] : null;
    }
    case 'margin-top':
      // margin-top:auto → 推到底部（自身尺寸不变；生成器用前置 Spacer 实现，区别于 flex:1 占满）
      // margin-top:<px> → 前置固定高度空隙（CSS margin 语义）
      if (v === 'auto') return [['marginTopAuto', true]];
      {
        const n = px(v);
        return n !== null ? [['marginTop', n]] : null;
      }
    case 'margin-left':
      // margin-left:auto → 推到行尾（row 内；生成器用前置 Spacer 实现，用于「>」等行尾元素）
      return v === 'auto' ? [['marginLeftAuto', true]] : null;
    case 'justify-content': {
      // CSS 值 → IR 枚举（R17：两端 1:1）
      const map: Record<string, string> = {
        'flex-start': 'start',
        center: 'center',
        'flex-end': 'end',
        'space-between': 'spaceBetween',
        'space-around': 'spaceAround',
      };
      const ir = map[v];
      return ir ? [['justifyContent', ir]] : null;
    }
    case 'align-items': {
      const map: Record<string, string> = {
        'flex-start': 'start',
        center: 'center',
        'flex-end': 'end',
        stretch: 'stretch',
      };
      const ir = map[v];
      return ir ? [['alignItems', ir]] : null;
    }
    case 'background':
    case 'background-color':
      // 颜色子集校验（named/var() 原生端不可解析）——拒绝并告警，不生成非法原生代码
      if (!isCssColor(v)) {
        warnings.push(`CSS 颜色值「${v}」仅支持 #rgb/#rrggbb/rgb()/hsl()，已忽略（named/var 暂不支持，R15）`);
        return [];
      }
      return [['background', v]];
    case 'border-radius': {
      const n = px(v);
      if (n === null && v.endsWith('%')) {
        warnings.push(`border-radius 百分比「${v}」暂不支持（两端圆角语义不一致），已忽略`);
        return [];
      }
      return n !== null ? [['radius', n]] : null;
    }
    case 'border-top':
    case 'border-right':
    case 'border-bottom':
    case 'border-left': {
      // R70 单边简写：<width>px solid <color>（发丝分割线常用 0.5px）
      const side = prop.slice('border-'.length);
      const m = v.match(/^([\d.]+)px\s+solid\s+(.+)$/i);
      if (!m) {
        warnings.push(`border-${side} 仅支持「<N>px solid <color>」简写，已忽略（可用 border-${side}-width/-color）`);
        return [];
      }
      if (!isCssColor(m[2].trim())) {
        warnings.push(`border-${side} 颜色值「${m[2].trim()}」仅支持 #rgb/#rrggbb/rgb()/hsl()，已忽略（R15）`);
        return [];
      }
      return [['borderSides', { [side]: { width: Number(m[1]), color: m[2].trim() } }]];
    }
    case 'border-top-width':
    case 'border-right-width':
    case 'border-bottom-width':
    case 'border-left-width': {
      const n = px(v);
      if (n === null) return null;
      return [['borderSides', { [prop.split('-')[1]]: { width: n } }]];
    }
    case 'border-top-color':
    case 'border-right-color':
    case 'border-bottom-color':
    case 'border-left-color': {
      if (!isCssColor(v)) {
        warnings.push(`CSS 颜色值「${v}」仅支持 #rgb/#rrggbb/rgb()/hsl()，已忽略（named/var 暂不支持，R15）`);
        return [];
      }
      return [['borderSides', { [prop.split('-')[1]]: { color: v } }]];
    }
    case 'border-top-style':
    case 'border-right-style':
    case 'border-bottom-style':
    case 'border-left-style': {
      // 仅 solid 可表达（none 表示无边框 → 显式移除该边）；其余样式（dashed/dotted）暂不支持
      const side = prop.split('-')[1];
      if (v === 'solid') return [];
      if (v === 'none') return [['borderSides', { [side]: { width: 0 } }]];
      warnings.push(`border-${side}-style: ${v} 暂不支持（仅 solid/none），已忽略`);
      return [];
    }
    case 'border-style':
      // 全边样式：solid 无额外动作（配合 border-width/color）；none 归零
      if (v === 'solid') return [];
      if (v === 'none') return [['borderWidth', 0]];
      warnings.push(`border-style: ${v} 暂不支持（仅 solid/none），已忽略`);
      return [];
    case 'border': {
      // 仅支持 1px solid <color>（rgba(...) / #hex）
      const m = v.match(/^(\d+)px\s+solid\s+(.+)$/i);
      if (!m) {
        warnings.push(`border 仅支持「Npx solid <color>」简写，已忽略（可用 border-width / border-color）`);
        return [];
      }
      if (!isCssColor(m[2].trim())) {
        warnings.push(`border 颜色值「${m[2].trim()}」仅支持 #rgb/#rrggbb/rgb()/hsl()，已忽略（R15）`);
        return [];
      }
      return [
        ['borderWidth', Number(m[1])],
        ['borderColor', m[2].trim()],
      ];
    }
    case 'border-width': {
      const n = px(v);
      return n !== null ? [['borderWidth', n]] : null;
    }
    case 'border-color':
      if (!isCssColor(v)) {
        warnings.push(`CSS 颜色值「${v}」仅支持 #rgb/#rrggbb/rgb()/hsl()，已忽略（named/var 暂不支持，R15）`);
        return [];
      }
      return [['borderColor', v]];
    case 'color':
      if (!isCssColor(v)) {
        warnings.push(`CSS 颜色值「${v}」仅支持 #rgb/#rrggbb/rgb()/hsl()，已忽略（named/var 暂不支持，R15）`);
        return [];
      }
      return [['color', v]];
    case 'font-size': {
      const n = px(v);
      return n !== null ? [['fontSize', n]] : null;
    }
    case 'font-weight': {
      // CSS 关键字/数值 → IR 枚举（normal/medium/bold 三档；300/800/900 等数值归档）
      const fw: Record<string, string> = {
        normal: 'normal',
        light: 'normal',
        '400': 'normal',
        medium: 'medium',
        '500': 'medium',
        bold: 'bold',
        semibold: 'bold',
        '600': 'bold',
        '700': 'bold',
        heavier: 'bold',
        bolder: 'bold',
      };
      if (fw[v]) return [['fontWeight', fw[v]]];
      const n = num(v);
      if (n !== null) return [['fontWeight', n <= 400 ? 'normal' : n < 600 ? 'medium' : 'bold']];
      return null;
    }
    case 'line-height': {
      // px 字面量直接映射；无单位比值（1.5 等）映射成 pt 会破坏行高 → 拒绝并提示用 px
      const n = num(v) ?? px(v);
      if (n !== null && n < 5) {
        warnings.push(`line-height 无单位比值「${v}」暂不支持（会按字面量生成过小行高），请改用 px 值，已忽略`);
        return [];
      }
      return n !== null ? [['lineHeight', n]] : null;
    }
    case 'text-align':
      return [['textAlign', v]];
    case 'opacity': {
      const n = num(v);
      return n !== null ? [['opacity', n]] : null;
    }
    case 'position':
      // M5：position:absolute → 脱离文档流（ZStack 定位 + offset）；其余值不映射
      return v === 'absolute' ? [['position', 'absolute']] : null;
    case 'top':
    case 'left':
    case 'right':
    case 'bottom': {
      // M5：absolute 定位偏移（仅 px；与 position:absolute 同规则才生效）
      const n = px(v);
      return n !== null ? [[`abs${prop[0].toUpperCase()}${prop.slice(1)}`, n]] : null;
    }
    case 'transform': {
      // M5：scale(N) / rotate(Ndeg) / translate(Xpx[, Ypx])，多个用空格组合
      const out: Record<string, unknown> = {};
      let ok = true;
      for (const fn of v.matchAll(/(\w+)\(([^)]*)\)/g)) {
        const name = fn[1];
        const args = fn[2].trim();
        if (name === 'scale') {
          const n = num(args);
          if (n === null) { ok = false; break; }
          out.scale = n;
        } else if (name === 'rotate') {
          const m = args.match(/^([\d.]+)deg$/);
          if (!m) { ok = false; break; }
          out.rotate = Number(m[1]);
        } else if (name === 'translate') {
          const pts = args.split(',').map(px);
          if (pts.some((p) => p === null)) { ok = false; break; }
          out.translateX = (pts[0] as number) ?? 0;
          out.translateY = (pts[1] as number) ?? 0;
        } else {
          ok = false;
          break;
        }
      }
      if (!ok || Object.keys(out).length === 0) {
        warnings.push(`transform 仅支持 scale(N)/rotate(Ndeg)/translate(Xpx,Ypx) 组合（M5），已忽略：${v}`);
        return [];
      }
      return [['transform', out]];
    }
    default:
      // 记录未映射属性（编译期提示）
      warnings.push(`CSS 属性「${prop}: ${v}」不在子集内，已忽略（R15 降级表）`);
      return null;
  }
}

/**
 * R70 结构化 prop 合并：padding / borderSides 需要按边深合并——
 * 单边声明（padding-top / border-bottom-width / border-bottom-color）是独立 decl，
 * 直接覆盖会让同一 class 内的多条声明互相清空。
 */
export function mergeIrProps<T extends object>(target: T, src: object): T {
  const t = target as unknown as Record<string, unknown>;
  for (const [key, val] of Object.entries(src)) {
    if (key === 'padding') {
      const prev = t.padding;
      if (prev === undefined && typeof val === 'number') {
        t.padding = val; // 保持简写 number 形式（生成器两形式都支持）
      } else {
        const toObj = (x: unknown): Record<string, number> =>
          typeof x === 'number'
            ? { top: x, right: x, bottom: x, left: x }
            : ((x ?? {}) as Record<string, number>);
        t.padding = { ...toObj(prev), ...toObj(val) };
      }
      continue;
    }
    if (key === 'borderSides') {
      const prev = (t.borderSides ?? {}) as Record<string, Record<string, unknown>>;
      const add = (val ?? {}) as Record<string, Record<string, unknown>>;
      const out: Record<string, Record<string, unknown>> = { ...prev };
      for (const [side, sv] of Object.entries(add)) out[side] = { ...(prev[side] ?? {}), ...sv };
      t.borderSides = out;
      continue;
    }
    t[key] = val;
  }
  return target;
}

/** 解析 `<style>` 内容 → 类规则表 */
export function parseCss(source: string, warnings: string[]): CssParseResult {
  const classProps = new Map<string, Record<string, unknown>>();
  const comboRules: CssParseResult['comboRules'] = [];
  const scopedRules: CssParseResult['scopedRules'] = [];
  const pseudoRules: CssParseResult['pseudoRules'] = [];
  let root: postcss.Root;
  try {
    root = postcss.parse(source);
  } catch (e) {
    // R15：语法错误必须显式失败（vue2ir 转为 VueCompileError），不能产出半份样式表
    throw new CssParseError(`CSS 解析失败：${e instanceof Error ? e.message : String(e)}`);
  }

  /** 规则声明块 → IR props */
  const collectProps = (rule: postcss.Rule, warnings: string[]): Record<string, unknown> => {
    const props: Record<string, unknown> = {};
    rule.walkDecls((decl) => {
      const mapped = mapDecl(decl.prop, decl.value, warnings);
      if (mapped) for (const [k, val] of mapped) mergeIrProps(props, { [k]: val });
    });
    return props;
  };
  /** 复合类（.a.b → ['a','b']；.a → ['a']） */
  const compound = (sel: string): string[] | null => {
    if (!/^\.([A-Za-z_][\w-]*)(?:\.[A-Za-z_][\w-]*)*$/.test(sel)) return null;
    return sel.split('.').filter(Boolean);
  };

  root.walkRules((rule) => {
    const sel = rule.selector.trim();
    // M5 媒体查询子集：@media (prefers-color-scheme: dark) 内规则在 App 强制深色下即生效变体，与普通规则合并（后应用覆盖）；
    // light 媒体 / 其他媒体（宽度等）降级警告
    const parent = rule.parent as { type?: string; params?: string } | undefined;
    if (parent && parent.type === 'atrule') {
      const params = (parent.params ?? '').replace(/\s+/g, ' ');
      if (/prefers-color-scheme\s*:\s*dark/i.test(params)) {
        // dark 变体：走下方普通类规则路径（深色环境下覆盖同名声明）
      } else if (/prefers-color-scheme\s*:\s*light/i.test(params)) {
        warnings.push(`@media (prefers-color-scheme: light) 不支持（App 强制深色），已忽略：${sel}`);
        return;
      } else {
        warnings.push(`媒体查询「${params}」不在子集内（仅 prefers-color-scheme: dark），已忽略：${sel}`);
        return;
      }
    }
    // M5 伪类：.cls:active / .cls:hover（仅 background 取作按压态）
    const pm = sel.match(/^\.([A-Za-z_][\w-]*):(active|hover)$/);
    if (pm) {
      const props = collectProps(rule, warnings);
      const bg = props['background'];
      if (bg !== undefined) {
        pseudoRules.push({ cls: pm[1], pseudo: pm[2] as 'active' | 'hover', props: { pressBg: bg } });
      } else {
        warnings.push(`:${pm[2]} 伪类仅支持 background 按压态（M5 子集），已忽略：${sel}`);
      }
      return;
    }
    // M5 后代/子选择器：.a .b / .a > .b（目标单类，祖先可复合）
    let rawParts: string[] | null = null;
    let direct = false;
    if (sel.includes('>')) {
      rawParts = sel.split('>').map((s) => s.trim());
      direct = true;
    } else if (/\s+/.test(sel)) {
      rawParts = sel.split(/\s+/);
    }
    if (rawParts && rawParts.length >= 2 && rawParts.every((p) => compound(p) !== null)) {
      const target = compound(rawParts[rawParts.length - 1])!.pop()!;
      const ancestors = rawParts.slice(0, -1).flatMap((p) => compound(p)!);
      scopedRules.push({ target, ancestors, direct, props: collectProps(rule, warnings) });
      return;
    }
    // 仅支持类选择器：.xxx 或 .a.b（多类叠加）
    const m = sel.match(/^\.([A-Za-z_][\w-]*)(?:\.[A-Za-z_][\w-]*)*$/);
    if (!m) {
      warnings.push(`选择器「${rule.selector}」非类选择器，已跳过（CSS 子集限制）`);
      return;
    }
    const classes = compound(sel)!;
    const props = collectProps(rule, warnings);
    if (classes.length === 1) {
      // 类名已被声明时合并（后声明覆盖）
      classProps.set(classes[0], { ...(classProps.get(classes[0]) ?? {}), ...props });
    } else {
      // 组合规则：仅当元素同时具备全部类时生效（优先级最高，最后应用）
      comboRules.push({ classes, props });
    }
  });

  return { classProps, comboRules, scopedRules, pseudoRules, warnings };
}

/** 解析内联 style="..."（分号分隔声明） */
export function parseInlineStyle(styleText: string, warnings: string[]): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const decl of styleText.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    const mapped = mapDecl(prop, value, warnings);
    if (mapped) for (const [k, val] of mapped) mergeIrProps(props, { [k]: val });
  }
  return props;
}
