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

## 六、本轮进展（R78 对象字段插值）

**已实现（R78）**
- IR：`text.fieldOf = { obj, field }`（并入 `bindParts` 段类型），schema 校验
- 转换层：`{{ obj.field }}`（单插值与混合段两处）→ `fieldOf`；obj 不是页面状态（Pinia store）→ **警告 + 占位文本**（不再中断编译）
- 双端生成：`vrnField(obj, "field")`；运行时辅助已加 —— iOS `Theme.swift` 的 `vrnField(_:_:)`（JSONSerialization）、Android `Runtime.kt` 的 `vrnField(json, key)`（org.json）

**本轮推进到的编译位置**
`gen ios`：路由解析 OK（1 tab）→ `<Transition>`(R76 已修) → 空 div(R77 已修) → `{{ dialog.title }}`(R78 已修) → **`<h3 v-if="dialog.title">{{ dialog.title }}</h3>`（组件 AppDialog.vue）** 处仍失败。

**新增缺口（下一轮）**
| # | 缺口 | 说明 | 计划 |
|---|---|---|---|
| G12 | **条件里的对象字段** `v-if="dialog.title"` | 条件表达式不支持 `obj.field` | `swiftCondExpr`/`kotlinCondExpr` 增加映射：`obj.field` → `!vrnField(obj,"field").isEmpty` / `.isNotEmpty()` |
| G13 | **组件内的对象字段插值** | `AppDialog.vue` 走组件编译路径（propRefs 模式），与页面路径不同 | 在 `componentUseNode`/组件 walk 中同样识别 `fieldOf`（组件的 obj 需来自 props 或组件内 ref） |
| G14 | 组件内 `v-if` 条件降级 | 组件模板条件渲染同样受限 | 随 G12/G13 一起处理 |

## 七、本轮进展（G12/G13）

**已实现**
- `vue2ir`：`condition` 里 `obj.field`（obj 为页面状态或组件 prop）→ 标记 `__vrnField__:obj:field`
- `swiftCondExpr` → `!vrnField(obj,"field").isEmpty`；`kotlinCondExpr` → `vrnField(obj,"field").isNotEmpty()`
- 组件模式（propRefs）：`{{ obj.field }}`（obj ∈ props）→ `fieldOf`，组件 prop 作为 JSON 字符串在运行时取值

**仍未通过的点**：`AppDialog.vue` 的 `<h3 v-if="dialog.title">{{ dialog.title }}</h3>` 仍报 `<h3> 无文本内容`。
根因方向：**元素内容收集路径**（walkElement 里把 TEXT/INTERPOLATION 收成 text/bindParts 的那段）未接入 `fieldOf`；单插值元素在「既非 loopVar 也非 state」时内容被丢弃 → 容器空 → R17 抛错。下一轮要改的是 `walkElement` 的内容收集分支（而非 walk 的 INTERPOLATION 分支）。

## 八、架构级发现（决定后续路线）

**`AppDialog.vue` 等 8 个组件不使用 `defineProps`**，而是直接读 Pinia：

```ts
const ui = useUiStore()
const dialog = computed(() => ui.dialog)   // 模板里 {{ dialog.title }} / v-if="dialog.visible"
```

这与 vuexir 的组件模型（**props 传入**）根本不同，因此：
- `buildComponentTree` 传给组件的 `propRefs` = defineProps 集合 = 空 → `{{ dialog.title }}` 判定为「非状态对象」→ 占位文本 → `<h3> 无文本内容`
- 上一轮修的 G12/G13（函数式 prop 对象/条件）**方向正确但不适用于本 App**：它们解决的是 `props.dialog` 形态

### 两条路线（需拍板）

| 方案 | 做法 | 代价 | 收益 |
|---|---|---|---|
| **A. 立项 R79：Store 扁平化** | 解析 `useXxxStore()` + store 定义（`state: () => ({...})` / setup store 的 `ref`），把 `store.field` 读/写映射为页面扁平状态（`storeField`），模板/条件/事件全部支持 | 框架大改（对象状态模型、嵌套、computed），预计多轮 | 一次性支持 Pinia 架构的 App（本项目 8 组件 + 5 store 全部适用） |
| **B. 迁移期改写** | 把这些组件改成 props 传入（store 逻辑提到页面），组件本身不依赖 Pinia | 框架零改动，但每个页面/组件要人工改写 | 快；但不通用，后续同类 App 仍要改写 |

**当前已完成的框架修复（本轮）**
- `bindParts` 判定补 `fieldOf`（单个对象字段段不再被丢弃 → 不再误报「无文本内容」）
- （前三轮）R75 router v2 / R76 内置组件展开 / R77 空容器降级 / R78 对象字段插值 + 条件标记

## 九、方案 B 验证成功（端到端跑通 · 2026-10-17）

在 `vue-ir-native/migrate/` 下按方案 B 写了两页（扁平状态 + 静态列表 + 子集 CSS），独立入口：
```
migrate/router.ts          # home(tab) + /detail(push)
migrate/pages/Home.vue     # 问候/最近生日卡/即将到来列表/刷新(localStorage)
migrate/pages/Detail.vue   # 详情 + 读取记录
```
命令：`npx vuexir gen ios|android --entry migrate/router.ts --name BirthdayMigrate --out native`

**结果**
| 端 | 结果 |
|---|---|
| iOS 生成 | 1 tab + 1 push，零警告 |
| **iOS 编译** | `xcodebuild` **BUILD SUCCEEDED** |
| **iOS 运行** | 模拟器安装启动，截图 OCR：`生日提醒 / 你好 / 今天 / 生日提醒·农历/公历自动换算 / 的生日 / 7 / 天 10月24日 / 查看详情 / 即将到来 / 前 30 天即将到来 / 爸爸 · 11月02日 · 16天` |
| **Android 编译** | `gradle assembleDebug` **BUILD SUCCESSFUL** |
| Android 提示 | `async handler「goDetail」含超出协程子集的形状`（localStorage + router.push 混用）→ 见下轮 G15 |

