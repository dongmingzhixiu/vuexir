#!/usr/bin/env node
/**
 * 包名与发布元数据设置：node scripts/rename-scope.mjs <@scope|none> [产品名=vuexir]
 *   @dongmingzhixiu vuexir   → @dongmingzhixiu/vuexir（CLI）等，见下表
 *   none vuexir              → vuexir / vuexir-compiler …（非 scope，需自行确认未被占用）
 *
 * 映射：compiler→<prefix>-compiler、cli→<prefix>（旗舰）、templates→<prefix>-templates、
 *       vite-plugin→<prefix>-vite-plugin、create-vrn-app→create-<product>（始终非 scope：
 *       保持 `npm create <product>` 的最佳体验）
 * 同时补发布元数据：license / engines / publishConfig(access public)，并同步
 * packages 间依赖、根脚本、tsconfig.paths、node_modules 符号链接。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, symlinkSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const scopeArg = process.argv[2];
const product = process.argv[3] ?? 'vuexir';
if (!scopeArg) {
  console.error('用法：node scripts/rename-scope.mjs <@scope|none> [产品名]');
  process.exit(1);
}
const scope = scopeArg === 'none' ? '' : scopeArg.startsWith('@') ? scopeArg : `@${scopeArg}`;
const scoped = (n) => (scope ? `${scope}/${n}` : n);

const NAME = {
  compiler: scoped(`${product}-compiler`),
  cli: scoped(product),
  templates: scoped(`${product}-templates`),
  'vite-plugin': scoped(`${product}-vite-plugin`),
  'create-vrn-app': `create-${product}`,
};

const root = process.cwd();
const map = new Map(); // 旧名 → 新名

// 1) 逐包改名 + 元数据
for (const dir of readdirSync(join(root, 'packages'))) {
  const p = join(root, 'packages', dir, 'package.json');
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf-8'));
  map.set(j.name, NAME[dir] ?? scoped(dir));
  j.name = NAME[dir] ?? scoped(dir);
  j.license = j.license ?? 'MIT';
  j.engines = { node: '>=18' };
  j.publishConfig = { access: 'public' };
  if (dir === 'cli') j.bin = { [product]: './dist/cli.js', vrn: './dist/cli.js' };
  if (dir === 'create-vrn-app') j.bin = { [`create-${product}`]: './bin/create.mjs' };
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
// 2) 内部依赖改名（第二轮，保证 map 已完整）
for (const dir of readdirSync(join(root, 'packages'))) {
  const p = join(root, 'packages', dir, 'package.json');
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf-8'));
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    if (!j[field]) continue;
    const next = {};
    for (const [k, v] of Object.entries(j[field])) next[map.get(k) ?? k] = v;
    j[field] = next;
  }
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
// 3) 根 package.json 脚本引用
const rp = join(root, 'package.json');
const rj = JSON.parse(readFileSync(rp, 'utf-8'));
for (const k of Object.keys(rj.scripts ?? {})) {
  for (const [from, to] of map) rj.scripts[k] = rj.scripts[k].replaceAll(from, to);
}
writeFileSync(rp, JSON.stringify(rj, null, 2) + '\n');
// 4) tsconfig.paths
const tp = join(root, 'tsconfig.json');
const tj = JSON.parse(readFileSync(tp, 'utf-8'));
if (tj.compilerOptions?.paths) {
  const paths = {};
  for (const [k, v] of Object.entries(tj.compilerOptions.paths)) {
    let nk = k;
    for (const [from, to] of map) nk = nk.replace(from, to);
    paths[nk] = v;
  }
  tj.compilerOptions.paths = paths;
  writeFileSync(tp, JSON.stringify(tj, null, 2) + '\n');
}
// 5) node_modules 链接（scope 目录）
for (const [from, to] of map) {
  const parts = to.split('/');
  const linkPath = join(root, 'node_modules', ...parts);
  mkdirSync(join(root, 'node_modules', ...parts.slice(0, -1)), { recursive: true });
  try { unlinkSync(linkPath); } catch {}
  const dirName = [...map.entries()].find(([, n]) => n === to)?.[0];
  const pkgDir = Object.keys(NAME).find((d) => NAME[d] === to) ?? 'compiler';
  symlinkSync(`../../packages/${pkgDir}`, linkPath, 'dir');
  void from; void dirName;
}
console.log('设置完成：');
for (const [from, to] of map) console.log(`  ${from.padEnd(18)} → ${to}`);
