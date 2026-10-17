/**
 * Vue SFC → IR 最小转换器（P1-lite）
 *
 * 输入：单文件 Vue SFC（<template> + <style>）
 * 处理：@vue/compiler-sfc 模板 AST → IR 节点（元素归一化）+ CSS 子集 → IR props
 * 输出：合法 IrScreen（可通过 validateIr）
 *
 * 支持（静态渲染，还原度验证场景）：
 *  - 元素：div/section/header/main/ul/li → group；p/h1~h4/span → text；img → image；button → button
 *  - 属性：class（查 <style> 规则）/ 内联 style / img src（静态字符串）
 *  - 布局：flex-direction / width(px|100%) / height / padding / gap / flex:1 / margin-top:auto / justify-content / align-items
 *  - 视觉：background / border-radius / border / color / font-size / font-weight / line-height / text-align / opacity
 *
 * 暂不支持（编译期报错，不静默产出错误原生代码）：
 *  - 插值 {{ }}、v-for、v-if/v-show、:style/:class 绑定、组件、自定义标签
 *  - script 逻辑（事件绑定 @click 忽略 + 提示；R12 逻辑分仓 L1/L2/L3 属后续阶段）
 */
import { parse } from '@vue/compiler-sfc';
import type { SFCDescriptor } from '@vue/compiler-sfc';
import { NodeTypes } from '@vue/compiler-core';
import type { ElementNode, RootNode, TemplateChildNode } from '@vue/compiler-core';
import type { IrNode, IrScreen, IrProps, IrVFor } from '../ir/schema.js';
import { CssParseError, mergeIrProps, parseCss, parseInlineStyle } from './css.js';

export class VueCompileError extends Error {}

/** <script setup> 状态提取结果：ref 状态 + 赋值 setter（最小子集） */
export interface ScreenStateInfo {
  states: { name: string; init: number | string | boolean; list?: boolean }[];
  /** setter 函数名 → { target: 状态变量名, param: 形参名, expr: 无参函数体的赋值表达式 } */
  setters: Record<string, { target: string; param?: string; expr?: string }>;
}

/** R-VFOBJ-C：解析 <script setup> 顶层 `const rows = [ ... ]`（静态数组字面量）→ { name: 数组内文 }
 *  模板 `v-for="(item, i) in rows"` 引用变量名时查表展开（编译期常量，非 M4b 动态状态）；
 *  自动排除 ref([...])（`=` 后非 `[` 不匹配）、navBar 对象（非数组）与函数体（保守容忍，与 extractScreenState 一致）
 */
export function extractScreenConstArrays(script: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /const\s+(\w+)\s*=\s*(\[[\s\S]*?\])\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script))) {
    const arr = m[2];
    const inner = arr.slice(1, -1).trim();
    if (inner) out[m[1]] = inner;
  }
  return out;
}

/** 解析 <script setup> 的 JS 子集：const x = ref(init) 与 setter 函数 */
export function extractScreenState(script: string): ScreenStateInfo {
  const states: ScreenStateInfo['states'] = [];
  const setters: ScreenStateInfo['setters'] = {};
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*ref(?:<[^>]*>)?\(\s*(\d+|true|false|'[^']*'|"[^"]*")\s*\)/g)) {
    const raw = m[2];
    states.push({
      name: m[1],
      init:
        raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw.replace(/^['"]|['"]$/g, ''),
    });
  }
  // M4b 动态列表态：const books = ref([]) → init '[]'（JS 侧真数组；Swift 侧 JSON 字符串 "[]"）
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*ref(?:<[^>]*>)?\(\s*\[\]\s*\)/g)) {
    states.push({ name: m[1], init: '[]', list: true });
  }
  // M4b 扩展（comps 列表 demo）：ref(['a','b']) 带元素数组 → 动态列表
  // init 存 JSON 数组字符串（JS 单引号元素 → 双引号 JSON）：JS 侧是真数组、Swift 侧 JSONSerialization 可解码，双端一致
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*ref(?:<[^>]*>)?\(\s*\[([^\]]+)\]\s*\)/g)) {
    const json = '[' + m[2].trim().replace(/'([^']*)'/g, '"$1"') + ']';
    states.push({ name: m[1], init: json, list: true });
  }
  // 箭头函数（有参）：const f = (p) => { x.value = p } / const f = p => { ... }
  for (const m of script.matchAll(
    /const\s+(\w+)\s*=\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*))\s*=>\s*\{\s*(\w+)\.value\s*=\s*([^;{}]+)\s*;?\s*\}/g,
  )) {
    setters[m[1]] = { target: m[4], param: (m[2] ?? m[3]) };
  }
  // 具名函数（有参）：function f(p) { x.value = p }
  for (const m of script.matchAll(
    /function\s+(\w+)\s*\(\s*([A-Za-z_]\w*)\s*\)\s*\{\s*(\w+)\.value\s*=\s*([^;{}]+)\s*;?\s*\}/g,
  )) {
    setters[m[1]] = { target: m[3], param: m[2] };
  }
  // 无参表达式 setter（M1）：function f() { x.value = <expr> } / const f = () => { x.value = <expr> }
  for (const m of script.matchAll(
    /(?:function\s+(\w+)\s*\(\s*\)|const\s+(\w+)\s*=\s*\(\s*\)\s*=>)\s*\{\s*(\w+)\.value\s*=\s*([^;{}]+)\s*;?\s*\}/g,
  )) {
    setters[m[1] ?? m[2]] = { target: m[3], expr: m[4].trim() };
  }
  return { states, setters };
}

/** M7 页面级导航栏配置解析（配置参数标准）：
 *  `<script setup>` 顶层 `const navBar = { mode, title, bg, backText, immersive }`——白名单键；
 *  模式非法 / 未知键 → warning 忽略（R13 白名单铁律）；返回 null 表示未配置（默认 fixed）。
 */
