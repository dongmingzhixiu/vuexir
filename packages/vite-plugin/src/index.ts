/**
 * @dongmingzhixiu/vuexir-vite-plugin —— 把预览器与 IR 检查接入用户自己的 Vite 工程（P3）
 *
 *   import vrn from '@dongmingzhixiu/vuexir-vite-plugin'
 *   export default { plugins: [vue(), vrn({ entry: 'src/router.ts', outDir: 'native' })] }
 *
 * 提供：
 *   GET /__vrn/screens   多页样例/页面清单（name + mode）
 *   GET /__vrn/router    入口 router.ts 源码
 *   GET /__vrn/ir        ?name=<页面> → IR JSON（调试用，首次请求即编译）
 *   POST /__vrn/gen      触发一次 codegen（等价 `vrn gen <platform>`）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { vueToIr, validateIr } from '@dongmingzhixiu/vuexir-compiler';

export interface VrnPluginOptions {
  /** Vue 工程根（默认 Vite root） */
  root?: string;
  /** 入口：router.ts（多页）或 App.vue（单页） */
  entry?: string;
  /** 生成的产物目录（相对 root） */
  outDir?: string;
  /** 扫描目录（默认 root/src/pages） */
  pagesDir?: string;
}

export default function vrn(options: VrnPluginOptions = {}) {
  let projectRoot = process.cwd();
  const scanDir = (): string => join(options.root ?? projectRoot, options.pagesDir ?? 'src/pages');
  const entryFile = (): string | undefined => {
    const root = options.root ?? projectRoot;
    const candidates = [options.entry, 'src/router.ts', 'router.ts'].filter(Boolean) as string[];
    return candidates.map((c) => resolve(root, c)).find((p) => existsSync(p));
  };

  return {
    name: 'vrn',
    configResolved(config: { root: string }) {
      projectRoot = options.root ?? config.root;
    },
    configureServer(server: {
      middlewares: { use: (path: string, fn: (req: { url?: string }, res: VrnRes, next: () => void) => void) => void };
    }) {
      // 页面清单（多页目录扫描 + 单页兜底）
      server.middlewares.use('/__vrn/screens', (_req, res) => {
        const dir = scanDir();
        const screens: { name: string; file: string }[] = [];
        if (existsSync(dir)) {
          for (const f of readdirSync(dir)) {
            if (f.endsWith('.vue')) screens.push({ name: f.replace(/\.vue$/, ''), file: join(dir, f) });
          }
        }
        send(res, { mode: entryFile()?.endsWith('router.ts') ? 'router' : 'single', screens });
      });

      // 入口源码
      server.middlewares.use('/__vrn/router', (_req, res) => {
        const e = entryFile();
        sendText(res, e && existsSync(e) ? readFileSync(e, 'utf-8') : '');
      });

      // IR 调试：?name=<页面名> → 走完整 vueToIr + validateIr
      server.middlewares.use('/__vrn/ir', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = url.searchParams.get('name') ?? '';
        const file = join(scanDir(), `${name}.vue`);
        if (!name || !existsSync(file)) {
          send(res, { ok: false, error: `页面不存在：${name}` }, 404);
          return;
        }
        try {
          const r = vueToIr(readFileSync(file, 'utf-8'), { screenId: name });
          const validation = validateIr(r.screen);
          send(res, { ok: validation.ok, screen: r.screen, warnings: r.warnings, issues: validation.issues });
        } catch (e) {
          send(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
        }
      });
    },
  };
}

interface VrnRes {
  setHeader: (k: string, v: string) => void;
  end: (body: string) => void;
  statusCode?: number;
}

function send(res: VrnRes, body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendText(res: VrnRes, body: string): void {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}
