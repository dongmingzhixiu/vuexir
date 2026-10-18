/**
 * @dongmingzhixiu/vuexir 命令实现（R-PKG：CLI 是唯一负责路径/IO/进程的层）
 *
 *   vrn gen   ios|android [--entry <p>] [--out <dir>] [--name <n>] [--bundle <id>]
 *   vrn build ios|android [--run]        # gen + （--run 时）调用 xcodegen/xcodebuild | gradle
 *   vrn doctor                           # 环境自检
 *
 * 配置来源见 config.ts（vrn.config.* + CLI 覆盖）。生成器在导入前设置 VRN_NO_AUTO_RUN=1，
 * 避免模块加载时的自动执行。
 */
import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deriveProjectName, loadConfig, platformOutDir, resolveConfig, resolveEntry, type VrnConfig } from './config.js';
import { TEMPLATE_VERSION } from '@dongmingzhixiu/vuexir-templates';

// 关键：生成器模块的默认入口是「导入即执行」（旧脚本行为），CLI 复用其函数前必须关闭该行为
process.env.VRN_NO_AUTO_RUN = '1';

type Platform = 'ios' | 'android';

interface CliArgs {
  command: 'gen' | 'build' | 'doctor' | 'help';
  platform?: Platform;
  run: boolean;
  input?: string;
  outDir?: string;
  projectName?: string;
  bundleId?: string;
  entry?: string;
  projectRoot?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: 'help', run: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = (): string => argv[++i] ?? '';
    if (a === '--run') args.run = true;
    else if (a === '--out') args.outDir = next();
    else if (a === '--name') args.projectName = next();
    else if (a === '--bundle') args.bundleId = next();
    else if (a === '--entry') args.entry = next();
    else if (a === '--root') args.projectRoot = next();
    else if (a.startsWith('--')) console.warn(`[vrn] 未知参数已忽略：${a}`);
    else rest.push(a);
  }
  const cmd = rest[0];
  if (cmd === 'gen' || cmd === 'build' || cmd === 'doctor') args.command = cmd;
  const plat = rest.find((r) => r === 'ios' || r === 'android') as Platform | undefined;
  if (plat) args.platform = plat;
  // 位置参数（非子命令、非平台）视为入口（样例名/目录/路径）
  args.input = rest.slice(1).find((r) => r !== 'ios' && r !== 'android');
  return args;
}

/** 生成指定平台；返回产物目录 */
export async function generate(args: CliArgs, platform: Platform): Promise<string> {
  const fileConfig = await loadConfig(args.projectRoot ?? process.cwd());
  const cfg: VrnConfig = resolveConfig(fileConfig, {
    projectRoot: args.projectRoot,
    outDir: args.outDir,
    entry: args.entry,
    projectName: args.projectName,
    bundleId: args.bundleId,
  });

  // 显式入口（CLI 位置参数）优先于 config.entry
  const explicit = args.input ? await resolveExplicitEntry(args.input, cfg) : undefined;
  const resolved = explicit ? { entry: explicit.entry, multiPage: explicit.multiPage } : resolveEntry(cfg);
  const { entry, multiPage } = resolved;
  /** 传给生成器的入口（约定：路由文件路径 / 含 router.ts 的目录 / 含 App.vue 的目录） */
  // R142：多页入口统一解析成「具体的路由文件」，避免目录里没有 router.ts 时退回样例模式
  let routerFile: string | undefined;
  if (multiPage) {
    if (/\.(ts|js|mts|mjs)$/.test(entry) && existsSync(entry)) {
      routerFile = entry;
    } else {
      for (const cand of ['router.ts', 'index.ts', 'router/index.ts', 'router.js']) {
        const full = join(entry, cand);
        if (existsSync(full)) {
          routerFile = full;
          break;
        }
      }
    }
  }
  const inputDir = routerFile ? dirname(routerFile) : explicit ? explicit.dir : multiPage ? entry : dirname(entry);
  const projectName = cfg.projectName ?? deriveProjectName(cfg, entry);
  const bundleId = cfg.bundleId ?? `com.vrn.${projectName.toLowerCase()}`;
  const outRoot = platformOutDir(cfg, platform, '').replace(/\/$/, '');

  // 动态导入：生成器模块在 import 时执行默认入口（旧脚本兼容），必须先置开关再加载
  process.env.VRN_NO_AUTO_RUN = '1';
  const { generateIos } = await import('./gen-ios.js');
  const { generateAndroid } = await import('./gen-android.js');

  if (platform === 'android') {
    if (!multiPage) {
      throw new Error('[vrn] Android 生成目前要求多页入口 router.ts（单页 App.vue 请先补 router.ts）');
    }
    return generateAndroid({ input: inputDir, outDirRoot: outRoot, projectName, bundleId });
  }
  const out = generateIos({
    input: inputDir,
    outDirRoot: outRoot,
    projectName,
    bundleId,
    ...(routerFile ? { routerFile } : {}),
  });
  if (!out) throw new Error('[vrn] iOS 生成未返回产物目录');
  return out;
}

