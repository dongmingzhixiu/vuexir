import type { IrNode, IrScreen } from '../ir/schema.js';
export declare class VueCompileError extends Error {
}
/** <script setup> 状态提取结果：ref 状态 + 赋值 setter（最小子集） */
export interface ScreenStateInfo {
    states: {
        name: string;
        init: number | string | boolean;
        list?: boolean;
    }[];
    /** setter 函数名 → { target: 状态变量名, param: 形参名, expr: 无参函数体的赋值表达式 } */
    setters: Record<string, {
        target: string;
        param?: string;
        expr?: string;
    }>;
}
/** R-VFOBJ-C：解析 <script setup> 顶层 `const rows = [ ... ]`（静态数组字面量）→ { name: 数组内文 }
 *  模板 `v-for="(item, i) in rows"` 引用变量名时查表展开（编译期常量，非 M4b 动态状态）；
 *  自动排除 ref([...])（`=` 后非 `[` 不匹配）、navBar 对象（非数组）与函数体（保守容忍，与 extractScreenState 一致）
 */
export declare function extractScreenConstArrays(script: string): Record<string, string>;
/** 解析 <script setup> 的 JS 子集：const x = ref(init) 与 setter 函数 */
export declare function extractScreenState(script: string): ScreenStateInfo;
/** M7 页面级导航栏配置解析（配置参数标准）：
 *  `<script setup>` 顶层 `const navBar = { mode, title, bg, backText, immersive }`——白名单键；
 *  模式非法 / 未知键 → warning 忽略（R13 白名单铁律）；返回 null 表示未配置（默认 fixed）。
 */
export declare function extractScreenNavBar(script: string, warnings: string[]): IrScreen['navBar'] | null;
/** 提取顶层具名函数：function name(params) { body }（配对大括号，支持嵌套） */
export declare function extractFunctions(script: string): {
    name: string;
    params: string;
    body: string;
    async?: boolean;
}[];
/** 提取 onMounted(() => { body }) 回调体（顶层调用，M3 生命周期）
 * M4b：括号配对扫描——回调体内含嵌套函数（.then(function(){}) 等）时
 * 正则非贪婪会在第一个内层 } 截断，必须按 {} 深度配对取完整体 */
export declare function extractOnMounted(script: string): string | undefined;
/** body 重写：<script setup> 的 ref 名.value → stateStore.<名>（JS 侧状态注册表） */
export declare function rewriteStateRefs(body: string, names: string[]): string;
/** 生成 runtime.js 完整内容（M3：stateStore Proxy + handlers + onMounted + localStorage shim） */
export declare function generateRuntimeSource(states: {
    name: string;
    init: number | string | boolean;
    list?: boolean;
}[], handlers: {
    name: string;
    params: string;
    body: string;
    async?: boolean;
}[], onMounted: string | undefined, onMountedAsync?: boolean): string;
export declare function swiftExpr(exp: string): string | null;
/** @click="fn(arg)" → 若 fn 是已提取的 setter，内联为状态赋值 { var, value, kind }（M1 扩展无参表达式 setter）
 *  M2：直接赋值表达式 `selected = item` / `selected = i`（列表选中）同样内联 */
export declare function resolveSetCall(handler: string, state: ScreenStateInfo): {
    var: string;
    value: number | string;
    kind: 'literal' | 'expr';
} | null;
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
    components?: {
        name: string;
        ui: IrNode;
    }[];
}
export declare function vueToIr(source: string, opts?: Vue2IrOptions): Vue2IrResult;
