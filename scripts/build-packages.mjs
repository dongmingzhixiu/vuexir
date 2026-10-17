#!/usr/bin/env node
/**
 * 构建各包的 dist（tsc 逐包 emit + d.ts）。发布前必跑：npm run build:packages
 * 说明：不使用 tsup/esbuild（避免额外依赖与联网安装）；tsc 足够，且源码已按 ESM 规范带 .js 扩展名。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkgs = readdirSync(join(root, 'packages'));
const BUILD_ORDER = ['compiler', 'templates', 'cli', 'vite-plugin'];
for (const dir of [...BUILD_ORDER, ...pkgs.filter((d) => !BUILD_ORDER.includes(d))]) {
  const pkgDir = join(root, 'packages', dir);
  const pj = join(pkgDir, 'package.json');
  if (!existsSync(pj)) continue;
  const j = JSON.parse(readFileSync(pj, 'utf-8'));
  const hasSrc = existsSync(join(pkgDir, 'src'));
  // create-* 脚手架只有 bin + 模板，无需编译
  if (!hasSrc) {
    console.log(`- ${j.name}: 跳过（无 src）`);
    continue;
  }
  // 生成构建用 tsconfig
  const cfg = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      noEmit: false,
      declaration: true,
      declarationMap: false,
      sourceMap: false,
      outDir: 'dist',
      rootDir: 'src',
      module: 'ESNext',
      moduleResolution: 'bundler',
      target: 'ES2022',
      types: ['node'],
      skipLibCheck: true,
      // 关键：构建时不用 tsconfig.paths（否则会把别包源码拉进本次 program，rootDir 报错）；
      // 改走 node 解析 → node_modules 软链 → 依赖包 package.json exports → dist/*.d.ts
      paths: {},
    },
    include: ['src/**/*.ts'],
  };
  writeFileSync(join(pkgDir, 'tsconfig.build.json'), JSON.stringify(cfg, null, 2) + '\n');
  rmSync(join(pkgDir, 'dist'), { recursive: true, force: true });
  execFileSync('npx', ['tsc', '-p', join(pkgDir, 'tsconfig.build.json')], { stdio: 'inherit', cwd: root });

  // exports/files/bin 指向 dist
  const exportsMap = {};
  for (const [k, v] of Object.entries(j.exports ?? { '.': './src/index.ts' })) {
    const key = k === '.' ? '.' : k;
    const base = String(v).replace('./src/', '').replace(/\.ts$/, '');
    exportsMap[key] =
      key === '.'
        ? { types: './dist/index.d.ts', import: './dist/index.js' }
        : { types: `./dist/${base}.d.ts`, import: `./dist/${base}.js` };
  }
  j.exports = exportsMap;
  j.files = ['dist', 'README.md', 'LICENSE'];
  j.main = './dist/index.js';
  j.types = './dist/index.d.ts';
  j.scripts = { ...(j.scripts ?? {}), build: 'node ../../scripts/build-packages.mjs --only ' + dir };
  if (dir === 'cli') {
    // bin 必须指向「会调用 run()」的入口：bin/vrn.mjs 内已实现「有 dist 用 dist，否则回退 vite-node」
    j.bin = { vuexir: './bin/vrn.mjs', vrn: './bin/vrn.mjs' };
    j.files = ['dist', 'bin', 'README.md', 'LICENSE'];
  }
  writeFileSync(pj, JSON.stringify(j, null, 2) + '\n');
  const files = existsSync(join(pkgDir, 'dist')) ? readdirSync(join(pkgDir, 'dist')).length : 0;
  console.log(`✓ ${j.name}: dist ${files} 项`);
}