/** 位置参数解析：样例名 / 目录 / .vue 路径 → { 目录, 入口文件, 是否多页 }
 *  说明：生成器（gen-ios/gen-android）接收入口**目录**（内含 router.ts / App.vue） */
async function resolveExplicitEntry(
  input: string,
  cfg: VrnConfig,
): Promise<{ dir: string; entry: string; multiPage: boolean }> {
  const candidates = [
    input,
    join(cfg.projectRoot, input),
    join(cfg.projectRoot, 'examples', input),
    join(process.cwd(), input),
  ];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    if (c.endsWith('.vue')) return { dir: dirname(c), entry: c, multiPage: false };
    // R140：直接给路由文件（src/router/index.ts 这类非 router.ts 命名）也要认
    if (/\.(ts|js|mts|mjs)$/.test(c)) return { dir: dirname(c), entry: c, multiPage: true };
    if (existsSync(join(c, 'router.ts'))) return { dir: c, entry: join(c, 'router.ts'), multiPage: true };
    if (existsSync(join(c, 'App.vue'))) return { dir: c, entry: join(c, 'App.vue'), multiPage: false };
  }
  throw new Error(`[vrn] 找不到入口「${input}」（已尝试：\n  ${candidates.join('\n  ')}）`);
}

/** vrn doctor：环境自检（生成链路依赖的外部工具） */
export function doctor(): boolean {
  const checks: { name: string; cmd: string; args: string[]; hint: string }[] = [
    { name: 'node', cmd: 'node', args: ['--version'], hint: '安装 Node.js ≥ 18' },
    { name: 'xcodegen', cmd: 'xcodegen', args: ['--version'], hint: 'brew install xcodegen（iOS 工程生成）' },
    { name: 'xcodebuild', cmd: 'xcrun', args: ['--find', 'xcodebuild'], hint: '安装 Xcode 并 xcode-select --install' },
    { name: 'swiftc', cmd: 'xcrun', args: ['--find', 'swiftc'], hint: '随 Xcode 提供（iOS 源码类型检查）' },
    { name: 'gradle', cmd: 'gradle', args: ['--version'], hint: 'brew install gradle 或设置 VRN_GRADLE' },
    { name: 'adb', cmd: 'adb', args: ['version'], hint: 'Android SDK platform-tools（装到真机需要）' },
  ];
  let ok = true;
  for (const c of checks) {
    // 兼容自定义安装位置：VRN_GRADLE / ANDROID_HOME 下的 platform-tools
    const custom: Record<string, string | undefined> = {
      gradle: process.env.VRN_GRADLE ?? (existsSync(join(process.env.HOME ?? '', 'gradle-dist/gradle-8.9/bin/gradle')) ? join(process.env.HOME ?? '', 'gradle-dist/gradle-8.9/bin/gradle') : undefined),
      adb: process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'platform-tools/adb') : undefined,
    };
    const bin = custom[c.name] ?? c.cmd;
    const r = spawnSync(bin, c.args, { encoding: 'utf-8' });
    // 自定义路径下以「文件存在」判定（部分环境禁止直接执行，如沙箱）
    const good = r.status === 0 || (custom[c.name] !== undefined && existsSync(bin));
    if (!good) ok = false;
    console.log(`${good ? '✓' : '✗'} ${c.name.padEnd(11)} ${good ? (r.stdout.split('\n')[0] ?? '').trim() : `缺失 → ${c.hint}`}`);
  }
  // P2：工程产物版本校验（.vrn/manifest.json 记录生成时的工具链/模板版本）
  const outRoot = join(process.cwd(), 'native');
  const scanDirs: string[] = [];
  for (const plat of ['ios', 'android']) {
    const d = join(outRoot, plat);
    if (existsSync(d)) for (const name of readdirSync(d)) scanDirs.push(join(d, name));
  }
  for (const dir of scanDirs) {
    const mf = join(dir, '.vrn/manifest.json');
    if (!existsSync(mf)) {
      console.log(`! ${dir.split('/').slice(-2).join('/')} 缺少 .vrn/manifest.json → 建议 vrn gen 重生成`);
      continue;
    }
    try {
      const m = JSON.parse(readFileSync(mf, 'utf-8')) as { templateVersion?: string; generatedAt?: string };
      const stale = m.templateVersion !== TEMPLATE_VERSION;
      if (stale) ok = false;
      console.log(`${stale ? '✗' : '✓'} ${dir.split('/').slice(-2).join('/')} 模板版本 ${m.templateVersion ?? '?'}${stale ? ` ≠ 当前 ${TEMPLATE_VERSION} → 重生成（vrn gen）` : ''}`);
    } catch {
      console.log(`! ${dir} manifest 解析失败 → 重生成`);
    }
  }

  const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  console.log(`${androidHome ? '✓' : '✗'} ANDROID_HOME ${androidHome ?? '未设置 → export ANDROID_HOME=$HOME/Library/Android/sdk'}`);
  if (!androidHome) ok = false;
  return ok;
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === 'help') {
    console.log(`vrn —— Vue SFC → iOS(SwiftUI) / Android(Compose) 原生工程

用法：
  vrn gen   ios|android [入口] [--out native] [--name MyApp] [--bundle com.x.y]
  vrn build ios|android [入口] [--run]      # 生成后可选调用平台构建
  vrn doctor                                 # 环境自检

配置：<projectRoot>/vrn.config.ts（entry / outDir / projectName / bundleId）
`);
    return 0;
  }
  if (args.command === 'doctor') return doctor() ? 0 : 1;
  if (!args.platform) {
    console.error('[vrn] 请指定平台：vrn gen ios | vrn gen android');
    return 2;
  }
  const outDir = await generate(args, args.platform);
  console.log(`[vrn] ${args.platform} 工程已生成：${outDir}`);
  if (args.command === 'build' && args.run) {
    const cmd =
      args.platform === 'android'
        ? [process.env.VRN_GRADLE ?? 'gradle', ['assembleDebug']]
        : ['xcodegen', ['generate']];
    const r = spawnSync(cmd[0] as string, cmd[1] as string[], { cwd: outDir, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`[vrn] 平台构建命令失败：${cmd[0]}（可在工程目录手动执行）`);
      return r.status ?? 1;
    }
    if (args.platform === 'ios') {
      const project = outDir.split('/').pop();
      const b = spawnSync(
        'xcodebuild',
        ['-project', `${project}.xcodeproj`, '-scheme', project as string, '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,name=iPhone 17', '-derivedDataPath', 'build', 'build', 'CODE_SIGNING_ALLOWED=NO'],
        { cwd: outDir, stdio: 'inherit' },
      );
      return b.status ?? 1;
    }
  }
  return 0;
}
