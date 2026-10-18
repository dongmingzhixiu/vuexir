# vuexir

**写 Vue SFC，生成 iOS（SwiftUI）/ Android（Compose）原生工程。**

编译路线：`Vue SFC → IR（中间描述）→ 原生源码 → Xcode / Gradle 工程`。
产物是**真正的原生代码**（`struct MyAppView: View` / `@Composable fun MyAppContent()`），可脱离 Vue 独立编译运行：无 WebView、无运行时解释器。两端已在本仓库持续验证：iPhone 17 模拟器构建渲染、真机 Gradle 打包安装。

| 包 | 作用 |
|---|---|
| `@dongmingzhixiu/vuexir` | CLI：`vuexir gen ios\|android`、`vuexir build --run`、`vuexir doctor`（bin：`vuexir` / `vrn`） |
| `@dongmingzhixiu/vuexir-compiler` | 编译器核心（纯函数、零 IO）：SFC → IR → Swift/Kotlin 源码 |
| `@dongmingzhixiu/vuexir-templates` | 原生工程骨架模板（xcodegen / gradle）与版本契约 |
| `@dongmingzhixiu/vuexir-vite-plugin` | Vite 插件：`/__vrn/screens`、`/__vrn/router`、`/__vrn/ir` 调试中间件 |
| `create-vuexir` | 脚手架：`npm create vuexir my-app` |

---

## 一、快速上手（脚手架 · 推荐）

```bash
npm create vuexir my-app
cd my-app
npm install
npx vuexir gen ios          # 或 vuexir gen android
npx vuexir build ios --run  # 生成 + xcodegen + xcodebuild（模拟器）
```

生成结构：

```
my-app/
  src/router.ts        # 多页路由：meta.tab=true → 底部 tab，其余为 push 二级页
  src/pages/*.vue      # 页面（写普通 Vue SFC）
  src/components/*.vue # 组件（生成独立原生 View）
  vuexir.config.ts        # entry / outDir / projectName / bundleId
  native/ios/<Name>/   # 生成的 Xcode 工程（含 .vrn/manifest.json）
  native/android/<Name>/
```

## 二、接入既有 Vue 工程

```bash
npm i -D @dongmingzhixiu/vuexir
```

```ts
// vuexir.config.ts
export default {
  entry: 'src/router.ts',   // 或 'src/App.vue' 单页
  outDir: 'native',
  projectName: 'MyApp',
  bundleId: 'com.example.myapp',
}
```

```bash
npx vuexir doctor        # 环境自检：node/xcodegen/xcodebuild/swiftc/gradle/adb/ANDROID_HOME
npx vuexir gen ios       # 只生成源码
npx vuexir build android --run
```

可选 Vite 集成（一行插件 = 手机壳预览 + IR 调试）：

```ts
import vrn from '@dongmingzhixiu/vuexir-vite-plugin'
export default { plugins: [vue(), vrn({ entry: 'src/router.ts', outDir: 'native' })] }
```

加完这行后直接打开 **`http://localhost:5173/__vrn/`** —— 手机壳里跑的就是你真实的 Vue 页面
（浏览器预览验证「Vue 表达」，原生还原度仍以模拟器截图为准）。手机壳会自适应：PC 显示设备外观，
手机/窄视口自动收成无边框铺满（R80）。`/__vrn/screens`、`/__vrn/router`、`/__vrn/ir` 提供调试数据。

## 三、本仓库内开发（贡献者）

```bash
npm install
npm run dev                  # 预览器：http://localhost:5179/?screen=vuexir-demo
npm test                     # 145 条单测（含生成的 runtime.js 真实执行验证）
npm run typecheck            # vue-tsc
npm run gen:ios -- async     # 生成 examples/async 的 iOS 工程
npm run gen:android          # 生成 Android 工程（默认 examples/vuexir-demo）
npm run ios -- vuexir-demo   # 一键：生成 → xcodegen → xcodebuild → 安装 → 启动
npm run android -- async     # 一键：生成 → gradle → adb 安装 → 启动
npm run build:packages       # 构建各包 dist（发布前）
```

- 样例即文档：`examples/vuexir-demo`（组件库演示，7 tab + 81 二级页）、`examples/async`（Promise / fetch / setTimeout / 协程）
- **使用教程（规格版）：`docs/USAGE.md`** —— 环境要求 / 三条使用路径 / `vuexir.config` 字段 / 页面支持矩阵 / 命令参考 / 常见问题
- 规则与边界：`docs/RULES.md`（R1–R72）、`docs/ROADMAP-UNSUPPORTED.md`（M1–M10 里程碑）
- 审计与修复记录：`docs/AUDIT-2026-10.md`；打包路线：`docs/PACKAGING-PLAN.md`

---

## 快速上手（写一个新页面 → 3 步到 iOS）

```bash
# 1. 浏览器预览（写 Vue 的同时秒级看效果）
npm run dev
#   打开 http://localhost:5179/?screen=<你的样例名>，改文件即热更新

# 2. 生成 + 编译 + 安装 + 启动（iOS 模拟器，一条命令）
npm run ios -- <样例名>          # 如 hongchen / my-app
#   也可直接传文件路径：npm run ios -- path/App.vue

# 3. 截图确认原生还原度
xcrun simctl io booted screenshot /tmp/<样例名>.png
```

