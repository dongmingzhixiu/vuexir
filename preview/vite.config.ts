import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 预览专用配置：root = preview/（与编译器/vitest 配置隔离）
// 实时扫描样例：/__vrn/screens 中间件每次请求都读 examples/ 目录，
// 新增样例目录后只需刷新预览页，无需重启 vite server。
// M9：样例分两种形态——单页（有 App.vue）直接渲染；多页（有 router.ts）走 RouterPreview 模拟导航。

// preview/ 的上一级 = 项目根
const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const samplesDir = resolve(root, 'examples');

function screensPlugin(): Plugin {
  return {
    name: 'vrn-screens-api',
    configureServer(server) {
      server.middlewares.use('/__vrn/screens', (_req, res) => {
        try {
          const names = readdirSync(samplesDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => {
              const dir = resolve(samplesDir, d.name);
              return {
                name: d.name,
                mode: existsSync(resolve(dir, 'router.ts')) ? 'router' : 'single',
                hasMain: existsSync(resolve(dir, 'main.ts')),
              };
            });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ screens: names }));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ screens: [], error: 'samples 目录不可读' }));
        }
      });
      // 多页样例：返回 router.ts 源码（浏览器端解析路由表 + 模拟导航）
      server.middlewares.use('/__vrn/router', (req, res) => {
        try {
          const u = new URL(req.url ?? '', 'http://localhost');
          const name = u.searchParams.get('name') ?? '';
          const file = resolve(samplesDir, name, 'router.ts');
          if (!existsSync(file)) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(readFileSync(file, 'utf8'));
        } catch {
          res.statusCode = 500;
          res.end('error');
        }
      });
      // 动态 import 样例 SFC：302 重定向到 /@fs/<abs>，让 vite 正常 transform
      // （裸相对路径在 root 之外不会预扫描，会 fallback 到 index.html 导致 import 失败）
      server.middlewares.use('/__vrn/page', (req, res) => {
        try {
          const u = new URL(req.url ?? '', 'http://localhost');
          const name = u.searchParams.get('name') ?? '';
          const file = u.searchParams.get('file') ?? '';
          const abs = resolve(samplesDir, name, file);
          if (!existsSync(abs)) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          res.writeHead(302, { Location: `/@fs/${abs}` });
          res.end();
        } catch {
          res.statusCode = 500;
          res.end('error');
        }
      });
      // 静态资源桥（样例 bundle:// 协议 → /__asset?file=...）：books.json 等
      server.middlewares.use('/__vrn/asset', (req, res) => {
        try {
          const u = new URL(req.url ?? '', 'http://localhost');
          const name = u.searchParams.get('name') ?? '';
          const file = u.searchParams.get('file') ?? '';
          const abs = resolve(samplesDir, name, file);
          if (!existsSync(abs)) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(readFileSync(abs, 'utf8'));
        } catch {
          res.statusCode = 500;
          res.end('error');
        }
      });
    },
  };
}

// 样例 SFC 自动注入 vue import：
// 编译器样例的 <script setup> 遵循编译器约定（ref/computed/onMounted 不 import），
// 浏览器 Vue 运行时需要真实 import。transform 钩子（enforce:pre，先于 vue 插件编译）
// 检测样例 script setup 用到的 vue API，缺失时注入。
function autoInjectVueImport(): Plugin {
  const VUE_APIS = ['ref', 'computed', 'onMounted', 'reactive', 'watch', 'shallowRef', 'nextTick'];
  return {
    name: 'vrn-auto-inject-vue-import',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/examples/') || !id.endsWith('.vue')) return;
      if (/import\s*\{[^}]*\}\s*from\s*['"]vue['"]/.test(code)) return;
      const used = VUE_APIS.filter((k) => new RegExp(`\\b${k}\\s*\\(`).test(code));
      if (!used.length) return;
      const inject = `\nimport { ${used.join(', ')} } from 'vue'`;
      return code.replace(/(<script[^>]*>)/, '$1' + inject);
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), autoInjectVueImport(), screensPlugin()],
  server: {
    port: 5179,
    // 动态 import 样例组件（../compiler/samples/...）在 root=preview 之外，须放行项目根
    fs: { allow: [root] },
  },
});
