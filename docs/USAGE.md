# vuexir 使用教程（规格版）

> 目标读者：想在**已有 Vue 工程**里加原生 App 输出，或从零起一个 App 的开发者。
> 一句话：**写普通 Vue SFC，用一条命令生成可直接编译的 iOS(SwiftUI) / Android(Compose) 工程。**

---

## 0. 环境要求

| 平台 | 必需 | 检查命令 |
|---|---|---|
| 通用 | Node.js ≥ 18 | `node -v` |
| iOS | Xcode（含 `swiftc`/`xcodebuild`）、`xcodegen` | `npx vuexir doctor` |
| Android | JDK 17+、Gradle、Android SDK（含 `adb`） | `npx vuexir doctor` |
| Android（可选） | `export ANDROID_HOME=~/Library/Android/sdk`、`PATH` 加 `platform-tools` | `adb devices` |

`npx vuexir doctor` 会逐项报告缺失项与修复建议。

---

## 1. 三条使用路径

### 路径 A：从零新建（推荐）

```bash
npx create-vuexir my-app        # 生成工程骨架（src/router.ts + pages + vrn.config.ts）
cd my-app
npm install
npm i -D @dongmingzhixiu/vuexir # 安装 CLI（会带上 compiler + templates）
npx vuexir gen ios              # → native/ios/MyApp
npx vuexir gen android          # → native/android/MyApp
```

### 路径 B：接入已有的 Vue 工程

```bash
cd your-vue-project
npm i -D @dongmingzhixiu/vuexir
```

在项目根新建 `vrn.config.ts`：

```ts
export default {
  entry: 'src/router.ts',   // 多页入口；单页写 'src/App.vue'
  outDir: 'native',         // 生成物根目录（相对项目根，建议加进 .gitignore）
  projectName: 'MyApp',     // Xcode/Gradle 工程名
  bundleId: 'com.example.myapp',
}
```

> 已有项目用 `vue-router` 也可以：`entry` 指向你的路由文件，文件里需有 `const routes = [...]` 形状的路由表
> （字段：`path` / `name` / `component` / `meta.title` / `meta.tab` / `meta.icon`）。

然后：

```bash
npx vuexir doctor
npx vuexir gen ios
```

### 路径 C：可选 —— Vite 插件（边写边预览 + IR 调试）

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import vrn from '@dongmingzhixiu/vuexir-vite-plugin'

