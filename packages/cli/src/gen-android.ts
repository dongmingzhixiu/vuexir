/**
 * gen-android.ts —— Android 工程生成入口脚本（对位 gen-ios.ts）
 *
 * 链路：vuexir-demo/(router.ts + pages/*.vue) → vueToIr → validateIr → compose.ts → Gradle 工程
 * 输出：compiler/generated/android/<ProjectName>/（gradle assembleDebug 可构建）
 *
 * 运行：
 *   npx vite-node compiler/scripts/gen-android.ts                 # 默认 vuexir-demo
 *   npx vite-node compiler/scripts/gen-android.ts <sample名|路径> # 指定样例
 *
 * codegen 核心在 compiler/src/codegen/compose.ts（对位 swiftui.ts）。
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTabs, resolveInput } from '@dongmingzhixiu/vuexir-compiler';
import { TEMPLATE_VERSION, buildGradle } from '@dongmingzhixiu/vuexir-templates';

// R-PKG：产物根不再假设仓库布局——VRN_OUT_DIR 优先（CLI 注入），否则回退到仓库内 compiler/generated/android
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_ROOT = process.env.VRN_OUT_DIR ?? join(ROOT, 'compiler/generated/android');
/** 样例根（仓库内开发用；用户工程由 CLI 传入显式入口） */
const SAMPLES_ROOT = process.env.VRN_SAMPLES_ROOT ?? join(ROOT, 'examples');

export interface GenerateOptions {
  /** 入口：样例名 / 目录 / 显式路径（默认 vuexir-demo） */
  input?: string;
  /** 产物根（默认 VRN_OUT_DIR 或仓库内 compiler/generated/android） */
  outDirRoot?: string;
  projectName?: string;
  bundleId?: string;
}

/** 生成 Android（Compose）工程；返回产物目录 */
export function generateAndroid(opts: GenerateOptions = {}): string {
  const input = resolveInput(opts.input);
  if (!existsSync(join(input, 'router.ts'))) {
    throw new Error(`[vrn] ${input} 缺少 router.ts（多页模式需要 router.ts；单页请用 gen-ios 路径或补 router.ts）`);
  }
  return runTabs(input, {
    outDirRoot: opts.outDirRoot,
    projectName: opts.projectName,
    bundleId: opts.bundleId,
    renderGradle: (projName, bid) => buildGradle(bid),
    templateVersion: TEMPLATE_VERSION,
  });
}

// 直接执行（旧脚本用法保持兼容）：npx vite-node packages/cli/src/gen-android.ts [样例名|路径]
// CLI（packages/cli/src/cli.ts）导入本模块前设置 VRN_NO_AUTO_RUN=1，避免 import 时重复生成。
// 说明：vite-node 下 process.argv[1] 是 vite-node 自身路径，不能用「是否为主模块」判定。
if (process.env.VRN_NO_AUTO_RUN !== '1') {
  try {
    generateAndroid({ input: process.argv[2] });
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
