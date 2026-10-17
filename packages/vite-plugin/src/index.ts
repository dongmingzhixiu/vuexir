/**
 * @dongmingzhixiu/vuexir-vite-plugin —— 把预览器与 IR 检查接入用户自己的 Vite 工程（P3）
 *
 *   import vrn from '@dongmingzhixiu/vuexir-vite-plugin'
 *   export default { plugins: [vue(), vrn({ entry: 'src/router.ts', outDir: 'native' })] }
 *
 * 提供：
 *   GET /__vrn/          浏览器预览页（手机壳 + 真实 Vue SFC，插件一行接入）
 *   GET /__vrn/screens   页面清单（name + mode + hasMain）
 *   GET /__vrn/page      302 → /@fs/<abs>（预览动态 import 页面 SFC）
 *   GET /__vrn/asset     预览静态资源（页面 bundle:// 协议桥）
 *   GET /__vrn/router    入口 router.ts 源码
 *   GET /__vrn/ir        ?name=<页面> → IR JSON（调试用，首次请求即编译）
 *   POST /__vrn/gen      触发一次 codegen（等价 `vrn gen <platform>`）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  /** 是否挂载浏览器预览页（默认 true；访问 <root>/__vrn/） */
  preview?: boolean;
}

export default function vrn(options: VrnPluginOptions = {}) {
  let projectRoot = process.cwd();
  const scanDir = (): string => join(options.root ?? projectRoot, options.pagesDir ?? 'src/pages');
  const entryFile = (): string | undefined => {
    const root = options.root ?? projectRoot;
    const candidates = [
      options.entry,
      'src/router.ts',
      'router.ts',
      // 常见 Vue 工程布局（与 CLI 的 resolveEntry 保持一致）
      'src/router/index.ts',
      'src/router/index.js',
      'src/router/index.mts',
    ].filter(Boolean) as string[];
    return candidates.map((c) => resolve(root, c)).find((p) => existsSync(p));
  };

  return {
    name: 'vrn',
    configResolved(config: { root: string; server?: { fs?: { allow?: string[] } } }) {
      projectRoot = options.root ?? config.root;
      // 预览资源（preview/*.vue|ts）位于「插件包目录」，当插件被 node_modules 软链进用户工程时
      // 该路径在 Vite 的 fs.allow 白名单之外 → /@fs 请求会 403。这里自动放行插件包根目录。
      const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
      const allow = config.server?.fs?.allow;
      if (Array.isArray(allow) && !allow.includes(pkgRoot)) allow.push(pkgRoot);
    },
    configureServer(server: {
      middlewares: {
        use: (path: string, fn: (req: { url?: string }, res: VrnRes, next: () => void) => void) => void;
      };
    }) {
      /** 预览请求的候选文件：先按 router 入口所在目录（相对 import 的基准），再按工程根/页面目录 */
      const previewFileCandidates = (name: string, file: string): string[] => {
        const entry = entryFile();
        const bases = [
          entry ? dirname(entry) : undefined,
          options.root ?? projectRoot,
          scanDir(),
          join(scanDir(), name),
          resolve(scanDir(), '..', '..', name),
          resolve(scanDir(), '..', '..'),
        ].filter((b): b is string => !!b);
        return bases.map((b) => resolve(b, file));
      };

      // 页面清单（多页目录扫描 + 单页兜底）
      server.middlewares.use('/__vrn/screens', (_req, res) => {
        const dir = scanDir();
        const root = options.root ?? projectRoot;
        const entry = entryFile();
        const routerMode = !!entry && /router\.(ts|js|mts|mjs)$/.test(entry);
        const screens: { name: string; file: string; mode: 'single' | 'router'; hasMain?: boolean }[] = [];
        if (routerMode) {
          // 多页工程：预览器只需一份 router 源码，页面由它解析后按需 import
          screens.push({
            name: basenameOf(root),
            file: entry!,
            mode: 'router',
            hasMain: existsSync(join(root, 'src/main.ts')) || existsSync(join(root, 'main.ts')),
          });
        }
        if (!routerMode && existsSync(dir)) {
          for (const f of readdirSync(dir)) {
            if (!f.endsWith('.vue')) continue;
            screens.push({ name: f.replace(/\.vue$/, ''), file: join(dir, f), mode: 'single' });
          }
        }
        send(res, { mode: routerMode ? 'router' : 'single', screens });
      });

      // 预览动态 import：302 → /@fs/<abs>，让 Vite 正常 transform 页面 SFC
      server.middlewares.use('/__vrn/page', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const file = url.searchParams.get('file') ?? '';
        const name = url.searchParams.get('name') ?? '';
        const candidates = previewFileCandidates(name, file);
        const hit = candidates.find((c) => existsSync(c));
        if (!hit) {
          sendText(res, 'not found', 404);
          return;
        }
        sendRedirect(res, `/@fs${hit}`);
      });

      // 预览静态资源（页面 fetch('bundle://x.json') → 本地文件）
      server.middlewares.use('/__vrn/asset', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = url.searchParams.get('name') ?? '';
        const file = url.searchParams.get('file') ?? '';
        const hit = previewFileCandidates(name, file).find((c) => existsSync(c));
        if (!hit) {
          sendText(res, 'not found', 404);
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(readFileSync(hit, 'utf-8'));
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
      // 预览页（必须最后注册：connect 按前缀匹配，'/__vrn/' 会吞掉 /__vrn/page 等子路由）
      if (options.preview !== false) {
        server.middlewares.use('/__vrn', (req, res, next) => {
          const path = (req.url ?? '').split('?')[0];
          if (path !== '' && path !== '/' && path !== '/index.html') {
            next();
            return;
          }
          const main = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'preview', 'preview-main.ts');
          if (!existsSync(main)) {
            sendText(res, '预览资源缺失：packages/vite-plugin/preview/preview-main.ts', 500);
            return;
          }
          sendHtml(res, previewHtml(`/@fs${main}`));
        });
      }
    },
  };
}

/** 预览页 HTML（内联样式，避免额外静态资源请求） */
function previewHtml(mainUrl: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>vuexir · 浏览器预览</title>
    <style>
      *,*::before,*::after{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#10131c;color:#efeadd;
        font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif}
      #vrn-preview{min-height:100vh}
    </style>
  </head>
  <body>
    <div id="vrn-preview"></div>
    <script type="module" src="${mainUrl}"></script>
  </body>
</html>`;
}

function basenameOf(p: string): string {
  const segs = p.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? 'app';
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

function sendText(res: VrnRes, body: string, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

function sendHtml(res: VrnRes, body: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

function sendRedirect(res: VrnRes, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end('');
}
