import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PKGS = join(ROOT, 'packages');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('打包卫生（R82）', () => {
  it('package.json 的 exports 不得出现 [object Object] 之类的拼接残骸', () => {
    for (const dir of readdirSync(PKGS)) {
      const pj = join(PKGS, dir, 'package.json');
      let raw: string;
      try {
        raw = readFileSync(pj, 'utf-8');
      } catch {
        continue;
      }
      expect(raw.includes('[object Object]'), `${dir}/package.json 的 exports 被错误拼接`).toBe(false);
      const j = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, v] of Object.entries((j.exports ?? {}) as Record<string, unknown>)) {
        const paths = typeof v === 'string' ? [v] : Object.values(v as Record<string, string>);
        for (const p of paths) {
          expect(p, `${dir} 的导出「${key}」路径异常`).toMatch(/^\.\/(dist|bin)\//);
        }
      }
    }
  });

  it('src 下不得残留与 .ts 同名的 .js（Vite 解析 .js 优先，会静默加载旧产物）', () => {
    const stray: string[] = [];
    for (const dir of readdirSync(PKGS)) {
      const src = join(PKGS, dir, 'src');
      let files: string[];
      try {
        files = walk(src);
      } catch {
        continue;
      }
      const names = new Set(files);
      for (const f of files) {
        if (!f.endsWith('.js')) continue;
        if (names.has(`${f.slice(0, -3)}.ts`)) stray.push(relative(ROOT, f));
      }
    }
    expect(stray).toEqual([]);
  });
});
