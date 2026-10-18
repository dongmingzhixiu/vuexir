/**
 * @dongmingzhixiu/vuexir 配置解析（R-PKG：CLI 只认「项目根 + vrn.config」两个事实来源）
 *
 * 解析顺序（后者覆盖前者）：
 *   1. 内置默认值（projectRoot = process.cwd()，outDir = <root>/native）
 *   2. vrn.config.ts / vrn.config.mts / vrn.config.js / vrn.config.mjs / vrn.config.json
 *   3. 命令行参数（--out / --entry / --name / --bundle 等）
 *
 * 兼容期：未提供 vrn.config 时，若 <root>/router.ts 或 <root>/App.vue 存在，按「目录即项目」处理；
 * 仓库内开发（旧行为）通过 `--repo-root`（或 cwd 落在仓库内）解析到 examples/<name>。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface VrnConfig {
  /** Vue 工程根（默认 cwd） */
  projectRoot: string;
  /** 入口：router.ts（多页）或单个 .vue（单页），相对 projectRoot */
  entry?: string;
  /** 生成产物根目录（相对 projectRoot）；platform 子目录由 CLI 追加 */
  outDir: string;
  /** 工程名（生成 Xcode/Gradle 工程名；默认由入口目录推导） */
  projectName?: string;
  /** bundle id（默认 com.vrn.<projectname>） */
  bundleId?: string;
  /** 生成页面集合（多页模式；省略则用 entry 的 router.ts） */
  platform?: {
    ios?: { deploymentTarget?: string };
    android?: { minSdk?: number; compileSdk?: number };
  };
}

const CONFIG_FILES = ['vrn.config.ts', 'vrn.config.mts', 'vrn.config.js', 'vrn.config.mjs', 'vrn.config.json'];

/** 读取 vrn.config（json 直接解析；ts/mjs 用动态 import，失败则忽略并提示） */
export async function loadConfig(projectRoot: string): Promise<Partial<VrnConfig>> {
  for (const file of CONFIG_FILES) {
    const p = join(projectRoot, file);
    if (!existsSync(p)) continue;
    try {
      if (file.endsWith('.json')) {
        return JSON.parse(readFileSync(p, 'utf-8')) as Partial<VrnConfig>;
      }
      const mod = (await import(`file://${p}`)) as { default?: Partial<VrnConfig> };
      return mod.default ?? {};
    } catch (e) {
      console.warn(`[vrn] 读取 ${file} 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {};
}

/** 合并默认值 + 配置文件 + CLI 覆盖 */
export function resolveConfig(
  base: Partial<VrnConfig> & { projectRoot?: string },
  overrides: Partial<VrnConfig> = {},
): VrnConfig {
  const projectRoot = resolve(overrides.projectRoot ?? base.projectRoot ?? process.cwd());
  const outDirRaw = overrides.outDir ?? base.outDir ?? 'native';
  return {
    projectRoot,
    entry: overrides.entry ?? base.entry,
    outDir: isAbsolute(outDirRaw) ? outDirRaw : join(projectRoot, outDirRaw),
    projectName: overrides.projectName ?? base.projectName,
    bundleId: overrides.bundleId ?? base.bundleId,
    platform: { ...(base.platform ?? {}), ...(overrides.platform ?? {}) },
  };
}

/** 入口解析：显式 entry → 目录下 router.ts → App.vue → 抛错并列出候选 */
export function resolveEntry(cfg: VrnConfig): { entry: string; multiPage: boolean } {
  const candidates: string[] = [];
  if (cfg.entry) {
    const p = isAbsolute(cfg.entry) ? cfg.entry : join(cfg.projectRoot, cfg.entry);
    // entry 允许直接给「目录」：自动补 router.ts / App.vue（CLI --entry 常见传法）
    if (existsSync(p) && statSync(p).isDirectory()) {
      const r = join(p, 'router.ts');
      if (existsSync(r)) return { entry: r, multiPage: true };
      const a = join(p, 'App.vue');
      if (existsSync(a)) return { entry: a, multiPage: false };
      throw new Error(`entry 目录内没有 router.ts / App.vue：${p}`);
    }
    // R142：任何 .ts/.js 入口都按「路由表」处理（src/router/index.ts 这类命名很常见）
    if (existsSync(p)) return { entry: p, multiPage: /\.(ts|js|mts|mjs)$/.test(p) };
    throw new Error(`vrn.config.entry 指向的文件不存在：${p}`);
  }
  const routerCandidates = [
    join(cfg.projectRoot, 'src/router.ts'),
    join(cfg.projectRoot, 'src/router/index.ts'),
    join(cfg.projectRoot, 'src/router/index.js'),
    join(cfg.projectRoot, 'router.ts'),
  ];
  for (const r of routerCandidates) {
    if (existsSync(r)) return { entry: r, multiPage: true };
    candidates.push(r);
  }
  for (const a of [join(cfg.projectRoot, 'src/App.vue'), join(cfg.projectRoot, 'App.vue')]) {
    if (existsSync(a)) return { entry: a, multiPage: false };
    candidates.push(a);
  }
  throw new Error(
    `未找到入口（多页 src/router.ts 或单页 src/App.vue）。已尝试：\n  ${candidates.join('\n  ')}\n` +
      `可在 vrn.config.ts 中用 entry 显式指定。`,
  );
}

/** 平台输出目录：<outDir>/<platform>/<ProjectName> */
export function platformOutDir(cfg: VrnConfig, platform: 'ios' | 'android', projectName: string): string {
  return join(cfg.outDir, platform, projectName);
}

/** 工程名推导：projectName → 入口目录名 → 'VrnApp'（PascalCase） */
export function deriveProjectName(cfg: VrnConfig, entry: string): string {
  const raw = cfg.projectName ?? dirname(entry).split('/').pop() ?? 'VrnApp';
  const cleaned = raw.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).pop() ?? 'VrnApp';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
