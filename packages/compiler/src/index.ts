/**
 * @dongmingzhixiu/vuexir-compiler 公共入口：Vue SFC → IR → 原生源码的纯函数核心。
 *
 * 设计约束（R-PKG，P1 起生效）：
 *  - 本包**零 IO**：不读写文件、不读 process.cwd()、不启动进程；路径与落盘由 @dongmingzhixiu/vuexir 负责
 *  - 平台差异只体现在 codegen 目录（swiftui / compose），转换层与 IR 双端共享
 *  - 工程级生成入口（runTabs / gen-* 脚本）在 @dongmingzhixiu/vuexir；本包只暴露可组合的纯函数
 */
export {
  vueToIr,
  VueCompileError,
  extractScreenState,
  extractScreenConstArrays,
  extractScreenNavBar,
  extractFunctions,
  extractOnMounted,
  rewriteStateRefs,
  generateRuntimeSource,
  swiftExpr,
  resolveSetCall,
} from './transform/vue2ir.js';
export type { Vue2IrOptions, ScreenStateInfo } from './transform/vue2ir.js';

export { parseCss, parseInlineStyle, mergeIrProps, CssParseError } from './transform/css.js';
export type { CssParseResult } from './transform/css.js';

export { validateIr, parseAndValidateIr } from './ir/schema.js';
export type { IrScreen, IrNode, IrProps, IrValidationIssue } from './ir/schema.js';

export {
  generateScreenSource,
  generateComponentSource,
  generateThemeSource,
  generateViewExtensions,
  collectTheme,
  buildTheme,
} from './codegen/swiftui.js';

// 工程脚手架入口（runTabs）：保留在 core 供 CLI 与旧脚本调用；模板由调用方注入（P2）
export { emitNode, buildNavHost, parseRouter, resolveInput, runTabs } from './codegen/compose.js';
export type { RunTabsOptions } from './codegen/compose.js';
