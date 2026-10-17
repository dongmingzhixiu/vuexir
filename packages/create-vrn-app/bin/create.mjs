#!/usr/bin/env node
/**
 * create-vuexir —— 脚手架：npx create-vuexir my-app
 * 生成最小可跑工程：src/router.ts + src/pages/Home.vue + About.vue + vrn.config.ts + package.json
 * 之后：npm i && npx vuexir gen ios|android
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = resolve(process.argv[2] ?? 'my-vuexir-app');
const here = dirname(fileURLToPath(import.meta.url));
const tpl = join(here, '..', 'templates', 'app');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('用法：npx create-vuexir [目录名]\n生成 Vue SFC 工程骨架（含 router.ts 与 vrn.config.ts），随后 npx vuexir gen ios|android');
  process.exit(0);
}
if (existsSync(target)) {
  console.error(`✗ 目标已存在：${target}`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(tpl, target, { recursive: true });

const name = target.split('/').pop().replace(/[^A-Za-z0-9-]/g, '-');
const pkgPath = join(target, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
pkg.name = name;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
// 工程名按分段 PascalCase 推导：my-vuexir-app → MyVuexirApp（bundleId 同步）
const pascal = name
  .split(/[-_.]+/)
  .filter(Boolean)
  .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
  .join('') || 'MyApp';
const cfgPath = join(target, 'vrn.config.ts');
writeFileSync(
  cfgPath,
  readFileSync(cfgPath, 'utf-8')
    .replace(/projectName: '[^']*'/, `projectName: '${pascal}'`)
    .replace(/bundleId: '[^']*'/, `bundleId: 'com.example.${name.replace(/[^a-z0-9]/g, '')}'`),
);

console.log(`✓ 已创建 ${target}

下一步：
  cd ${target}
  npm install
  npx vuexir gen ios        # 或 gen android
  npx vuexir build ios --run
`);
