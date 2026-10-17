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
import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DEXIE_SHIM_SOURCE, PINIA_SHIM_SOURCE, VUE_ROUTER_SHIM_SOURCE, VUE_SHIM_SOURCE } from './shims.js';

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
  const vueShim = join(shimDir, 'vue-shim.js');
  writeFileSync(vueShim, VUE_SHIM_SOURCE);
  const piniaShim = join(shimDir, 'pinia-shim.js');
  writeFileSync(piniaShim, PINIA_SHIM_SOURCE);

  const included: string[] = [];
  const skipped: { file: string; reason: string }[] = [];
  const chunks: string[] = [];

  // stores 也一起打：页面/工具里的 useXxxStore 需要真实实现（pinia shim 顶上）
  const storesDir = join(projectRoot, 'src', 'stores');
  const dirs = [utilsDir, storesDir].filter((d) => existsSync(d));

  for (const dir of dirs) {
  for (const file of readdirSync(dir)) {
    if (!/\.(ts|js|mts)$/.test(file) || file.endsWith('.d.ts')) continue;
    try {
      const out = buildSync({
        entryPoints: [join(dir, file)],
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
        alias: {
          '@': join(projectRoot, 'src'),
          dexie: dexieShim,
          vue: vueShim,
          pinia: piniaShim,
        },
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
  }

  return { code: chunks.join('\n'), included, skipped };
}

/**
 * R118：把页面 `<script setup>` 打成模块 —— computed / store 别名 / 局部函数
 * 必须在 JS 侧真实存在，否则模板里的派生值算不出来（这一直是数据为空的根因）。
 *
 * 做法：脚本内容写入工程的临时文件（保证相对 import 可解析），末尾追加
 * `export { <所有顶层绑定> }`，esbuild 打成 IIFE（globalName=__vrnPage），
 * 运行时即可遍历这些导出并把 ref/computed 的值同步进 stateStore。
 */
export function bundlePageScript(
  pageFile: string,
  projectRoot: string,
): { code: string; names: string[] } | null {
  const src = readFileSync(pageFile, 'utf-8');
  const m = src.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const body = m[1];
  // 顶层绑定名（const/let/function）；导出的就是这些
  const names = [...new Set([...body.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map((x) => x[1]))];
  if (names.length === 0) return null;

  const shimDir = mkdtempSync(join(tmpdir(), 'vrn-page-'));
  const vueShim = join(shimDir, 'vue-shim.js');
  writeFileSync(vueShim, VUE_SHIM_SOURCE);
  const piniaShim = join(shimDir, 'pinia-shim.js');
  writeFileSync(piniaShim, PINIA_SHIM_SOURCE);
  const dexieShim = join(shimDir, 'dexie-shim.js');
  writeFileSync(dexieShim, DEXIE_SHIM_SOURCE);

  // 入口必须放在工程内，否则 vue/vue-router 等裸导入解析不到 node_modules
  const entry = join(projectRoot, 'src', `.vrn-page-${Date.now()}.ts`);
  writeFileSync(entry, `${body}\nexport { ${names.join(', ')} };\n`);
  const routerShim = join(shimDir, 'vue-router-shim.js');
  writeFileSync(routerShim, VUE_ROUTER_SHIM_SOURCE);

  try {
    const out = buildSync({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: '__vrnPage',
      platform: 'neutral',
      target: 'es2019',
      logLevel: 'silent',
      alias: {
        '@': join(projectRoot, 'src'),
        vue: vueShim,
        'vue-router': routerShim,
        pinia: piniaShim,
        dexie: dexieShim,
      },
    });
    const code = out.outputFiles?.[0]?.text ?? '';
    return code ? { code, names } : null;
  } catch (e) {
    if (process.env.VRN_DEBUG_BUNDLE) console.error('[bundle] 页面脚本打包失败:', (e as Error).message.split('\n')[0]);
    return null;
  } finally {
    try {
      unlinkSync(entry);
    } catch {
      /* 忽略 */
    }
  }
}
