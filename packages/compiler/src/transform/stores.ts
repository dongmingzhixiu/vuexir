/**
 * R86 Pinia store 编译期折叠（第一步：状态读取）
 *
 * 原生端没有响应式 store 运行时，页面读 store 状态（`ui.dialog.title`）必须变成
 * 「页面自有状态 + 编译期注入的初值」。本模块把 `defineStore` 源码解析成
 * `StoreDef`，再由 vue2ir 把 `alias.field` 拍平成 `alias_field` 状态。
 *
 * 白名单（R13 铁律）：只认 state 里的**字面量**初值（数字/布尔/字符串/对象/数组）；
 * getter / action 暂不折叠（调用会明确 warning），跨页共享也不保证（各页各一份初值）。
 */

export interface StoreStateField {
  name: string;
  /** 规范化后的初值：原始量或 JSON 字符串（obj/list） */
  init: number | string | boolean;
  obj?: boolean;
  list?: boolean;
}

export interface StoreDef {
  /** defineStore 的第一个参数（store id） */
  key: string;
  /** `useXxxStore` 标识符 */
  fnName: string;
  state: StoreStateField[];
  /** getter：name + 可折叠的成员链（`(s) => s.dialog.visible` → stateField='dialog', path='visible'） */
  getters: { name: string; stateField?: string; path?: string }[];
  /** action：name + 形参表 + 函数体（用于折叠成原生赋值；无法折叠则忽略） */
  actions: { name: string; params: string[]; body: string }[];
}

