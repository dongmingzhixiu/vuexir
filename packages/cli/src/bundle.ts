/**
 * R97 P2：把工程里的**纯逻辑 util** 用 esbuild 打成 IIFE bundle，
 * 供原生 JS 运行时（iOS JavaScriptCore / Android QuickJS）在页面脚本之前加载。
 *
 * 目的：`computed(() => countChars(raw))` 这类引用了 utils 的表达式，
 * 过去只能跳过（原生端没有这些函数）；打包后函数成为全局，表达式可直接求值。
 *
 * 策略：逐个文件尝试打包，**失败的（依赖 dexie / DOM / 浏览器 API）自动跳过**并返回告警，
 * 保证「能打的都打上，打不了的明确说明」，不静默。
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DEXIE_SHIM_SOURCE } from './shims.js';

export interface BundleResult {
  /** IIFE 代码（空串表示没有可打包的 util） */
  code: string;
  /** 成功打包的文件名 */
  included: string[];
  /** 跳过的文件（含原因） */
  skipped: { file: string; reason: string }[];
}

/** 打包 src/utils 下可独立运行的 util（`@/types` 等纯类型导入会被 esbuild 擦除） */
export function bundleProjectUtils(projectRoot: string): BundleResult {
  const utilsDir = join(projectRoot, 'src', 'utils');
  if (!existsSync(utilsDir)) return { code: '', included: [], skipped: [] };

  // 把 dexie shim 落到临时文件，打包时用 alias 顶替真实的 dexie 依赖
  const shimDir = mkdtempSync(join(tmpdir(), 'vrn-shim-'));
  const dexieShim = join(shimDir, 'dexie-shim.js');
  writeFileSync(dexieShim, DEXIE_SHIM_SOURCE);

  const included: string[] = [];
  const skipped: { file: string; reason: string }[] = [];
  const chunks: string[] = [];

  for (const file of readdirSync(utilsDir)) {
    if (!/\.(ts|js|mts)$/.test(file) || file.endsWith('.d.ts')) continue;
    try {
      const out = buildSync({
        entryPoints: [join(utilsDir, file)],
        bundle: true,
        write: false,
        format: 'iife',
        // 每个文件一个独立命名空间，避免后一个 IIFE 覆盖前一个的导出
        globalName: `__vrnUtils_${included.length}`,
        platform: 'neutral',
        target: 'es2019',
        // 纯类型导入会被擦除；若确实依赖运行期外部包（dexie 等）则整包失败 → 跳过该文件
        external: [],
        logLevel: 'silent',
        alias: { '@': join(projectRoot, 'src'), dexie: dexieShim },
      });
      const code = out.outputFiles?.[0]?.text ?? '';
      if (code) {
        // 导出提升为全局：模板表达式里是裸调用（countChars(...)），必须能在全局找到
        chunks.push(
          code +
            `\n;(function(){var m=__vrnUtils_${included.length};if(!m)return;for(var k in m){try{if(typeof globalThis[k]==='undefined')globalThis[k]=m[k];}catch(e){}}})();`,
        );
        included.push(file);
      }
    } catch (e) {
      skipped.push({ file, reason: (e as Error).message.split('\n')[0]?.slice(0, 120) ?? '打包失败' });
    }
  }

  return { code: chunks.join('\n'), included, skipped };
}
