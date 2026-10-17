# @dongmingzhixiu/vuexir-vite-plugin

Vite 插件：**手机壳浏览器预览** + IR 调试 + 页面清单接口。一行接入，无需额外工程。

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vrn from '@dongmingzhixiu/vuexir-vite-plugin';

export default defineConfig({
  plugins: [vue(), vrn({ entry: 'src/router.ts', outDir: 'native', pagesDir: 'src/pages' })],
});
```

装好后：

| 地址 | 说明 |
| --- | --- |
| `/__vrn/` | 手机壳预览页（真实 Vue 页面，多页工程自动带 tab/push/返回模拟） |
| `/__vrn/screens` | 页面清单 `{ mode, screens: [{ name, mode, hasMain }] }` |
| `/__vrn/router` | 入口 router 源码 |
| `/__vrn/page?name=&file=` | 302 → `/@fs/<abs>`（预览动态 import 页面 SFC） |
| `/__vrn/asset?name=&file=` | 预览静态资源（页面 `fetch('bundle://x.json')` 桥） |
| `/__vrn/ir?name=` | 单页 → IR JSON + 校验结果（调试编译器用） |

## 选项

```ts
interface VrnPluginOptions {
  root?: string;      // 工程根，默认 Vite root
  entry?: string;     // 入口：router.ts（多页）/ 单页目录，默认自动探测 src/router.ts、src/router/index.ts
  outDir?: string;    // 原生产物目录，默认 native/
  pagesDir?: string;  // 页面目录（单页清单），默认 root/src/pages
  preview?: boolean;  // 是否挂载 /__vrn/ 预览页，默认 true
}
```

## 特性与约束

- **自适应手机壳**：PC 显示设备外框 + 工具栏；窄视口/移动端自动切换紧凑模式（去边框、铺满整屏），
  与原生端同一套布局语义（R80）。
- **自动放行资源目录**：插件会把自身包目录登记进 `server.fs.allow`，因此用 pnpm/workspace
  软链安装时 `/@fs` 请求不会 403。
- **浏览器预览只验证 Vue 表达**（布局/文案/交互状态），像素级还原度以 iOS/Android 模拟器或真机截图为准。
- 页面里可直接 `fetch('bundle://data.json')`，插件会把该协议桥到 `pagesDir` 附近的真实文件。
