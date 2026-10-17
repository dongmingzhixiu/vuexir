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

## 五、本轮进展（R75–R77 + 缺口队列）

### 已修复并提交
| # | 能力 | 说明 |
|---|---|---|
| G6 / **R75** | **router 解析器 v2** | 配平扫描（支持多行路由对象）、动态 `component: () => import('@/views/X.vue')`、`@/` 别名 → `<projectRoot>/src`、路径参数 `/detail/:id` → 降级无参 + 警告。gen-ios 与 compose **共用同一份实现**（删除重复解析器） |
| 新增 | `findProjectRoot()` | 自路由文件目录向上找含 `package.json`/`src` 的工程根（`@/` 别名基准） |
| **R76** | Vue 内置容器透明展开 | `<Transition>/<KeepAlive>/<Teleport>/<Suspense>/<Fragment>` 保留内容、丢弃动画语义 + 警告（此前直接报「未知标签」中断编译） |
| **R77** | 空容器降级 | `<div class="footer-pad" />` 等自闭合占位 → 生成 `spacer` + 警告（此前 R17 直接中断） |

### 缺口队列（下一步按序实现，要求①）
| # | 缺口 | 现状 | 计划 |
|---|---|---|---|
| G7 | **对象型状态字段插值** `{{ dialog.title }}` | 报「插值表达式暂不支持」；当前 IR 状态模型是扁平原始值 | **立项 R78**：支持 `state.field` 读取（IR 增加 `bindField`，iOS 走 JSON 字典取值、Android 走 `Store.get`/JSON 解析），或迁移期把字段提升为扁平 state |
| G8 | 模板内函数调用 `{{ greet() }}` | 不支持 | 立项：仅允许无参纯函数 → 编译期展开为派生状态（或在 handler 里维护） |
| G9 | `v-else` / `v-else-if` | 仅 `v-if` | 立项：链式条件映射（iOS `if/else`、Compose `if/else`） |
| G10 | `router.push({ name: 'add' })` 对象形式 | 只支持字符串路径 | 立项：解析对象形式 → 映射到 path |
| G11 | Pinia / dexie / lz-string | 不支持 | 迁移期处理：对象状态（G7）+ `localStorage` 替换 IndexedDB + 移除压缩导出 |

### 当前生成链路位置
`gen ios` 已能解析路由（1 tab = HomeView）→ 编译到 HomeView 时依次撞到 `<Transition>`(已修) → 空 div(已修) → `{{ dialog.title }}`(G7 待立项)。**先把 G7–G10 立项实现，再回到整页编译**。
