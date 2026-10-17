#!/usr/bin/env node
/**
 * 一键发布 vuexir 各包（幂等）
 *
 * 用法（在仓库根目录）：
 *   npm run publish:pkgs                    # 发布所有「版本未上线」的包（已存在的自动跳过）
 *   npm run publish:pkgs -- --bump patch    # 先升版本（patch|minor|major）再发布
 *   npm run publish:pkgs -- --otp 123456    # 直接带 OTP（不交互）
 *   npm run publish:pkgs -- --dry-run       # 只做 npm pack --dry-run，不发布
 *   npm run publish:pkgs -- --only cli      # 只处理某个包（compiler|templates|cli|vite-plugin|create-vrn-app）
 *   npm run publish:pkgs -- --no-build      # 跳过 dist 构建
 *
 * 行为：
 *   1. 按依赖序处理：compiler → templates → cli → vite-plugin → create-vrn-app
 *   2. 每个包先查 registry：该版本已存在 → 跳过（可安全重复执行）
 *   3. 命中 2FA 时：优先用 --otp / NPM_OTP；否则交互式询问后重试一次
 *   4. 升版本时自动同步内部依赖范围（cli 依赖 compiler/templates 的 ^x.y.z）
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const ORDER = ['compiler', 'templates', 'cli', 'vite-plugin', 'create-vrn-app'];
const ROOT = process.cwd();

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const bump = val('--bump'); // patch|minor|major
const only = val('--only');
const dryRun = has('--dry-run');
const noBuild = has('--no-build');
let otp = val('--otp') ?? process.env.NPM_OTP ?? '';

if (has('--help') || has('-h')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf-8').split('*/')[0].replace(/^\/\*\*?/, ''));
  process.exit(0);
}

const pkgPath = (dir) => join(ROOT, 'packages', dir, 'package.json');
const readPkg = (dir) => JSON.parse(readFileSync(pkgPath(dir), 'utf-8'));
const writePkg = (dir, j) => writeFileSync(pkgPath(dir), JSON.stringify(j, null, 2) + '\n');

function bumpVersion(v, kind) {
  const [maj, min, pat] = v.split('-')[0].split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `0.${min + 1}.0`.replace(/^0(\d)/, '$1');
  return `${maj}.${min}.${pat + 1}`;
}

// ---------- 1. 可选：升版本并同步内部依赖 ----------
const targets = ORDER.filter((d) => !only || d === only || only.split(',').includes(d));
if (bump) {
  if (!['patch', 'minor', 'major'].includes(bump)) {
    console.error(`✗ --bump 只能是 patch|minor|major，收到：${bump}`);
    process.exit(1);
  }
  const next = {};
  for (const dir of targets) {
    const j = readPkg(dir);
    const v = bumpVersion(j.version, bump);
    next[j.name] = v;
    j.version = v;
    writePkg(dir, j);
    console.log(`↑ ${j.name} → ${v}`);
  }
  // 同步内部依赖范围
  for (const dir of ORDER) {
    const j = readPkg(dir);
    let touched = false;
    for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
      if (!j[field]) continue;
      for (const [k, v] of Object.entries(j[field])) {
        if (next[k] && !String(v).startsWith('workspace:')) {
          j[field][k] = `^${next[k]}`;
          touched = true;
        }
      }
    }
    if (touched) {
      writePkg(dir, j);
      console.log(`  ↳ 同步依赖范围：packages/${dir}`);
    }
  }
}

// ---------- 2. 构建 dist ----------
if (!noBuild && !dryRun) {
  console.log('\n── 构建 dist ──');
  execFileSync('node', [join(ROOT, 'scripts', 'build-packages.mjs')], { stdio: 'inherit', cwd: ROOT });
}

// ---------- 工具 ----------
const registryVersion = (name, version) => {
  const r = spawnSync('npm', ['view', `${name}@${version}`, 'version', '--json'], { encoding: 'utf-8' });
  return r.status === 0 && String(r.stdout).includes(version);
};

const runPublish = (dir, extraArgs = []) => {
  const r = spawnSync('npm', ['publish', ...extraArgs], {
    cwd: join(ROOT, 'packages', dir),
    encoding: 'utf-8',
  });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

const ask = (q) =>
  new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });

// ---------- 3. 逐包发布 ----------
const results = [];
for (const dir of targets) {
  const j = readPkg(dir);
  if (!existsSync(join(ROOT, 'packages', dir, 'package.json'))) continue;
  const spec = `${j.name}@${j.version}`;

  if (registryVersion(j.name, j.version)) {
    console.log(`\n⏭  ${spec} 已在 registry，跳过`);
    results.push({ spec, status: 'skipped' });
    continue;
  }

  if (dryRun) {
    console.log(`\n📦 ${spec}（dry-run）`);
    const r = spawnSync('npm', ['pack', '--dry-run'], { cwd: join(ROOT, 'packages', dir), encoding: 'utf-8' });
    console.log((r.stdout ?? '').split('\n').slice(-8).join('\n'));
    results.push({ spec, status: 'dry-run' });
    continue;
  }

  console.log(`\n📤 发布 ${spec}`);
  let r = runPublish(dir, ['--access', 'public', ...(otp ? [`--otp=${otp}`] : [])]);
  if (!r.ok && /Two-factor authentication|EOTP|one-time password/i.test(r.out)) {
    if (!otp) {
      otp = await ask(`  ${spec} 需要 6 位 OTP：`);
    }
    r = runPublish(dir, ['--access', 'public', `--otp=${otp}`]);
  }
  if (r.ok) {
    console.log(`✓ ${spec} 发布成功`);
    results.push({ spec, status: 'published' });
  } else {
    const tail = r.out.split('\n').filter((l) => l.includes('npm error')).slice(0, 4).join('\n');
    console.error(`✗ ${spec} 失败\n${tail}`);
    results.push({ spec, status: 'failed' });
  }
}

// ---------- 4. 汇总 ----------
console.log('\n── 汇总 ──');
for (const r of results) console.log(`  ${r.status.padEnd(9)} ${r.spec}`);
const failed = results.filter((r) => r.status === 'failed');
if (failed.length > 0) {
  console.error(`\n${failed.length} 个包失败；常见原因：2FA 未通过 / 版本已存在（需 --bump）/ token 无该包权限`);
  process.exit(1);
}
console.log('\n全部处理完毕。验证：npm view <包名> version');