**新项目 = 一个文件**：`examples/<name>/App.vue`（Vue SFC）。
- 放进目录即自动出现在浏览器预览 tab（`examples/*/App.vue` 自动发现）
- 无需 main.ts / index.html —— 预览由 preview/ 统一承载，编译器只读 App.vue
- 工程名 / bundle id 取自**样例目录名**（hongchen → Hongchen / com.vrn.hongchen），全新命名空间不覆盖已装 App

> 传统方式（不想要脚本时）：
> `npm run gen:ios -- <样例名|路径|all>` 生成工程 → `cd compiler/generated/ios/<Name>` → `xcodegen generate` → `xcodebuild ...` → `xcrun simctl install/launch`
> - `gen:ios` 无参默认生成 my-app；传样例名（`hongchen`）、`.vue` 路径、或 `all`（批量生成全部样例）

---

## 浏览器预览（秒级反馈 Vue 表达）

写完 Vue 先不编译，直接浏览器看：

```bash
npm run dev:preview
# 打开 http://localhost:5179/?screen=my-app
```

- 自动发现 `examples/*/App.vue`（多屏 = 多目录），顶部 tab 切换
- **新增样例目录后需重启预览**（`import.meta.glob` 在 server 启动时静态扫描，新目录不会被热发现）：`lsof -ti tcp:5179 | xargs kill` 后重新 `npm run dev`
- 手机壳 DOM 渲染（360×640 设计稿基准 + 状态栏 + 纵向滚动）
- 只验证 **Vue 表达**（布局/颜色/间距写没写对）；**原生还原度以模拟器截图为准**

---

## 怎么验证「还原度」

1. 复制 `examples/my-app/` 整个目录为 `examples/<你的名字>/`，**在 `App.vue` 里自己写 Vue 页面**（标准形态：main.ts / App.vue / components/，见该目录 README；支持子集见下）。
2. `npm run gen:ios -- examples/<你的名字>/App.vue` —— 脚本会校验 IR、打印编译提示（如忽略的 CSS 属性）、生成原生工程。
3. 按上面的 xcodebuild + simctl 步骤跑模拟器截图，与你的 Vue 表达逐项对比（间距 / 颜色 / 字号 / 对齐 / 贴底）。

---

## 目录结构

```
vue-render-native/
├── compiler/                    # 编译器（Node 管线，唯一入口）
│   ├── src/
│   │   ├── ir/schema.ts         # IR Schema v0 + 校验器（R16/R17 等约束落在此）
│   │   ├── transform/
│   │   │   ├── css.ts           # <style> CSS 子集 → IR props
│   │   │   └── vue2ir.ts        # 模板 AST → IR（元素归一化 / 静态属性）
│   │   └── codegen/swiftui.ts   # IR → SwiftUI 源码生成器
│   ├── scripts/gen-ios.ts       # 生成脚本（Vue/IR JSON 双入口）
│   ├── samples/
│   │   └── my-app/              # 标准 Vue 工程形态样例（复制它开始写）
│   │       ├── main.ts          # 入口形态占位（不参与编译，见注释）
│   │       ├── App.vue          # ★ 编译入口：一屏的 <template>+<style>
│   │       └── components/      # （预留）子组件目录，当前不支持 import
├── preview/                     # 浏览器预览（npm run dev:preview）
│   ├── index.html               # vite 入口
│   ├── main.ts                  # 自动发现 samples/*/App.vue
│   └── PhoneFrame.vue           # 手机壳 DOM 渲染（360×640 + 状态栏）
│   ├── tests/                   # Schema / 生成器 / 转换器测试（npx vitest run，全绿基线）
│   └── generated/               # 脚本产物（gitignore）
├── runtime/                     # P1 预留：iOS/Android 运行时（事件桥 / QuickJS，R12）
└── docs/                        # 规则与计划（RULES.md 27 条 / PLAN-P0 / PERF-P0）
```

---

## 支持的语言子集（P1-lite）

**元素**：`div / section / header / main / nav / footer / article / ul / li → group`；
`p / span / h1(24 bold) / h2(20 bold) / h3(17 medium) / h4(15 medium) → text`；`img → image`；`button → button`。

**CSS 属性**（`<style>` 单类选择器 `.x` 或组合 `.a.b`，以及内联 `style="..."`）：

| 类别 | 支持 |
| --- | --- |
| 布局 | `display:flex` · `flex-direction:row/column` · `width:px/100%` · `height:px` · `padding` · `gap` · `flex:1` · `margin-top:auto`(贴底) · `justify-content` · `align-items` |
| 视觉 | `background(-color)`(hex/rgba) · `border-radius` · `border:1px solid <color>` · `border-width` · `opacity` |
| 文本 | `color` · `font-size` · `font-weight` · `line-height` · `text-align` |

**img 静态 `src`**：`<img src="/path.png">`。

### 暂不支持（编译期报错，不会静默产出错误原生代码）

- 插值 `{{ }}`、`v-for`、`v-if/v-show`、`:style/:class/:src` 绑定、组件、自定义标签
- `p/span` 内嵌子元素（行内混合排版）
- `script` 逻辑（事件 `@click` 等：忽略 + 编译提示；逻辑分仓 L1/L2/L3 属 P1 阶段，见 `docs/RULES.md` R12）

不在上表的 CSS 属性会被收集为编译提示（`[gen-ios] 编译提示（N 条）`），不会静默忽略。

---

## 校验与测试

```bash
npm test              # 全量测试（Schema 10 + 生成器 3 + 转换器 8 …）
npm run typecheck     # vue-tsc 类型检查
```

每条编译链路的约束（R16 布局语义、R17 节点封闭、R26 品牌色等）见 `docs/RULES.md`。