**本轮框架修复**
1. `parseRouter` 增加 `routerFile` 参数：相对 import（`./pages/X.vue`）以**路由文件所在目录**为基准（此前按工程根解析，路径错位）
2. 修正 `vrnField` 辅助函数注入位置（一度误插进 `fontExpr` 模板 → 生成 Swift 语法错误；现正确注入 `generateThemeSource` 末尾，`Theme.swift` 含 `func vrnField`）

**下轮缺口**
| # | 缺口 | 计划 |
|---|---|---|
| G15 | async handler 里 `router.push(...)` 未翻译 | `asyncLineKotlin` 增加 `router.push(x)` → `Runtime.push(x)`、`router.back()` → `Runtime.back()` |
| G16 | `{{ greet() }}` 模板函数调用 | 限定无参纯函数 → 派生状态（本轮已用平铺 ref 规避） |

## 十、Round 6（G15 + 浏览器入口 + helper 文件化）

**框架**
- **G15 已实现**：async handler 内 `router.push('x')` → `Runtime.push("x")`、`router.back()` → `Runtime.back()`；Compose `Runtime` 补 `backHandler`/`back()`。产物实测 `Runtime.push("/detail")` ✓
- **辅助函数文件化**：`vrnField` 从 Theme 模板改为独立 `VrnHelpers.swift`（此前被重复注入 3 次 → `invalid redeclaration`；且缺 `import Foundation`）。现在 `VrnHelpers.swift` 只写一次且带 Foundation

**浏览器可预览（硬门槛③）**
- 新增 `vue-ir-native/migrate.html` + `migrate/main.ts` + `migrate/App.vue`（独立外壳，不动用户原 `src/`）
- 实测 `vite` 下 `/migrate.html`、`/migrate/App.vue`、`/migrate/pages/Home.vue` 均 200，日志零错误

**双端验证**
| 端 | 结果 |
|---|---|
| iOS | `gen` 零警告 → `xcodebuild` **BUILD SUCCEEDED** → 模拟器 OCR：`生日提醒 / 你好 / 今天 / 生日提醒·农历/公历自动换算 / 的生日 / 7 …` |
| Android | `gen`（无 handler 提示）→ 产物含 `Runtime.push("/detail")` → `gradle assembleDebug` **BUILD SUCCESSFUL** |
| 浏览器 | `/migrate.html` 200，无错误 |

## 十一、Round 7（迁移页扩到 5 页 + R79 修复）

**迁移页（方案 A）**：`migrate/` 现含 5 页
| 页 | 内容 |
|---|---|
| `Home.vue`（tab） | 问候、最近生日卡、即将到来列表、刷新（localStorage） |
| `Detail.vue`（push） | 详情 + 读取记录 |
| `AllList.vue`（push） | 全部生日列表 + 同步记录 + 跳转添加 |
| `Add.vue`（push） | 表单：称呼/日期（`v-model`）、历法切换、保存并返回 |
| `Calendar.vue`（push） | 月历（上/下月切换）+ 本月生日标记列表 |

路由：1 tab + 4 push；`migrate.html` 独立浏览器入口。

**框架修复（R79）**
- `arrangementExpr` 在同时存在 `gap` 与 `justify-content` 时输出**两个 `horizontalArrangement`** → Kotlin 报 `Argument already passed`。修复：合并为 `Arrangement.spacedBy(gap, Alignment.CenterHorizontally/End…)`，无 gap 时保持原语义

**验收（三门槛）**
| 端 | 结果 |
|---|---|
| 浏览器 | `/migrate.html` + 4 个页面模块 全 200，vite 零错误 |
| Android | `gen`（1 tab + 4 detail）→ `gradle assembleDebug` **BUILD SUCCESSFUL** |
| iOS | `gen` → `xcodebuild` **BUILD SUCCEEDED** → 模拟器 OCR：`生日提醒 / 你好 / 今天 / 生日提醒·农历/公历自动换算 / 的生日 / 7 …` |

## 十二、Round 8（7 页齐 + R80 预览自适应）

**迁移页**：`migrate/` 现 7 页（1 tab + 6 push）
Home / Detail / AllList / Add / Calendar / **Discover**（发现列表 → 跳阅读）/ **Read**（文章页）

**框架修复/能力**
- **R80 预览手机壳自适应**（要求④第一步）：`PhoneFrame.vue` 新增 `isCompact`
  - 判定：`innerWidth <= 560` 或（触摸设备 且 `innerWidth <= 820`）
  - 紧凑模式：隐藏设备工具栏、手机壳无圆角/无内边距/无边框阴影、状态栏仿真不渲染、缩放固定 1 → 浏览器开手机模式时**直出全屏**
  - 保留 PC 模式下的完整手机壳与工具栏
- 迁移中再次验证 **R74**：状态名 `body` 与 SwiftUI `var body` 冲突 → 警告生效（页面改名 `leadText` 后通过）。**结论：R74 目前是警告但后果是 Swift 硬编译失败，下一轮应改为「自动改名 + 警告」**

**验收**
| 端 | 结果 |
|---|---|
| 浏览器 | 7/7 页面模块 200，vite 零错误 |
| Android | `gradle assembleDebug` **BUILD SUCCESSFUL**（1 tab + 6 detail） |
| iOS | `xcodebuild` **BUILD SUCCEEDED**（`ReadDetailView.swift` 改名后通过） |
