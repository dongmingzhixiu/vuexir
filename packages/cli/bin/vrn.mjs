#!/usr/bin/env node
/**
 * vrn 可执行入口（@vrn/cli）。
 * 说明：源码为 TS，运行期用 vite-node 加载（vite-node 是 CLI 的运行时依赖）；
 * 发布版可改用预编译 dist（P4 处理），此处在未编译时回退到 vite-node。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'cli.ts');

const dist = join(here, '..', 'dist', 'cli.js');
if (existsSync(dist)) {
  const { run } = await import(pathToFileURL(dist).href);
  process.exit(await run(process.argv.slice(2)));
}

// 开发/未编译形态：交给 vite-node（其 CLI 会加载 TS 并设置好 Vite 解析）
const r = spawnSync('npx', ['vite-node', entry, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