/** 找到 src 中从 start（含）开始的花括号配对结束位置；未闭合返回 -1 */
function matchBrace(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 把对象字面量规范化为 JSON 文本（单引号 → 双引号、裸键补引号） */
export function normalizeJsonish(raw: string): string {
  return (
    raw
      .replace(/'([^']*)'/g, (_a, inner: string) => `"${String(inner).replace(/"/g, '\\"')}"`)
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, (_a, pre: string, key: string) => `${pre}"${key}":`)
      // 尾逗号（[...,] / {...,}）会让 JSONSerialization 解析失败
      .replace(/,(\s*[}\]])/g, '$1')
      // 单行化：Swift 的 raw string #"..."# 不允许多行内容
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** 分析一层对象的顶层键值（粗粒度：按顶层逗号切分，值保留原文） */
function splitTopLevel(body: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  let depth = 0;
  let cur = '';
  let quote = '';
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push({ key: '', value: cur });
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push({ key: '', value: cur });
  return out
    .map(({ value }) => {
      const m = value.match(/^\s*([A-Za-z_$][\w$]*|"[^"]*"|'[^']*')\s*:\s*([\s\S]*)$/);
      if (!m) return null;
      return { key: m[1].replace(/^['"]|['"]$/g, ''), value: m[2].trim() };
    })
    .filter((x): x is { key: string; value: string } => !!x);
}

/** 解析单文件里的所有 `export const useXxxStore = defineStore('key', {...})` */
export function parseStoreSource(src: string): StoreDef[] {
  const defs: StoreDef[] = [];
  const re = /const\s+(use[A-Za-z0-9_$]*Store)\s*=\s*defineStore\s*\(\s*(['"])([^'"]+)\2\s*,\s*([\s\S]*)$/m;
  const m = src.match(re);
  if (!m) return defs;
  const fnName = m[1];
  const key = m[3];
  let body = m[4].trim();

  const def: StoreDef = { key, fnName, state: [], getters: [], actions: [] };

  if (body.startsWith('{')) {
    // options 写法：{ state: () => ({...}), getters: {...}, actions: {...} }
    const end = matchBrace(body, 0);
    if (end !== -1) body = body.slice(0, end + 1);
    // state: () => ({...}) / state: (): UiState => ({...}) / state: {...}
    const stateMatch = body.match(/state\s*:\s*(?:\([^)]*\)\s*(?::\s*[\w$<>\[\], .|]+)?=>\s*)?\(?\s*\{/);
    if (stateMatch) {
      const braceAt = body.indexOf('{', stateMatch.index ?? 0);
      const stateEnd = braceAt === -1 ? -1 : matchBrace(body, braceAt);
      if (stateEnd !== -1) {
        const fields = splitTopLevel(body.slice(braceAt + 1, stateEnd));
        for (const f of fields) {
          const lit = classifyLiteral(f.value);
          if (lit) def.state.push({ name: f.key, ...lit });
        }
      }
    }
    const gm = body.match(/getters\s*:\s*\{/);
    if (gm) {
      const at = body.indexOf('{', gm.index ?? 0);
      const endIdx = at === -1 ? -1 : matchBrace(body, at);
      if (endIdx !== -1) {
        def.getters = splitTopLevel(body.slice(at + 1, endIdx)).map((x) => {
          // getter 体：`(s) => s.dialog.visible` / `s => s.count + 1`
          const m = x.value.match(/^\s*\(?\s*(\w+)\s*\)?\s*=>\s*([\w$.\[\]']+)\s*$/);
          if (!m) return { name: x.key };
          const segs = m[2].split('.');
          if (segs.length < 2 || segs[0] !== m[1]) return { name: x.key };
          return { name: x.key, stateField: segs[1], path: segs.slice(2).join('.') || undefined };
        });
      }
    }
    const am = body.match(/actions\s*:\s*\{/);
    if (am) {
      const at = body.indexOf('{', am.index ?? 0);
      const endIdx = at === -1 ? -1 : matchBrace(body, at);
      if (endIdx !== -1) {
        // action 是方法简写（`setSkin(skin) { ... }`）而非 `key: value`，必须单独扫描
        const block = body.slice(at + 1, endIdx);
        const ARE = /(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
        let m: RegExpExecArray | null;
        while ((m = ARE.exec(block))) {
          const braceAt = block.indexOf('{', m.index);
          const bodyEnd = braceAt === -1 ? -1 : matchBrace(block, braceAt);
          if (bodyEnd === -1) break;
          def.actions.push({
            name: m[1],
            params: m[2]
              .split(',')
              .map((t) => t.trim().replace(/:.*$/, '').trim())
              .filter(Boolean),
            body: block.slice(braceAt + 1, bodyEnd).trim(),
          });
          ARE.lastIndex = bodyEnd + 1;
        }
      }
    }
  } else {
    // setup 写法：defineStore('key', () => { const a = ref(1); ... return { a } })
    for (const rm of src.matchAll(/const\s+(\w+)\s*=\s*ref(?:<[^>]*>)?\(\s*([^)]*)\)/g)) {
      const lit = classifyLiteral(rm[2].trim());
      if (lit) def.state.push({ name: rm[1], ...lit });
    }
    for (const fm of src.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g)) {
      def.actions.push({
        name: fm[1],
        params: fm[2].split(',').map((t) => t.trim()).filter(Boolean),
        body: fm[3].trim(),
      });
    }
  }
  defs.push(def);
  return defs;
}

/** 字面量分类：数字/布尔/字符串 → 原始量；对象/数组 → JSON 字符串 */
function classifyLiteral(raw: string): Omit<StoreStateField, 'name'> | null {
  const v = raw.trim().replace(/,$/, '');
  if (!v) return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return { init: Number(v) };
  if (v === 'true' || v === 'false') return { init: v === 'true' };
  if (/^'[^']*'$/.test(v) || /^"[^"]*"$/.test(v)) return { init: v.slice(1, -1) };
  if (v.startsWith('{') && matchBrace(v, 0) === v.length - 1) return { init: normalizeJsonish(v), obj: true };
  if (v.startsWith('[') && v.endsWith(']')) {
    const json = normalizeJsonish(v);
    // 元素全为字面量才当列表；含调用/变量则放弃（保持警告，不静默）
    if (!/[A-Za-z_$][\w$]*\s*\(/.test(v)) return { init: json, list: true };
  }
  return null;
}

/** 由多文件源码构建 registry：useXxxStore → StoreDef */
export function buildStoreRegistry(sources: Record<string, string>): Map<string, StoreDef> {
  const map = new Map<string, StoreDef>();
  for (const src of Object.values(sources)) {
    for (const def of parseStoreSource(src)) map.set(def.fnName, def);
  }
  return map;
}

/** 从 `<script setup>` 里找 `const alias = useXxxStore()` 的别名映射 */
export function findStoreAliases(script: string, registry: Map<string, StoreDef>): Map<string, StoreDef> {
  const aliases = new Map<string, StoreDef>();
  for (const m of script.matchAll(/const\s+(\w+)\s*=\s*(use[A-Za-z0-9_$]*Store)\s*\(\s*\)/g)) {
    const def = registry.get(m[2]);
    if (def) aliases.set(m[1], def);
  }
  return aliases;
}

/** 找到 src 中从 start（含）开始的方括号配对结束位置；未闭合返回 -1 */
function matchBracket(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * R88 解析 store 文件里导出的**字面量**常量数组（`export const SKINS: SkinMeta[] = [{...}, ...]`）。
 * 返回 { 名称 → 数组内部文本 }，交给 v-for 做编译期内联（原生端无 JS 模块系统）。
 * 含函数调用/变量引用的元素不做过滤（由下游 JSON 化失败时保持原样并告警）。
 */
export function parseSharedConstArrays(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*\[/g)) {
    // 注意：类型标注里可能先出现 `[`（`SkinMeta[]`），必须从 `=` 之后找数组起始方括号
    const afterEq = src.indexOf('=', m.index ?? 0);
    const at = afterEq === -1 ? -1 : src.indexOf('[', afterEq);
    if (at === -1) continue;
    const end = matchBracket(src, at);
    if (end === -1) continue;
    out[m[1]] = src.slice(at + 1, end).trim();
  }
  return out;
}