export function extractScreenNavBar(script: string, warnings: string[]): IrScreen['navBar'] | null {
  const m = script.match(/const\s+navBar\s*=\s*\{([^}]*)\}/);
  if (!m) return null;
  const navBar: NonNullable<IrScreen['navBar']> = {};
  const KV = /([A-Za-z_]\w*)\s*:\s*('[^']*'|"[^"]*"|true|false|[^,}]+)/g;
  let kv: RegExpExecArray | null;
  while ((kv = KV.exec(m[1]))) {
    const k = kv[1];
    const raw = kv[2].trim();
    if (k === 'mode') {
      const v = raw.replace(/^['"]|['"]$/g, '');
      if (v === 'fixed' || v === 'transparent' || v === 'scroll') navBar.mode = v;
      else warnings.push(`navBar.mode「${v}」不在白名单（fixed/transparent/scroll），已忽略（R66）`);
    } else if (k === 'title' || k === 'backText') {
      const v = raw.replace(/^['"]|['"]$/g, '');
      if (v) navBar[k] = v;
    } else if (k === 'bg') {
      const v = raw.replace(/^['"]|['"]$/g, '');
      if (/^#[0-9a-fA-F]{6}$/.test(v)) navBar.bg = v;
      else warnings.push(`navBar.bg「${v}」须为 #rrggbb，已忽略（R66）`);
    } else if (k === 'immersive') {
      navBar.immersive = raw === 'true';
    } else {
      warnings.push(`navBar 键「${k}」不在白名单（mode/title/bg/backText/immersive），已忽略（R66）`);
    }
  }
  return navBar;
}

/* ============ M3 运行时逻辑解析（stateStore + handlers + onMounted + localStorage） ============ */

/** 剥除 TS 参数类型标注：`path: string, x: number` → `path, x`（runtime.js 宿主是纯 JS/QuickJS，R12） */
function stripTsParams(params: string): string {
  if (!params) return params;
  return params.replace(/([A-Za-z_$][\w$]*)\s*:\s*[^,=)]+/g, '$1');
}

/** 提取顶层具名函数：function name(params) { body }（配对大括号，支持嵌套） */
export function extractFunctions(script: string): { name: string; params: string; body: string; async?: boolean }[] {
  const out: { name: string; params: string; body: string; async?: boolean }[] = [];
  // R72：`async function` 必须识别并保留 async 关键字——丢掉后 body 里的 await 会让整份 runtime.js 解析失败
  const re = /(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script))) {
    const isAsync = Boolean(m[1]);
    const name = m[2];
    const params = stripTsParams(m[3].trim());
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < script.length && depth > 0) {
      if (script[i] === '{') depth += 1;
      else if (script[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ name, params, body: script.slice(bodyStart, i - 1).trim(), ...(isAsync ? { async: true } : {}) });
  }
  return out;
}

/** 提取 onMounted(() => { body }) 回调体（顶层调用，M3 生命周期）
 * M4b：括号配对扫描——回调体内含嵌套函数（.then(function(){}) 等）时
 * 正则非贪婪会在第一个内层 } 截断，必须按 {} 深度配对取完整体 */
export function extractOnMounted(script: string): string | undefined {
  // R72：允许 async 前缀（onMounted(async () => {}) / onMounted(async function () {})）
  const m = script.match(/onMounted\s*\(\s*(?:async\s+)?(?:\(\s*\)\s*=>|function\s*\(\s*\)\s*)?\s*\{/);
  if (!m) return undefined;
  const start = m.index! + m[0].length - 1; // 定位回调体起始 '{'
  let depth = 0;
  for (let i = start; i < script.length; i++) {
    const ch = script[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return script.slice(start + 1, i).trim();
    }
  }
  return undefined;
}

/** body 重写：<script setup> 的 ref 名.value → stateStore.<名>（JS 侧状态注册表） */
export function rewriteStateRefs(body: string, names: string[]): string {
  if (names.length === 0) return body;
  const re = new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\.value\\b`, 'g');
  return body.replace(re, (_all, n) => `stateStore.${n}`);
}

/** 生成 runtime.js 完整内容（M3：stateStore Proxy + handlers + onMounted + localStorage shim） */
export function generateRuntimeSource(
  states: { name: string; init: number | string | boolean; list?: boolean }[],
  handlers: { name: string; params: string; body: string; async?: boolean }[],
  onMounted: string | undefined,
  onMountedAsync = false,
): string {
  const initPairs = states.map((s) => {
    // M4b 动态列表态：list → JS 真数组（'[]' 或 '["a","b"]' JSON 字面量，Swift JSONSerialization 可解码）
    const v = s.list
      ? String(s.init)
      : s.init === '[]'
        ? '[]'
        : typeof s.init === 'number'
          ? String(s.init)
          : typeof s.init === 'boolean'
            ? (s.init ? 'true' : 'false')
            : `"${s.init.replace(/"/g, '\\"')}"`;
    return `  ${s.name}: ${v}`;
  });
  const handlerSrc = handlers
    .map((h) => `${h.async ? 'async ' : ''}function ${h.name}(${h.params}) {\n${indentBody(h.body)}\n}`)
    .join('\n');
  return `// vue-render-native · M3 状态运行时（JavaScriptCore 宿主；语义与 QuickJS 对齐，R12）
// stateStore：Swift @State 与 JS 侧状态注册表的双向同步桥（JS 改 → __setState 写回原生；Swift push 经 __fromSwift 防回环）
var __stateInit = {
${initPairs.join(',\n')}
};
var __stateStore = {};
Object.keys(__stateInit).forEach(function (k) { __stateStore[k] = __stateInit[k]; });
var __fromSwift = false;
var stateStore = new Proxy(__stateStore, {
  set: function (t, k, v) {
    t[k] = v;
    if (!__fromSwift && typeof __setState === "function") {
      // M4b 动态列表：数组/对象 → JSON 字符串写回原生（Swift 侧解码渲染）
      __setState(String(k), (typeof v === "object" && v !== null) ? JSON.stringify(v) : v);
    }
    return true;
  }
});
// fetch 桥（M4b）：JS Promise → 原生 URLSession / Bundle 资源 → 回调 resolve/reject
// 协议：bundle://<resName> 读 App 内置资源；http(s):// 走 URLSession（模拟器/真机均可）
function fetch(url) {
  return new Promise(function (resolve, reject) {
    if (typeof __nativeFetch !== "function") { reject(new Error("fetch 桥未注入")); return; }
    __nativeFetch(String(url), function (ok, data) {
      if (ok) resolve(data); else reject(new Error(String(data || "fetch failed")));
    });
  });
}
// R72 定时器宿主 shim：宿主（JavaScriptCore）未注入时用宿主桥实现，保证 Promise/await 延时可用；
// 浏览器预览器已有原生 setTimeout，此处不覆盖。
var __timerSeq = 0;
var __timers = {};
if (typeof setTimeout !== "function") {
  var setTimeout = function (fn, ms) {
    var id = ++__timerSeq;
    if (typeof __nativeSetTimeout === "function") {
      __nativeSetTimeout(id, Number(ms) || 0);
      __timers[id] = fn;
      return id;
    }
    return 0;
  };
  var clearTimeout = function (id) {
    delete __timers[id];
    if (typeof __nativeClearTimeout === "function") __nativeClearTimeout(Number(id));
  };
  // 宿主回调入口（__nativeSetTimeout 到期后由原生调用）
  var __vrnRunTimer = function (id) {
    var fn = __timers[id];
    delete __timers[id];
    if (typeof fn === "function") fn();
  };
  var setInterval = function (fn, ms) {
    var id = ++__timerSeq;
    __timers[id] = { fn: fn, ms: Number(ms) || 0, repeat: true };
    if (typeof __nativeSetInterval === "function") __nativeSetInterval(id, Number(ms) || 0);
    return id;
  };
  var clearInterval = function (id) {
    delete __timers[id];
    if (typeof __nativeClearInterval === "function") __nativeClearInterval(Number(id));
  };
  var __vrnRunInterval = function (id) {
    var t = __timers[id];
    if (t && t.repeat && typeof t.fn === "function") t.fn();
  };
}
if (typeof queueMicrotask !== "function") {
  var queueMicrotask = function (fn) {
    Promise.resolve().then(fn);
  };
}

// localStorage → 原生 UserDefaults（D7：vrn. 前缀 + 同步读写）
var localStorage = {
  getItem: function (k) { return typeof __lsGet === "function" ? __lsGet("vrn." + k) : null; },
  setItem: function (k, v) { if (typeof __lsSet === "function") __lsSet("vrn." + k, String(v)); },
  removeItem: function (k) { if (typeof __lsSet === "function") __lsSet("vrn." + k, null); }
};
// router 桥（M4b）：router.push('/path') → 原生 NavigationStack push（__routerPush 由容器注入）
var router = {
  push: function (path) {
    if (typeof __routerPush === "function") __routerPush(String(path));
  },
  back: function () {
    if (typeof __routerBack === "function") __routerBack();
  }
};
// handlers（<script setup> 函数体：ref.value → stateStore 重写）
${handlerSrc}
// onMounted（Swift onAppear → invoke("__onMounted")）
${onMounted !== undefined ? `${onMountedAsync ? 'async ' : ''}function __onMounted() {\n${indentBody(onMounted)}\n}` : ''}`;
}

/** 简单缩进（handler 体统一 2 空格缩进） */
function indentBody(body: string): string {
  return body
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');
}

/**
 * JS 子集表达式 → Swift 兼容表达式：
 *  - 状态引用 `x.value` → `x`（@State 变量）
 *  - 单引号字符串 → 双引号（Swift 语法）
 *  - 白名单字符校验（数字/状态名/运算符/括号/比较/逻辑），越界返回 null
 */
/** R68 续：条件表达式归一化——JS 严格相等/不等 → Swift 相等/不等（Swift `===` 仅引用比较） */
function normCond(s: string): string {
  return s.replace(/===/g, '==').replace(/!==/g, '!=');
}

/** 元素内联文本提取（button 内嵌 span 等降级兜底：递归收集 TEXT 内容） */
function elementInnerText(node: TemplateChildNode): string {
  if (node.type === NodeTypes.TEXT) {
    return (node as { content?: string }).content ?? '';
  }
  if (node.type === NodeTypes.ELEMENT || node.type === NodeTypes.IF_BRANCH) {
    const kids = (node as { children?: TemplateChildNode[] }).children ?? [];
    return kids.map(elementInnerText).join('');
  }
  return '';
}

export function swiftExpr(exp: string): string | null {
  let s = exp.replace(/(\w+)\.value/g, '$1').trim();
  s = s.replace(/'([^']*)'/g, '"$1"');
  // R68 续：JS 严格相等/不等 → Swift 相等/不等（Swift `===` 是引用比较，Int/String 均不可用）
  s = s.replace(/===/g, '==').replace(/!==/g, '!=');
  if (!/^[\w\s()+\-*/%<>=!&|.'"]+$/.test(s)) return null;
  // 进一步白名单：允许标识符、数字、空白、运算符括号；字符串字面量仅限成对引号内容
  if (!/^[\w\s()+\-*/%<>=!&|"]+$/.test(s.replace(/"([^"]*)"/g, '""'))) return null;
  return s;
}

/** @click="fn(arg)" → 若 fn 是已提取的 setter，内联为状态赋值 { var, value, kind }（M1 扩展无参表达式 setter）
 *  M2：直接赋值表达式 `selected = item` / `selected = i`（列表选中）同样内联 */
export function resolveSetCall(
  handler: string,
  state: ScreenStateInfo,
): { var: string; value: number | string; kind: 'literal' | 'expr' } | null {
  const t = handler.trim();
  // M2 直接赋值：目标必须是已声明状态
  const assign = t.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
  if (assign && state.states.some((s) => s.name === assign[1])) {
    const rhs = assign[2].trim();
    if (/^-?\d+$/.test(rhs)) return { var: assign[1], value: Number(rhs), kind: 'literal' };
    if (/^'.*'$|^".*"$/.test(rhs)) return { var: assign[1], value: rhs.slice(1, -1), kind: 'literal' };
    const expr = swiftExpr(rhs);
    if (expr !== null) return { var: assign[1], value: expr, kind: 'expr' };
    return null;
  }
  const m = t.match(/^(\w+)\(([^)]*)\)$/);
  if (!m) return null;
  const setter = state.setters[m[1]];
  if (!setter) return null;
  const arg = m[2].trim();
  if (arg) {
    if (/^-?\d+$/.test(arg)) return { var: setter.target, value: Number(arg), kind: 'literal' };
    if (/^'.*'$|^".*"$/.test(arg)) return { var: setter.target, value: arg.slice(1, -1), kind: 'literal' };
    const expr = swiftExpr(arg);
    if (expr === null) return null;
    return { var: setter.target, value: expr, kind: 'expr' }; // 表达式（Swift 兼容，如 tabIndex + 1 / count）
  }
  if (setter.expr !== undefined) {
    const expr = swiftExpr(setter.expr);
    if (expr === null) return null;
    return { var: setter.target, value: expr, kind: 'expr' }; // 无参调用 → 函数体表达式（如 count + 1）
  }
  return { var: setter.target, value: setter.param ?? '', kind: 'literal' }; // 无参调用有参 setter：沿用形参名
}

/** 解析 :class 表达式（M2 白名单）→ { cls, when }
 *  ① 对象字面量 { 'cls': 条件 }（条件可为布尔组合 a&&b / a||b）
 *  ② 三元 cond ? 'a' : 'b'（真分支生效，假分支忽略 + warning）
 */
function parseClassObject(
  exp: unknown,
  warnings: string[],
): { cls: string; when: string } | null {
  const s = (exp as { content?: string } | undefined)?.content?.trim();
  if (!s) {
    warnings.push(`:class 表达式为空，已忽略`);
    return null;
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1).trim();
    // 多键对象：原贪婪正则会让「首键条件」吞掉后续键（'a': on, 'b': !on → when="on, 'b': !on"），
    // 生成非法 Swift；这里按顶层逗号拆键，仅取首键条件（多键对象多键样式后续引擎再扩）
    const keys = splitTopLevel(inner);
    const firstCond = keys[0]?.trim() ?? '';
    const m = firstCond.match(/^['"]?([^'":]+?)['"]?\s*:\s*(.+)$/);
    if (!m) {
      warnings.push(`:class 对象格式仅支持 { 'cls': 条件 }（取首项），已忽略`);
      return null;
    }
    if (keys.length > 1) {
      warnings.push(`:class 多键对象「${s}」仅应用首键「${m[1].trim()}」，其余键已忽略（M2 子集）`);
    }
    return { cls: m[1].trim(), when: normCond(m[2].trim()) };
  }
  // 三元：cond ? 'a' : 'b' → 真分支；假分支降级忽略（M2 白名单，完整双向随表达式引擎）
  const t = s.match(/^(.+?)\s*\?\s*['"]?([^'"]+?)['"]?\s*:\s*['"]?([^'"]+?)['"]?$/);
  if (t) {
    warnings.push(`:class 三元 ${s}：假分支「${t[3].trim()}」暂降级忽略（仅真分支生效，M2）`);
    return { cls: t[2].trim(), when: normCond(t[1].trim()) };
  }
  warnings.push(`:class 仅支持对象字面量或三元表达式（M2），已忽略：${s.slice(0, 40)}`);
  return null;
}

/** M2 :style 动态白名单：{ color: 状态名, fontSize: '16px'|状态名 } → 静态/动态修饰符 props；其余键忽略 */
function parseDynamicStyle(
  exp: unknown,
  warnings: string[],
  state?: ScreenStateInfo,
): Record<string, unknown> | null {
  const s = (exp as { content?: string } | undefined)?.content?.trim();
  if (!s || !s.startsWith('{') || !s.endsWith('}')) {
    warnings.push(`:style 动态仅支持对象字面量 { color: state, fontSize: '16px' }（M2），已忽略：${String(s ?? exp).slice(0, 40)}`);
    return null;
  }
  const out: Record<string, unknown> = {};
  const inner = s.slice(1, -1);
  // 粗分键值对（不处理嵌套/逗号在字符串内——M2 白名单足够）
  for (const kv of inner.split(',')) {
    const m = kv.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    const isState = /^[A-Za-z_]\w*$/.test(val) && state?.states.some((st) => st.name === val);
    if (key === 'color' && isState) {
      out.colorDynamic = val;
    } else if (key === 'fontSize') {
      const px = val.match(/^(\d+(?:\.\d+)?)px$/);
      if (px) {
        out.fontSize = Number(px[1]);
      } else if (isState) {
        out.fontSizeDynamic = val;
      } else {
        warnings.push(`:style fontSize 仅支持 'NNpx' 字面量或状态引用（M2），已忽略：${val}`);
      }
    } else if (key === 'marginTop') {
      const px = val.match(/^(\d+(?:\.\d+)?)px$/);
      if (px) out.marginTop = Number(px[1]);
      else if (isState) warnings.push(`:style marginTop 动态状态暂不支持（M2 仅 color/fontSize），已忽略：${val}`);
      else warnings.push(`:style marginTop 仅支持 'NNpx'（M2），已忽略：${val}`);
    } else {
      warnings.push(`:style 键「${key}」暂不支持（M2 白名单：color/fontSize/marginTop），已忽略`);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** M2 v-for 解析：`(item, i) in [1,2,3]` / `item in ['a','b']` / `item in [{k:v},…]`
 *  → { list, itemKey, indexKey }；仅静态数组字面量（R-VFOBJ：含对象字面量元素） */
function parseVFor(exp: string, warnings: string[], constArrays?: Record<string, string>): IrVFor | null {
  const t = exp.trim();
  // 注意 [\s\S]+：模板内多行数组（v-for="(item, i) in [\n {…},\n …]"）必须跨行匹配
  const m = t.match(/^(?:\(([^)]+)\)|([A-Za-z_]\w*))\s+in\s+([\s\S]+)$/);
  if (!m) {
    warnings.push(`v-for 语法仅支持 (item, i) in [...] / item in [...]（M2），无法解析：${t.slice(0, 40)}`);
    return null;
  }
  const vars = m[1] ? m[1].split(',').map((s) => s.trim()) : [m[2]];
  const itemKey = vars[0];
  const indexKey = vars[1];
  const body = m[3].trim();
  // M4b 动态列表：in <stateName>（stateStore 数组；Swift 侧 JSON 字符串解码渲染）
  // R-VFOBJ-C：引用 script 顶层 const 数组（const rows = [...]）→ 编译期展开，优先于动态状态判定
  if (/^[A-Za-z_]\w*$/.test(body)) {
    if (constArrays && body in constArrays) {
      const inner = constArrays[body];
      if (!inner) {
        warnings.push(`v-for 常量数组「${body}」为空，已忽略`);
        return null;
      }
      // R-VFOBJ-D：记录来源常量名（Swift 侧 struct 属性名复用，数据与布局分离）
      const vf = parseVForArrayInner(inner, itemKey, indexKey, warnings);
      if (vf) vf.srcName = body;
      return vf;
    }
    return { listState: body, itemKey, indexKey };
  }
  if (!body.startsWith('[') || !body.endsWith(']')) {
    warnings.push(`v-for 仅支持静态数组字面量 / 状态名 / 常量数组名（M2/M4b/R-VFOBJ-C：如 in [1,2,3] / in books / in rows）：${body.slice(0, 40)}`);
    return null;
  }
  return parseVForArrayInner(body.slice(1, -1).trim(), itemKey, indexKey, warnings);
}

/** 数组内文（无外层 [ ]）→ IrVFor.list：对象字面量数组或数字/字符串数组（R-VFOBJ） */
function parseVForArrayInner(
  inner: string,
  itemKey: string,
  indexKey: string | undefined,
  warnings: string[],
): IrVFor | null {
  if (!inner) return null;
  // R-VFOBJ：对象字面量数组（[{k:v},…]）——按括号深度分割顶层逗号，逐项解析
  if (inner.trimStart().startsWith('{')) {
    const parts = splitTopLevel(inner);
    const list: Record<string, string | number>[] = [];
    for (const raw of parts) {
      const obj = parseObjectLiteral(raw);
      if (!obj) {
        warnings.push(`v-for 对象数组元素仅支持 {key: 字面量, …}（R-VFOBJ），已忽略：${raw.slice(0, 40)}`);
        return null;
      }
      list.push(obj);
    }
    if (list.length === 0) return null;
    return { list, itemKey, indexKey };
  }
  const list: (number | string)[] = [];
  for (const raw of inner.split(',')) {
    const lv = literalValue(raw.trim());
    if (lv === undefined || typeof lv === 'boolean') {
      warnings.push(`v-for 数组元素仅支持数字/字符串字面量（M2），已忽略：${raw.trim()}`);
      return null;
    }
    list.push(lv);
  }
  if (list.length === 0) return null;
  return { list, itemKey, indexKey };
}

/** 按顶层（{} [] "" 深度 0）逗号分割 */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** 对象字面量 {k: v, …} → Record（值限 string/number 字面量） */
function parseObjectLiteral(s: string): Record<string, string | number> | null {
  const m = s.trim().match(/^\{(.*)\}$/s);
  if (!m) return null;
  const obj: Record<string, string | number> = {};
  const parts = splitTopLevel(m[1]);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const ci = trimmed.indexOf(':');
    if (ci <= 0) return null;
    const key = trimmed.slice(0, ci).trim().replace(/^['"]|['"]$/g, '');
    const valRaw = trimmed.slice(ci + 1).trim();
    const lit = literalValue(valRaw);
    if (lit === undefined || typeof lit === 'boolean') return null;
    obj[key] = lit;
  }
  return Object.keys(obj).length > 0 ? obj : null;
}

/** 元素归一化：HTML 标签 → IR 节点（R13 元素归一化表） */
const TAG_MAP: Record<string, { type: string; defaultProps?: IrProps }> = {
  div: { type: 'group' },
  section: { type: 'group' },
  header: { type: 'group' },
  main: { type: 'group' },
  nav: { type: 'group' },
  footer: { type: 'group' },
  article: { type: 'group' },
  ul: { type: 'group' },
  li: { type: 'group' },
  p: { type: 'text', defaultProps: { fontSize: 14 } },
  span: { type: 'text', defaultProps: { fontSize: 14 } },
  h1: { type: 'text', defaultProps: { fontSize: 24, fontWeight: 'bold' } },
  h2: { type: 'text', defaultProps: { fontSize: 20, fontWeight: 'bold' } },
  h3: { type: 'text', defaultProps: { fontSize: 17, fontWeight: 'medium' } },
  h4: { type: 'text', defaultProps: { fontSize: 15, fontWeight: 'medium' } },
  img: { type: 'image' },
  button: { type: 'button' },
  input: { type: 'input' },
  textarea: { type: 'input' },
  hr: { type: 'divider' },
};

export interface Vue2IrOptions {
  screenId?: string;
  title?: string;
  /** 设计稿高度（默认 640，R16 适配基准） */
  height?: number;
  /** 组件表：PascalCase 组件名 → SFC 源码（components/*.vue）。自定义标签查表后生成 component 节点（R41） */
  components?: Record<string, string>;
}

export interface Vue2IrResult {
  screen: IrScreen;
  warnings: string[];
  /** <script setup> 的逻辑源码（JS 子集），打包为运行时 runtime.js */
  runtime?: string;
  /** R41 组件树：每个组件 → 独立 Swift View 的 IR 树（name 与 <Name>View.swift 对应） */
  components?: { name: string; ui: IrNode }[];
}

/** R41 组件名 → 组件根剥离出的位置 props（flex/width/marginTop）；vueToIr 每次调用重置 */
let compPosition = new Map<string, Record<string, unknown>>();

/** R-VFOBJ-C：script 顶层 const 数组表（const rows = [...] → rows: 数组内文）；vueToIr 每次调用重置 */
let vforConsts: Record<string, string> = {};

export function vueToIr(source: string, opts: Vue2IrOptions = {}): Vue2IrResult {
  compPosition = new Map();
  vforConsts = {};
  const warnings: string[] = [];
  const { descriptor, errors } = parse(source, { filename: 'Screen.vue' });
  if (errors.length > 0) {
    throw new VueCompileError(`Vue SFC 解析失败：${errors.map((e) => e.message).join('; ')}`);
  }
  if (!descriptor.template) {
    throw new VueCompileError('缺少 <template> 块');
  }

  // 1) CSS 子集 → 类规则表
  const cssWarnings: string[] = [];
  const classProps = new Map<string, Record<string, unknown>>();
  let comboRules: ReturnType<typeof parseCss>['comboRules'] = [];
  let scopedRules: ReturnType<typeof parseCss>['scopedRules'] = [];
  let pseudoRules: ReturnType<typeof parseCss>['pseudoRules'] = [];
  for (const styleBlock of descriptor.styles) {
    let r: ReturnType<typeof parseCss>;
    try {
      r = parseCss(styleBlock.content, cssWarnings);
    } catch (e) {
      if (e instanceof CssParseError) throw new VueCompileError(`<style> 块解析失败：${e.message}`);
      throw e;
    }
    for (const [cls, props] of r.classProps) {
      classProps.set(cls, { ...(classProps.get(cls) ?? {}), ...props });
    }
    comboRules = comboRules.concat(r.comboRules);
    scopedRules = scopedRules.concat(r.scopedRules);
    pseudoRules = pseudoRules.concat(r.pseudoRules);
  }

  // 1.5) 组件表（R41 独立原生 View）：components/*.vue → { name, template AST, 组件样式规则, defineProps 名 }
  const compTable: CompEntry[] = [];
  for (const [name, src] of Object.entries(opts.components ?? {})) {
    const c = parse(src, { filename: `${name}.vue` });
    if (c.errors.length > 0) {
      throw new VueCompileError(`组件 ${name} 解析失败：${c.errors.map((e) => e.message).join('; ')}`);
    }
    if (!c.descriptor.template) {
      throw new VueCompileError(`组件 ${name} 缺少 <template> 块`);
    }
    const cp = new Map<string, Record<string, unknown>>();
    let cc: ReturnType<typeof parseCss>['comboRules'] = [];
    let cs: ReturnType<typeof parseCss>['scopedRules'] = [];
    let cps: ReturnType<typeof parseCss>['pseudoRules'] = [];
    for (const styleBlock of c.descriptor.styles) {
      let r: ReturnType<typeof parseCss>;
      try {
        r = parseCss(styleBlock.content, cssWarnings);
      } catch (e) {
        if (e instanceof CssParseError) throw new VueCompileError(`组件 ${name} <style> 块解析失败：${e.message}`);
        throw e;
      }
      for (const [cls, props] of r.classProps) cp.set(cls, { ...(cp.get(cls) ?? {}), ...props });
      cc = cc.concat(r.comboRules);
      cs = cs.concat(r.scopedRules);
      cps = cps.concat(r.pseudoRules);
    }
    const script = c.descriptor.scriptSetup ?? c.descriptor.script;
    compTable.push({
      name,
      descriptor: c.descriptor,
      classProps: cp,
      comboRules: cc,
      scopedRules: cs,
      pseudoRules: cps,
      propNames: script ? extractPropNames(script.content) : new Set(),
      refs: new Set(),
    });
  }
  warnings.push(...cssWarnings);

  // 2) 模板 AST → IR（state 供 :class 条件 / @click 状态事件引用）
  const ast = descriptor.template.ast as RootNode;

  // 5) <script setup> → 状态提取 + M3 运行时生成（stateStore/handlers/onMounted/localStorage shim）
  let runtime: string | undefined;
  let handlers: { name: string; params: string; body: string }[] | undefined;
  let navBarConfig: IrScreen['navBar'] | null = null;
  let onMountedBody: string | undefined;
  let onMountedAsync = false;
  let stateInfo: ScreenStateInfo | undefined;
  const script = descriptor.scriptSetup ?? descriptor.script;
  if (script && script.content.trim()) {
    const src = script.content;
    stateInfo = extractScreenState(src);
    const fns = extractFunctions(src);
    // M1 已落地的 setter 函数（x.value = <expr>）升级为完整 handler：body 原样进运行时（含 localStorage/状态读写）
    handlers = fns.map((f) => ({
      name: f.name,
      params: f.params,
      body: rewriteStateRefs(f.body, (stateInfo?.states ?? []).map((s) => s.name)),
      ...(f.async ? { async: true } : {}),
    }));
    // R15 不静默：函数体疑似 TS 类型标注（只剥了形参侧）→ JS 运行时整段解析失败，必须提前预警
    for (const h of handlers) {
      if (/\b(const|let)\s+[A-Za-z_$][\w$]*\s*:/.test(h.body)) {
        warnings.push(`handler「${h.name}」函数体疑似含 TS 类型标注（如 const x: number = 1），runtime.js 将解析失败——请移除类型标注（R13 仅支持 JS 子集）`);
      }
    }
    // R74：状态名撞原生保留成员（SwiftUI `body`、Kotlin 关键字等）会导致生成代码编译失败 → 必须提前警告
    {
      const RESERVED = ['body', 'self', 'init', 'class', 'object', 'fun', 'val', 'var', 'when', 'is', 'in'];
      for (const st of stateInfo?.states ?? []) {
        if (RESERVED.includes(st.name)) {
          warnings.push(
            `状态名「${st.name}」与原生保留成员冲突（SwiftUI body / Kotlin 关键字）——请改名（如 ${st.name}Text / ${st.name}Value），否则生成的 iOS/Android 代码无法编译`,
          );
        }
      }
    }
    navBarConfig = extractScreenNavBar(src, warnings);
    vforConsts = extractScreenConstArrays(src);
    onMountedBody = extractOnMounted(src);
    if (onMountedBody !== undefined) {
      // R72：回调体内出现顶层 await → onMounted 视为 async（生成 async function，await 才合法）
      onMountedAsync = /(^|[^\w$.])await\s/.test(onMountedBody) || /onMounted\s*\(\s*async\b/.test(src);
      onMountedBody = rewriteStateRefs(onMountedBody, (stateInfo?.states ?? []).map((s) => s.name));
    }
    if (handlers.length > 0 || onMountedBody !== undefined) {
      runtime = generateRuntimeSource(stateInfo?.states ?? [], handlers, onMountedBody, onMountedAsync);
    }
  }

  // 3.5) 组件树（R41）：每个组件 → 独立 Swift View 的 IR 树（组件样式独立作用域；
  //      {{ prop }} → text ref；组件根布局 props（flex/width/marginTop）剥离并交使用点）。
  //      必须先于页面 walk 构建：使用点 component 节点需要组件根剥离出的位置 props。
  const components: { name: string; ui: IrNode }[] = compTable.map((c) => {
    const tree = buildComponentTree(c, warnings);
    c.refs = collectRefs(tree.ui);
    compPosition.set(c.name, tree.position);
    return { name: c.name, ui: tree.ui };
  });

  const children = ast.children.flatMap((c) => walk(c, classProps, comboRules, scopedRules, pseudoRules, warnings, stateInfo, compTable));
  let pageRootBg: string | undefined;

  // 3) 组装 screen：root（width fill + height 基准）包一层 group（承载根元素布局 props）
  // M4b：模板根容器（.page 等）的 background 提升到 root——root ZStack 背景层必须铺满全屏，
  // 留在子节点只能盖内容高（TabView/短内容场景下半透白）；子节点删除背景避免双重渲染。
  // 多根模板守卫：仅当首个根（页面主容器）持有背景才提升——否则「页面+浮层」写法会把浮层色铺满整屏
  const pageRoot = children.length > 0 ? children[0] : undefined;
  if (pageRoot !== undefined && pageRoot.props?.background !== undefined) {
    const bg = pageRoot.props.background as string;
    delete pageRoot.props.background;
    pageRootBg = bg;
  }
  const ui: IrNode = {
    type: 'root',
    props: { width: 'fill', height: opts.height ?? 640, ...(pageRootBg ? { background: pageRootBg } : {}) },
    children: [
      {
        type: 'group',
        props: { width: 'fill', height: 'fill' },
        children,
      },
    ],
  };

  // R15 不静默：@click 引用的 handler 未提取为 runtime 函数（箭头函数/Options API/超子集）
  // → 原生端 invoke 将 ReferenceError 且被吞掉，编译期必须预警
  const handlerNames = new Set((handlers ?? []).map((h) => h.name));
  const checkClickHandlers = (n: IrNode): void => {
    const oc = n.props?.onClick;
    if (typeof oc === 'string') {
      const name = oc.replace(/\(\)$/, '');
      if (!handlerNames.has(name) && !/^(router\.|Router\.)/.test(name)) {
        warnings.push(`@click「${oc}」引用的函数未提取为 runtime handler（仅支持 function 声明；箭头函数/Options API 暂不支持），原生端点击将无响应`);
      }
    }
    for (const c of n.children ?? []) checkClickHandlers(c);
  };
  checkClickHandlers(ui);

  // 5) <script setup> 逻辑源码 → 运行时 JS（R12：事件逻辑由原生 JS 引擎执行）
  //    仅支持 JS 子集（无 TS 类型标注、无 import）；超出即编译期警告（后续阶段扩展）
  return {
    screen: {
      id: opts.screenId ?? 'vue-screen',
      title: opts.title ?? 'Vue Screen',
      runtime: 'native',
      width: 360,
      height: opts.height ?? 640,
      ...(stateInfo && stateInfo.states.length > 0 ? { state: stateInfo.states } : {}),
      ...(handlers && handlers.length > 0 ? { handlers } : {}),
      ...(onMountedBody !== undefined ? { onMounted: onMountedBody, ...(onMountedAsync ? { onMountedAsync: true } : {}) } : {}),
      ...(navBarConfig !== null ? { navBar: navBarConfig } : {}),
      ui,
    },
    ...(components.length > 0 ? { components } : {}),
    warnings,
    ...(runtime !== undefined ? { runtime } : {}),
  };
}

/* ============ 模板 AST 遍历 ============ */

function walk(
  node: TemplateChildNode,
  classProps: Map<string, Record<string, unknown>>,
  comboRules: ReturnType<typeof parseCss>['comboRules'],
  scopedRules: ReturnType<typeof parseCss>['scopedRules'],
  pseudoRules: ReturnType<typeof parseCss>['pseudoRules'],
  warnings: string[],
  state?: ScreenStateInfo,
  compTable: CompEntry[] = [],
  propRefs?: Set<string>,
  loopScope: LoopScope[] = [],
  ancestorClasses: string[] = [],
): IrNode[] {
  switch (node.type) {
    case NodeTypes.TEXT: {
      const text = node.content.trim();
      return text ? [{ type: 'text', props: { text } }] : [];
    }
    case NodeTypes.COMMENT:
      return [];
    case NodeTypes.INTERPOLATION: {
      const name = textOf(node.content).trim();
      // 组件树模式（propRefs 传入=非空）：{{ 任意名 }} → text ref（Swift Text(prop)，
      // prop 名由组件树实际引用自动收集，不强制 defineProps 声明）
      if (propRefs) {
        // R78 续（G13）：组件内 {{ obj.field }} → 组件 prop 是字符串（JSON）→ 运行时取值
        const cf = name.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
        if (cf && propRefs.has(cf[1])) {
          return [{ type: 'text', props: { fieldOf: { obj: cf[1], field: cf[2] } } }];
        }
        return [{ type: 'text', props: { ref: name } }];
      }
      // M2 模板内三元（D1 小范围）：cond ? 'a' : 'b' → Swift 三元字符串表达式（Text(expr)）
      const tri = parseTernaryExpr(name);
      if (tri) return [{ type: 'text', props: { bindExpr: tri } }];
      // M2：v-for 循环变量（item/index）优先于状态表
      const loopVar = loopScope.find((l) => l.itemKey === name || l.indexKey === name);
      if (loopVar) {
        // M4b 动态列表项属性访问 {{ item.field }} → dynField（Swift 侧 [String: Any] 字段取值）
        const dot = name.split('.');
        if (dot.length === 2 && dot[0] === loopVar.itemKey && /^\w+$/.test(dot[1])) {
          return [{ type: 'text', props: { dynField: { var: dot[0], field: dot[1] } } }];
        }
        return [{ type: 'text', bind: { key: name } }];
      }
      // M1：页面级 {{ state }} → text bind（@State 引用；仅支持纯状态名，表达式随 M2）
      if (/^\w+$/.test(name)) {
        if (state && state.states.some((s) => s.name === name)) {
          return [{ type: 'text', bind: { key: name } }];
        }
        throw new VueCompileError(
          `插值 {{ ${name} }}：未在 <script setup> 中声明为 ref 状态（M1 白名单：仅支持已声明状态）`,
        );
      }
      // R78 对象字段插值 {{ obj.field }}：obj 是页面状态 → 运行时 JSON 取值；否则明确警告 + 空文本降级
      {
        const fld = name.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
        if (fld) {
          const isState = (state?.states ?? []).some((st) => st.name === fld[1]);
          if (isState) return [{ type: 'text', props: { fieldOf: { obj: fld[1], field: fld[2] } } }];
          warnings.push(
            `插值 {{ ${name} }} 的对象「${fld[1]}」不是页面状态（如 Pinia store）→ 已生成占位文本；请把该字段提升为 ref（R78）`,
          );
          return [{ type: 'text', props: { text: ' ' } }];
        }
      }
      throw new VueCompileError(
        `插值表达式 {{ ${name} }} 暂不支持（M1 仅支持纯状态名；三元/比较表达式 M2 白名单）`,
      );
    }
    case NodeTypes.ELEMENT:
      return [walkElement(node, classProps, comboRules, scopedRules, pseudoRules, warnings, state, compTable, propRefs, loopScope, ancestorClasses)];
    default:
      warnings.push(`模板节点类型 ${node.type} 已忽略`);
      return [];
  }
}

/** M2 模板内三元插值：`cond ? 'a' : 'b'` → Swift 三元字符串表达式；cond 需过 swiftExpr 白名单 */
function parseTernaryExpr(exp: string): string | null {
  const t = exp.trim();
  const m = t.match(/^(.+?)\s*\?\s*'([^']+)'\s*:\s*'([^']+)'$/);
  if (!m) return null;
  const cond = swiftExpr(m[1]);
  if (cond === null) return null;
  return `${cond} ? "${m[2]}" : "${m[3]}"`;
}

/** M2 v-for 循环作用域（v-for 项模板内 item/index 变量可见） */
interface LoopScope {
  itemKey: string;
  indexKey?: string;
}

function textOf(n: unknown): string {
  return (n as { content?: string })?.content ?? '';
}

/** R41 组件表条目：PascalCase 名 + 组件 SFC 产物（template AST / 组件样式规则 / defineProps 名 / 树内引用 prop） */
interface CompEntry {
  name: string;
  descriptor: SFCDescriptor;
  classProps: Map<string, Record<string, unknown>>;
  comboRules: ReturnType<typeof parseCss>['comboRules'];
  scopedRules: ReturnType<typeof parseCss>['scopedRules'];
  pseudoRules: ReturnType<typeof parseCss>['pseudoRules'];
  propNames: Set<string>;
  /** 组件树实际引用的 prop（text ref 名；隐式声明，不强制 defineProps）——组件树生成后填充 */
  refs: Set<string>;
}

/** kebab-case / 任意大小写标签 → PascalCase（组件表键），如 stat-card → StatCard */
function toPascalCase(tag: string): string {
  return tag
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

/** 字面量绑定值：'str' / "str" → string；数字 → number；true/false → boolean；非常量表达式 → undefined */
function literalValue(expr: string): string | number | boolean | undefined {
  const t = expr.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return undefined;
}

/** 组件 <script setup> 的 defineProps 类型声明 → prop 名集合：defineProps<{ a: string; b: number }>() */
function extractPropNames(scriptContent: string): Set<string> {
  const names = new Set<string>();
  const m = scriptContent.match(/defineProps\s*<\{([^}]+)\}>/);
  if (!m) return names;
  for (const decl of m[1].split(';')) {
    const mm = decl.match(/([A-Za-z_$][\w$]*)\s*:/);
    if (mm) names.add(mm[1]);
  }
  return names;
}

/** 收集组件树中所有 text ref → prop 名（组件实际引用的 prop） */
function collectRefs(node: IrNode, out: Set<string> = new Set()): Set<string> {
  if (node.type === 'text' && node.props?.ref !== undefined) out.add(node.props.ref);
  for (const c of node.children ?? []) collectRefs(c, out);
  return out;
}


function componentUseNode(
  useNode: ElementNode,
  comp: CompEntry,
  rootPosition: Record<string, unknown>,
  warnings: string[],
): IrNode {
  const attrs: Record<string, string | number | boolean | { expr: string }> = {};
  for (const p of useNode.props) {
    if (p.type === NodeTypes.ATTRIBUTE && p.value) {
      attrs[p.name] = p.value.content.trim();
    } else if (
      p.type === NodeTypes.DIRECTIVE &&
      p.name === 'bind' &&
      p.arg &&
      p.arg.type === NodeTypes.SIMPLE_EXPRESSION &&
      p.exp &&
      p.exp.type === NodeTypes.SIMPLE_EXPRESSION
    ) {
      // :key 是 v-for 渲染键，不是组件 prop（ForEach id:\.self 自带）
      if (p.arg.content === 'key') continue;
      const lit = literalValue(p.exp.content);
      if (lit !== undefined) attrs[p.arg.content] = lit;
      // R-VFOBJ：循环变量字段表达式（:name="item.name"）→ 保留表达式（Swift 侧 item["name"] ?? ""）
      else if (/^[A-Za-z_]\w*\.[A-Za-z_]\w*$/.test(p.exp.content.trim())) {
        attrs[p.arg.content] = { expr: p.exp.content.trim() };
      } else warnings.push(`组件 ${comp.name} prop :${p.arg.content} 绑定「${p.exp.content.trim()}」非常量，暂不支持，已忽略`);
    }
  }

  // R-VFOBJ：组件使用点 @click 事件 → props.onClick（v-for 循环字段在 Swift 侧展开）
  let onClick: string | undefined;
  for (const p of useNode.props) {
    if (
      p.type === NodeTypes.DIRECTIVE &&
      p.name === 'on' &&
      p.arg &&
      p.arg.type === NodeTypes.SIMPLE_EXPRESSION &&
      p.exp &&
      p.exp.type === NodeTypes.SIMPLE_EXPRESSION &&
      p.arg.content === 'click'
    ) {
      onClick = /^[A-Za-z_$][\w$]*\(\)$/.test(p.exp.content) ? p.exp.content.slice(0, -2) : p.exp.content;
    }
  }

  // 脚本逻辑检查（纯展示组件）——剥注释后判空（defineProps/import 已移除；注释不构成逻辑）
  const script = comp.descriptor.scriptSetup ?? comp.descriptor.script;
  if (script && script.content.trim()) {
    const body = script.content
      .replace(/import\s+[^;]*;/g, '')
      .replace(/defineProps\s*<[^>]*>\s*\(\)\s*;?/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .trim();
    if (body) {
      warnings.push(`组件 ${comp.name} 的 <script setup> 含逻辑代码，暂不支持（纯展示组件），已忽略`);
    }
  }

  // prop 校验：attrs 键必须 ∈ defineProps（显式声明）；defineProps ∪ 组件树引用 必须全部传入
  // R15 不静默：未声明的 attr（class/style/拼写错误）真正从 attrs 移除——保留会生成非法原生参数（编译失败）。
  // 例外：组件完全没有 defineProps（propNames 为空）时无法区分「声明缺失」与「旧样例风格」，仅告警不移除。
  for (const k of Object.keys(attrs)) {
    if (!comp.propNames.has(k)) {
      warnings.push(`组件 ${comp.name} 未声明 prop「${k}」，已移除（defineProps 缺失）`);
      if (comp.propNames.size > 0) delete attrs[k];
    }
  }
  const allProps = new Set([...comp.propNames, ...comp.refs]);
  for (const pn of allProps) {
    if (!(pn in attrs)) warnings.push(`组件 ${comp.name} prop「${pn}」未传入，Swift 编译会报缺参`);
  }

  return { type: 'component', props: { name: comp.name, attrs, ...(onClick ? { onClick } : {}), ...rootPosition } };
}

/**
 * R41 组件树：组件 template → 独立 Swift View 的 IR 树。
 * - 组件样式独立作用域（不合并页面全局）
 * - {{ prop }}（prop ∈ defineProps）→ text 节点 ref（Swift View 内 Text(prop)）
 * - 组件根布局 props（flex/width/marginTop*）剥离 → 返回 position 供使用点承载
 * - 组件内再引用组件（嵌套）→ R13 报错（本轮不支持嵌套）
 * 注意：parse 对相同 source 返回共享 AST → 深拷贝后再遍历。
 */
function buildComponentTree(
  comp: CompEntry,
  warnings: string[],
): { ui: IrNode; position: Record<string, unknown> } {
  const ast = structuredClone(comp.descriptor.template!.ast) as RootNode;
  const roots = (ast.children as TemplateChildNode[]).filter(
    (c) => c.type === NodeTypes.ELEMENT || c.type === NodeTypes.TEXT,
  );
  if (roots.length !== 1 || roots[0].type !== NodeTypes.ELEMENT) {
    throw new VueCompileError(`组件 ${comp.name} 需单根元素（<template> 内仅一个根元素）`);
  }
  const tree = walkElement(
    roots[0] as ElementNode,
    comp.classProps,
    comp.comboRules,
    comp.scopedRules,
    comp.pseudoRules,
    warnings,
    undefined,
    [], // 组件内不支持嵌套组件
    comp.propNames,
  );
  // 组件根布局 props 剥离 → 使用点
  const POSITION_KEYS = ['flex', 'width', 'marginTop', 'marginTopAuto', 'marginLeftAuto'] as const;
  const position: Record<string, unknown> = {};
  const rootProps = tree.props ?? {};
  for (const k of POSITION_KEYS) {
    if (rootProps[k] !== undefined) {
      position[k] = rootProps[k];
      delete rootProps[k];
    }
  }
  return { ui: tree, position };
}

function walkElement(
  node: ElementNode,
  classProps: Map<string, Record<string, unknown>>,
  comboRules: ReturnType<typeof parseCss>['comboRules'],
  scopedRules: ReturnType<typeof parseCss>['scopedRules'],
  pseudoRules: ReturnType<typeof parseCss>['pseudoRules'],
  warnings: string[],
  state?: ScreenStateInfo,
  compTable: CompEntry[] = [],
  propRefs?: Set<string>,
  loopScope: LoopScope[] = [],
  ancestorClasses: string[] = [],
): IrNode {
  let elementClasses: string[] = []; // M5 后代选择器：本元素 class 清单（子节点递归传祖先链）
  // M2 v-for：任意元素（含 <template>）带 v-for → 包一层 for 节点，自身去指令后作项模板
  const forDir = node.props.find((p) => p.type === NodeTypes.DIRECTIVE && p.name === 'for');
  if (forDir) {
    // AttributeNode 无 exp；DirectiveNode 才有（find 命中 DIRECTIVE 但 TS 不窄化 union）
    const exp = 'exp' in forDir ? forDir.exp : undefined;
    const vf = parseVFor(
      exp && exp.type === NodeTypes.SIMPLE_EXPRESSION ? exp.content : '',
      warnings,
      vforConsts,
    );
    if (!vf) {
      throw new VueCompileError(
        'v-for 仅支持静态数组字面量（M2，如 v-for="item in [1,2,3]" / v-for="(item, i) in [\'a\',\'b\']"；动态列表随 M3/M4）',
      );
    }
    // M4b：动态列表数据源必须已声明为 ref 数组状态（编译期校验，防悬空引用）
    if (vf.listState && !(state && state.states.some((s) => s.name === vf.listState))) {
      throw new VueCompileError(
        `v-for 动态数据源「${vf.listState}」未在 <script setup> 中声明为 ref 数组（M4b）`,
      );
    }
    const innerNode: ElementNode = { ...node, props: node.props.filter((p) => !(p.type === NodeTypes.DIRECTIVE && p.name === 'for')) };
    const item = walkElement(innerNode, classProps, comboRules, scopedRules, pseudoRules, warnings, state, compTable, propRefs, [
      ...loopScope,
      { itemKey: vf.itemKey, indexKey: vf.indexKey },
    ], ancestorClasses);
    return { type: 'for', vfor: vf, children: [item] };
  }
  // R76 Vue 内置容器组件（Transition/KeepAlive/Teleport/Suspense/Fragment）→ 透明展开：
  // 原生端无过渡动画/缓存语义，但内容必须保留（否则整页编译失败）
  if (['Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'Fragment'].includes(node.tag)) {
    const kids: IrNode[] = [];
    for (const child of node.children) {
      kids.push(...walk(child, classProps, comboRules, scopedRules, pseudoRules, warnings, state, compTable, propRefs, loopScope, ancestorClasses));
    }
    if (kids.length === 0) {
      warnings.push(`<${node.tag}> 内无内容，已忽略`);
      return { type: 'group', props: { flexDirection: 'column' }, children: [{ type: 'text', props: { text: ' ' } }] };
    }
    warnings.push(`<${node.tag}> 已透明展开（原生端无过渡/缓存语义，仅保留内容，R76）`);
    if (kids.length === 1) return kids[0];
    return { type: 'group', props: { flexDirection: 'column' }, children: kids };
  }

  // <template>：逻辑容器（v-if 条件渲染 / 纯透传），不产生 UI 节点
  if (node.tag === 'template') {
    const children: IrNode[] = [];
    let cond: string | undefined;
    for (const p of node.props) {
      if (p.type !== NodeTypes.DIRECTIVE) continue;
      if (p.name === 'if' && p.exp && p.exp.type === NodeTypes.SIMPLE_EXPRESSION) {
        cond = p.exp.content.trim();
      } else if (p.name === 'else' || p.name === 'else-if') {
        // R15 不静默：v-else/v-else-if 不支持，静默渲染会恒显示该分支
        warnings.push(`<template v-${p.name}> 暂不支持——该分支将无条件渲染（R15 降级表）`);
      }
    }
    for (const child of node.children) {
      children.push(...walk(child, classProps, comboRules, scopedRules, pseudoRules, warnings, state, compTable, propRefs, loopScope, ancestorClasses));
    }
    if (cond) {
      // 条件渲染容器：以 group 承载子节点（不参与布局，仅 if 分支）
      // sourceTag='template'：CSS 中 <template> 透明，父容器 gap 可透传（R-G2）
      return { type: 'group', props: { flexDirection: 'column' }, sourceTag: 'template', condition: normCond(cond), children };
    }
    // 无 v-if：透传（合并到父 children）
    // 透传多节点时由调用方展开；此处约定 template 内单根（Vue 本身要求多根可由父承载）
    if (children.length === 1) return children[0];
    if (children.length === 0) throw new VueCompileError('<template> 无内容');
    return { type: 'group', props: { flexDirection: 'column' }, children };
  }

  const mapping = TAG_MAP[node.tag];
  if (!mapping) {
    // R41 组件使用点：查组件表（精确名 + kebab→Pascal 兜底）→ component IR 节点（独立 View 引用）
    const comp =
      compTable.find((c) => c.name === node.tag) ??
      compTable.find((c) => c.name === toPascalCase(node.tag));
    if (comp) {
      const pos = compPosition.get(comp.name) ?? {};
      return componentUseNode(node, comp, pos, warnings);
    }
    throw new VueCompileError(
      `未知标签 <${node.tag}>（元素归一化表外；组件/自定义标签暂不支持，R13）`,
    );
  }
  // overflow:auto（div 等容器）→ 节点升级为 scroll（生成 ScrollView，内容区可滚动占满剩余）
  let nodeType: string | undefined;

  // 指令检测：v-for / v-if / v-show / :style / :class / 事件绑定 → 结构或逻辑绑定
  const props: IrProps = { ...(mapping.defaultProps ?? {}) };
  let cond: string | undefined;
  let activeWhen: string | undefined;
  let activeProps: Record<string, unknown> | undefined;
  for (const p of node.props) {
    if (p.type === NodeTypes.DIRECTIVE) {
      const name = p.name;
      if (name === 'for') {
        continue; // 顶部 forDir 已处理并包裹 for 节点，此处不重复
      }
      if (name === 'if') {
        if (p.exp && p.exp.type === NodeTypes.SIMPLE_EXPRESSION && p.exp.content.trim()) {
          cond = p.exp.content.trim();
          continue;
        }
        throw new VueCompileError('v-if 需要非空条件表达式');
      }
      if (name === 'show') {
        // M5：v-show → show prop（始终渲染占位 + opacity 动画切换；区别于 v-if 条件渲染）
        if (p.exp && p.exp.type === NodeTypes.SIMPLE_EXPRESSION && p.exp.content.trim()) {
          props.show = normCond(p.exp.content.trim());
          continue;
        }
        throw new VueCompileError('v-show 需要非空条件表达式');
      }
      if (name === 'bind' && p.arg) {
        const argName = p.arg.type === NodeTypes.SIMPLE_EXPRESSION ? p.arg.content : '';
        // :key 是 v-for 渲染键（ForEach id:\.self 自带），静默跳过且不产生噪声警告（与组件分支一致，R49）
        if (argName === 'key') continue;
        if (argName === 'style') {
          const dyn = parseDynamicStyle(p.exp, warnings, state);
          if (dyn) mergeIrProps(props, dyn);
        } else if (argName === 'class' && p.exp) {
          // :class="{ 'cls': when }" / 三元 → 动态选中态（active）
          const parsed = parseClassObject(p.exp, warnings);
          if (parsed) {
            const clsProps = classProps.get(parsed.cls);
            if (clsProps) {
              activeWhen = parsed.when;
              activeProps = clsProps;
            } else {
              warnings.push(`:class 动态类「${parsed.cls}」无对应样式规则，已忽略`);
            }
          }
        } else if (mapping.type === 'image' && argName === 'src') {
          warnings.push(':src 动态绑定暂不支持，已忽略（请改用静态 src）');
        } else {
          warnings.push(`:${argName} 动态绑定暂不支持，已忽略`);
        }
        continue;
      }
      if (name === 'model') {
        // M1 v-model（input/textarea）：值绑定已声明的 string 状态 → 原生 @State 直接绑定（$x）；
        // @input 经 JS 运行时拦截（校验/格式化）随 M3 桥接
        const model = p.exp && p.exp.type === NodeTypes.SIMPLE_EXPRESSION ? p.exp.content.trim() : '';
        const st = model && state ? state.states.find((s) => s.name === model) : undefined;
        if (mapping.type === 'input' && st && typeof st.init === 'string') {
          Object.assign(props, { value: model });
        } else {
          warnings.push(`v-model 仅支持 input/textarea 绑定已声明的 string ref 状态（M1），已忽略：${model || '(空)'}`);
        }
        continue;
      }
      if (name === 'on') {
        const event = p.arg && p.arg.type === NodeTypes.SIMPLE_EXPRESSION ? p.arg.content : '';
        const handler = p.exp && p.exp.type === NodeTypes.SIMPLE_EXPRESSION ? p.exp.content.trim() : '';
        // 事件修饰符（.stop/.prevent/.once…）语义会被丢弃，必须显式提示
        if (p.modifiers && p.modifiers.length > 0) {
          warnings.push(`@${event}${p.modifiers.map((m) => `.${m.content}`).join('')} 事件修饰符暂不支持（语义将丢失），按普通 @${event} 处理`);
        }
        // @click="handler" → 状态赋值（setter 内联）优先；否则保留 onClick（JS 运行时调用）
        // M3 规范化：无参调用 `inc()` → `inc`（Swift invoke 统一 evaluateScript("<名>()")）；带参保留原样
        if (event === 'click' && handler) {
          const set = state && resolveSetCall(handler, state);
          if (set) {
            Object.assign(props, { onSet: set });
          } else {
            Object.assign(props, { onClick: /^[A-Za-z_$][\w$]*\(\)$/.test(handler) ? handler.slice(0, -2) : handler });
          }
          continue;
        }
        warnings.push(`@${event} 事件暂不支持（当前仅支持 @click），已忽略`);
        continue;
      }
      warnings.push(`指令 v-${name} 暂不支持，已忽略`);
      continue;
    }
    // 静态属性
    const attrName = p.name;
    const attrValue = p.value?.content;
    if (attrName === 'class' && attrValue) {
      elementClasses = attrValue.split(/\s+/).filter(Boolean);
      // 组合规则匹配：元素同时具备全部类时覆盖（优先级最高）
      const matchedCombos = comboRules.filter((r) => r.classes.every((c) => elementClasses.includes(c)));
      const comboMembers = new Set(matchedCombos.flatMap((r) => r.classes));
      for (const cls of elementClasses) {
        const p2 = classProps.get(cls);
        if (p2) mergeIrProps(props, p2);
        else if (!comboMembers.has(cls)) {
          warnings.push(`class「${cls}」无对应样式规则，已忽略`);
        }
      }
      for (const rule of matchedCombos) mergeIrProps(props, rule.props);
      // M5 后代/子选择器：目标类命中 + 祖先链匹配（direct：直接父含最近祖先类；后代：祖先链上存在）
      const matchedScoped = scopedRules.filter((r) => {
        if (!elementClasses.includes(r.target)) return false;
        if (r.direct) {
          const parentCls = (ancestorClasses[0] ?? '').split(/\s+/).filter(Boolean);
          return r.ancestors.every((a) => parentCls.includes(a));
        }
        const chain = ancestorClasses.join(' ');
        return r.ancestors.every((a) => chain.split(/\s+/).includes(a));
      });
      for (const rule of matchedScoped) mergeIrProps(props, rule.props);
      // M5 伪类按压态：.btn:active → pressBg（button 生成按压样式；:hover 在 iOS 无意义，仅取 active）
      for (const cls of elementClasses) {
        const pa = pseudoRules.find((r) => r.cls === cls && r.pseudo === 'active');
        if (pa) mergeIrProps(props, pa.props);
      }
    } else if (attrName === 'style' && attrValue) {
      mergeIrProps(props, parseInlineStyle(attrValue, warnings));
    } else if (mapping.type === 'image' && attrName === 'src' && attrValue) {
      props.src = attrValue;
    } else if (mapping.type === 'input' && attrName === 'placeholder' && attrValue) {
      props.placeholder = attrValue;
    } else if (attrName === 'key' || attrName === 'id') {
      // 忽略
    } else if (attrValue !== undefined) {
      warnings.push(`属性 ${attrName}="${attrValue}" 暂不支持，已忽略`);
    }
  }

  // 子节点：
  //  - button：文本 → label
  //  - text 类型（p/span/h1~h4）：全部文本子节点合并为 props.text；出现元素子节点 → 行内混合报错；
  //    组件 View 内 {{ prop }}（propRefs）→ 单插值时可整体作为 text ref（Text(prop)）
  //  - 其余（group/image）：递归 walk
  const children: IrNode[] = [];
  if (mapping.type === 'text') {
    let text = '';
    let refOnly: string | undefined;
    let exprOnly: string | undefined;
    // M4b：混合文本（静态 + 插值/动态字段）→ bindParts 分段拼接（Text("\(bind)静态\(dyn)"）
    const parts: ({ text: string } | { bind: string } | { dynField: { var: string; field: string } } | { fieldOf: { obj: string; field: string } })[] = [];
    for (const child of node.children) {
      if (child.type === NodeTypes.TEXT) {
        text += child.content;
        parts.push({ text: child.content });
      } else if (child.type === NodeTypes.INTERPOLATION) {
        const name = textOf(child.content).trim();
        // 动态列表项属性 {{ item.field }}：基名（dot[0]）命中循环变量才成立
        const dot = name.split('.');
        const base = dot[0];
        const loopVar = loopScope.find((l) => l.itemKey === base || l.indexKey === base);
        const dyn =
          loopVar && dot.length === 2 && dot[0] === loopVar.itemKey && /^\w+$/.test(dot[1]);
        if (!text && !parts.some((p) => 'bind' in p || 'dynField' in p || 'fieldOf' in p)) {
          // M2 模板内三元（D1 小范围）：cond ? 'a' : 'b' → Swift 三元字符串表达式（Text(expr)）
          const tri = parseTernaryExpr(name);
          if (tri) {
            exprOnly = tri;
            continue;
          }
          // M4b 单插值动态列表项属性 {{ item.field }} → 单段 bindParts
          if (dyn) {
            parts.push({ dynField: { var: dot[0], field: dot[1] } });
            continue;
          }
          // M2：v-for 循环变量（item/index）优先于状态表
          if (/^\w+$/.test(name)) {
            // 纯单插值：组件 View 内 → ref（Text(prop)）；循环变量/页面状态 → bind
            if (propRefs) {
              refOnly = name;
            } else if (loopVar || (state && state.states.some((s) => s.name === name))) {
              refOnly = name;
            } else {
              throw new VueCompileError(
                `插值 {{ ${name} }}：未在 <script setup> 中声明为 ref 状态（M1 白名单：仅支持已声明状态）`,
              );
            }
            continue;
          }
          // R78 对象字段插值 {{ obj.field }}（单插值）：状态对象 → fieldOf；非状态对象 → 警告 + 空文本
          const fld2 = name.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
          if (fld2) {
            const isState2 = (state?.states ?? []).some((st) => st.name === fld2[1]) || (propRefs?.has(fld2[1]) ?? false);
            if (isState2) {
              parts.push({ fieldOf: { obj: fld2[1], field: fld2[2] } });
              continue;
            }
            warnings.push(
              `插值 {{ ${name} }} 的对象「${fld2[1]}」不是页面状态（如 Pinia store）→ 已生成占位文本；请把该字段提升为 ref（R78）`,
            );
            parts.push({ text: ' ' });
            continue;
          }
          throw new VueCompileError(
            `插值表达式 {{ ${name} }} 暂不支持（M1 仅支持纯状态名；三元/比较表达式 M2 白名单；动态列表项属性 M4b）`,
          );
        }
        // 混合段：静态文本之后的插值
        if (dyn) parts.push({ dynField: { var: dot[0], field: dot[1] } });
        else if (/^\w+$/.test(name) && (loopVar || (state && state.states.some((s) => s.name === name))))
          parts.push({ bind: name });
        else if (propRefs) parts.push({ bind: name });
        else
          throw new VueCompileError(
            `混合文本内插值 {{ ${name} }} 暂不支持（仅支持已声明状态 / 循环变量 / 动态列表项属性）`,
          );
      } else if (child.type === NodeTypes.COMMENT) {
        // 忽略注释
      } else {
        throw new VueCompileError(`<${node.tag}> 内嵌子元素（行内混合）暂不支持（text 节点仅文本/插值）`);
      }
    }
    if (exprOnly !== undefined) {
      props.bindExpr = exprOnly;
    } else if (refOnly !== undefined && !text) {
      // 纯插值：组件 View 内 → props.ref（Swift 属性）；页面级（M1）→ props.bind（@State 引用）
      if (propRefs) {
        props.ref = refOnly;
      } else {
        props.bind = refOnly;
      }
    } else if (parts.length > 1 || (parts.length === 1 && ('bind' in parts[0] || 'dynField' in parts[0] || 'fieldOf' in parts[0]))) {
      props.bindParts = parts;
    } else {
      const t = text.trim();
      if (!t) {
        throw new VueCompileError(`<${node.tag}> 无文本内容`);
      }
      props.text = t;
    }
  } else {
    for (const child of node.children) {
      if (mapping.type === 'button') {
        if (child.type === NodeTypes.TEXT && child.content.trim()) {
          props.label = ((props.label ?? '') + child.content.trim()).trim();
          continue;
        }
        if (child.type === NodeTypes.ELEMENT) {
          // 常见写法兜底：<button><span>文字</span></button> → 内联文本并入 label（否则 IR 校验因缺 label 中断）
          const inner = elementInnerText(child).trim();
          if (inner) {
            props.label = ((props.label ?? '') + inner).trim();
            warnings.push(`<button> 内嵌元素 <${child.tag}> 已降级：内联文本并入 label（button 仅支持纯文本标签）`);
          } else {
            warnings.push(`<button> 内嵌元素 <${child.tag}> 暂不支持（button 仅文本标签），已忽略`);
          }
        }
        continue;
      }
      children.push(...walk(child, classProps, comboRules, scopedRules, pseudoRules, warnings, state, compTable, propRefs, loopScope, [...ancestorClasses, ...elementClasses]));
    }
  }

  // R77 空容器（<div class="spacer" /> 等占位写法）→ 降级为 spacer 占位 + 警告，而不是中断整个编译
  if (mapping.type === 'group' && children.length === 0) {
    warnings.push(`<${node.tag}> 无子节点 → 降级为占位 spacer（R17/R77；可用 padding/height 表达留白）`);
    const keep: Record<string, unknown> = {};
    const src = props as Record<string, unknown>;
    for (const k of ['width', 'height', 'flex', 'marginTop', 'background']) {
      if (src[k] !== undefined) keep[k] = src[k];
    }
    const spacer: IrNode = { type: 'spacer', props: keep as IrProps };
    if (cond) spacer.condition = normCond(cond);
    return spacer;
  }

  // overflow:auto → scroll 节点（消费中转标记，避免进入 schema 校验白名单）
  const propsAny = props as Record<string, unknown>;
  if (nodeType === undefined && propsAny.overflow === 'auto' && mapping.type === 'group') {
    nodeType = 'scroll';
    delete propsAny.overflow;
  }

  const irNode: IrNode = { type: (nodeType ?? mapping.type) as IrNode['type'], props };
  if (children.length > 0) irNode.children = children;
  if (cond) {
    const nc = normCond(cond);
    // R78 续（G12）：条件里的对象字段（v-if="dialog.title"）→ 标记，由 codegen 映射为「非空判断」
    const mCond = nc.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/);
    const ownerKnown =
      mCond !== null &&
      ((state?.states ?? []).some((st) => st.name === mCond[1]) || (propRefs?.has(mCond[1]) ?? false));
    irNode.condition = ownerKnown && mCond ? `__vrnField__:${mCond[1]}:${mCond[2]}` : nc;
  }
  if (activeWhen && activeProps) {
    irNode.active = { when: activeWhen, props: activeProps };
    // active 的 color 注入所有后代 text（选中态金色覆盖子元素显式色）
    if (typeof activeProps.color === 'string') {
      injectActiveColor(irNode, activeWhen, activeProps.color);
    }
  }
  return irNode;
}

/** 把 active 的 color 递归注入子树所有 text 节点（colorActive），实现选中态颜色切换 */
function injectActiveColor(node: IrNode, when: string, activeColor: string): void {
  if (node.type === 'text') {
    const base = (node.props?.color as string | undefined) ?? '#ffffff';
    node.props = { ...node.props, colorActive: { when, color: activeColor } };
    if (!node.props.color) node.props.color = base;
  }
  for (const c of node.children ?? []) injectActiveColor(c, when, activeColor);
}