export default {
  plugins: [vue(), vrn({ entry: 'src/router.ts', outDir: 'native' })],
}
```

提供的调试端点：

| 端点 | 作用 |
|---|---|
| `GET /__vrn/screens` | 页面清单（name + mode） |
| `GET /__vrn/router` | 入口源码 |
| `GET /__vrn/ir?name=Home` | 该页的 IR + 编译警告 + 校验问题 |

> 插件只负责**预览与调试**，生成原生工程仍由 `npx vuexir gen` 负责。

---

## 2. 目录约定

```
your-vue-project/
  src/
    router.ts            # 多页入口（tab / push 路由）
    pages/*.vue          # 页面（普通 Vue SFC）
    components/*.vue     # 组件 → 生成独立原生 View
  vrn.config.ts
  native/                # 生成物（建议 gitignore）
    ios/<ProjectName>/       ← Xcode 工程（含 .vrn/manifest.json）
    android/<ProjectName>/   ← Gradle 工程
```

### vrn.config.ts 字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `entry` | string | `src/router.ts` → `src/App.vue` | 入口：路由文件或单页 SFC；也可直接给**目录**（自动找 router.ts / App.vue） |
| `outDir` | string | `native` | 生成物根目录 |
| `projectName` | string | 入口目录名 PascalCase | Xcode scheme / Gradle module 名 |
| `bundleId` | string | `com.vrn.<name小写>` | iOS `PRODUCT_BUNDLE_IDENTIFIER` / Android `applicationId` |
| `platform.ios.deploymentTarget` | string | `17.0` | iOS 最低版本 |
| `platform.android.minSdk` | number | `24` | Android 最低版本 |

命令行参数覆盖配置：`--entry` / `--out` / `--name` / `--bundle` / `--root`。

---

## 3. 命令参考

```bash
npx vuexir gen   ios|android [入口] [--out native] [--name MyApp] [--bundle com.x.y]
npx vuexir build ios|android [入口] [--run]     # gen + （--run）调用 xcodegen/xcodebuild 或 gradle
npx vuexir doctor                                # 环境自检 + 生成物 templateVersion 校验
npx vuexir --help
```

`入口` 可以是：样例/工程目录、`router.ts` 路径、或单个 `.vue` 路径。

### 生成后自己编译

```bash
# iOS（模拟器）
cd native/ios/MyApp
xcodegen generate
xcodebuild -project MyApp.xcodeproj -scheme MyApp -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build build CODE_SIGNING_ALLOWED=NO
xcrun simctl boot 'iPhone 17'; xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/MyApp.app
xcrun simctl launch booted com.example.myapp

# Android
cd native/android/MyApp
ANDROID_HOME=~/Library/Android/sdk gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.example.myapp/.MainActivity
```

---

## 4. 页面写法：支持什么、不支持什么

**支持（编译为原生副作用）**

| Vue / CSS | 原生实现 |
|---|---|
| `ref()` 状态、`{{ }}` 插值 | `@State` / `remember { mutableStateOf }` |
| `@click="handler"`、`@click="count++"` | 原生点击事件（简单赋值内联，复杂逻辑走 JS/协程） |
| `v-if` / `v-show` / `v-for` / `v-model` | 条件渲染 / 透明度动画 / 列表 / 输入双向绑定 |
| `async` + `await fetch()`、`setTimeout` | iOS：JavaScriptCore Promise + 宿主桥；Android：Kotlin 协程 |
| `:class` 选中态、`:style` 动态色/字号 | 条件样式、动态颜色 |
| flex 布局、`gap`、`padding`、`border`（含单边发丝线）、`border-radius`、`overflow` | 原生布局修饰符 |
| `<script setup>` 的 `async function` / `onMounted` | 生命周期与异步 |

**不支持（会在编译期给出警告，见 `docs/RULES.md`）**

- 任意 npm 包依赖、Vue 指令插件、`<slot>` / 复杂组件通信
- CSS 子集之外的属性（`grid`、`filter`、动画帧、`var()` 变量等）
- 事件修饰符 `.stop/.prevent`（语义会丢失并警告）
- 单页内的 `router.push` 之外的导航用法

> 完整规则：`docs/RULES.md`（R1–R72）；后续能力路线：`docs/ROADMAP-UNSUPPORTED.md`。

---

## 5. 生成物说明

- `native/<platform>/<ProjectName>/` 是**完整可编译工程**，不依赖 Vue
- `.vrn/manifest.json` 记录 `toolchain` / `templateVersion` / 生成文件清单 → `npx vuexir doctor` 会比对版本，提示是否需要重生成
- 每次 `gen` 会先清空该工程目录再写入（避免陈旧文件残留），因此**不要手工修改生成物**；定制请改 `packages/templates` 或提 issue

---

## 6. 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| `npx vuexir` 报 `404 Not found - GET .../vuexir` | `vuexir` 是**命令名**，包名是 `@dongmingzhixiu/vuexir`。先 `npm i -D @dongmingzhixiu/vuexir` |
| `doctor` 说 gradle / adb 缺失 | 它们不在 PATH：`export ANDROID_HOME=~/Library/Android/sdk`，gradle 用绝对路径或 `export VRN_GRADLE=...` |
| 生成后 Xcode 里没有新文件 | 需重新 `xcodegen generate`（`vuexir build ios --run` 已包含） |
| 页面内容被裁切 / 无法滚动 | 页面根是可滚动视口；若根级用了 `flex/margin-top:auto`（weight 语义），Android 端不加滚动（会打印说明） |
| 编译期出现大量 `CSS 属性「x」不在子集内` | 该属性暂不支持，按提示改用子集内写法（`docs/RULES.md`） |
| `vuexir gen` 报 `IR 校验失败` | 输出里会给出具体 `path: message`，按提示修正 SFC |

---

## 7. 版本与升级

- 包版本：`@dongmingzhixiu/vuexir`（CLI）与 `-compiler` / `-templates` 同步发布
- 工程内 `.vrn/manifest.json` 的 `templateVersion` 与当前 `@dongmingzhixiu/vuexir-templates` 不一致时，`doctor` 会提示 → 跑一次 `npx vuexir gen` 即可对齐
- 升级：`npm i -D @dongmingzhixiu/vuexir@latest && npx vuexir doctor`
