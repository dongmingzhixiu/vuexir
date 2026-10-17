# 真实 Vue 工程迁移状态（birthday-app · 2026-10-17）

> 目标工程：`/Users/panvu/sync-file/development/web/vue-ir-native`（birthday-app：生日提醒，22 个 .vue，vue-router hash 模式，Pinia + dexie(IndexedDB) + lz-string）
> 工具链形态：npm 包 `@dongmingzhixiu/vuexir`（线上 0.1.2 / compiler 0.1.1），本地修复版用于迭代。

## 一、已修复的框架缺口（本轮，要求①）

| # | 缺口 | 现象 | 修复 |
|---|---|---|---|
| G1 | 路由文件发现 | 只找 `src/router.ts`，不认 `src/router/index.ts`（Vite 常见结构） | `config.resolveEntry` 增加 `src/router/index.ts|js` 候选 |
| G2 | 单页工程目录 | `gen ios --entry src`（含 App.vue 的目录）报"未找到样例" | `gen-ios runMain` 增加「目录含 App.vue → 单页模式」分支 |
| G3 | 路由文件路径入参 | 生成器只接受目录（读死 `router.ts`） | `RunTabsOptions.routerFile`（gen-ios/gen-android 均支持直接传路由文件） |
| G4 | CLI 传参 | 多页工程把 `dirname(routerFile)` 传给生成器 → 找不到路由 | `cli.generate` 多页时传路由文件路径、单页传目录 |
| G5 | npm 安装 pnpm 冲突 | 工程 `node_modules` 由 pnpm 创建，`npm i` 抛 `Cannot read properties of null (reading 'matches')` | 规避：改用独立工具箱目录安装（`vrn-toolbox`），或工程侧改用 `pnpm add -D` |

## 二、下一个缺口（待实现，要求①）

**G6 · router 解析器 v2**：目标工程的 `src/router/index.ts` 使用

```ts
component: () => import('@/views/HomeView.vue'),
meta: { tab: true, title: '首页' },
```
现解析器要求 `component: <标识符>` + 静态 `import X from '...'`，且路由对象须单行匹配 → 报「router.ts 未声明 tab 路由」。

需要支持：
1. 动态 import 组件（`() => import('...')`）→ 解析出路径并补 `import` 表
2. `@/` 别名 → `<appDir>/src/`（可配置：`vrn.config.ts` 的 `alias`）
3. 多行路由对象（按 `{}` 配平扫描，而非整行正则）
4. 路径参数（`/add/:id?`、`/detail/:id`）→ 生成原生路由时降级为无参路径 + 警告（R15）

## 三、目标工程的其它预期缺口（预判）

| 依赖 | 用途 | 处置 |
|---|---|---|
| `dexie` | IndexedDB 存储 | 不支持 → 迁移到 `localStorage`（R73 已有双端 Store 桥） |
| `lz-string` | 压缩导出 | 不支持 → 一期移除导出/导入功能 |
| `pinia` | 状态 | 拆平为页面 `ref`（同 xiuxian 迁移经验） |
| `AppStatusBar`/`InkDrops`/`StarRating` 等 8 个组件 | 视觉组件 | 展开为基础元素；动画类降级 |
| CSS（styles/） | 主题与布局 | 只保留子集：grid/动画/阴影等替换或忽略（编译期警告列出） |

## 四、验收门槛（每阶段）

`npx vuexir gen ios|android` 零/可控警告 → `gradle assembleDebug` + `xcodebuild` 通过 → `npm run dev` 浏览器可跑。
