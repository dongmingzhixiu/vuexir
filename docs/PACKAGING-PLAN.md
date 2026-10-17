# 打包与分发计划（npm 工具链化 · P1→P4）

> 决策（2026-10）：**CLI 编译器为主 + 可选 Vite 插件 + 模板/示例仓库**，不做 Vue 组件库。
> 依据：本项目的产物是**原生源码工程**（SwiftUI / Compose），不是运行时依赖——用户没有可 `import` 的 API；`vue` 只在预览器/插件侧需要。
> Vite 插件不能作为唯一形态：`vite build` 的产物契约是 JS/CSS bundle，而原生工程需要另起 xcodegen/xcodebuild 与 gradle 构建，插件只能编排、无法替代独立 CLI。

## 一、目标包结构

```
packages/
  compiler/         @vrn/compiler     纯函数核心（零 IO）：transform/ ir/ codegen/
  cli/              @vrn/cli          bin: vrn —— build / preview / doctor / gen
  templates/        @vrn/templates    原生工程模板 + Swift/Kotlin 运行时桥
  vite-plugin/      @vrn/vite-plugin  dev 中间件（/__vrn/*）+ HMR 增量 codegen
  create-vrn-app/   脚手架            npx create-vrn-app my-app
examples/           vuexir-demo / async（由 compiler/samples 迁入）
```

依赖方向单向：`cli → compiler + templates`；`vite-plugin → compiler`；`compiler` 不依赖任何平台工具与 Node fs。

## 二、P1 —— workspaces 拆分与路径解耦

**包边界**

| 现在 | 目标 | 说明 |
|---|---|---|
| `compiler/src/transform/*`、`ir/*`、`codegen/*` | `packages/compiler/src/*` | 仅纯函数；新增 `src/index.ts` 汇总导出 |
| `compiler/scripts/gen-ios.ts`、`gen-android.ts` | `packages/cli/src/gen-ios.ts`、`gen-android.ts` | 保留生成逻辑，剥离「仓库布局假设」 |
| `compiler/samples/*` | `examples/*` | 样例即示例工程 |
| `compiler/tests/*` | `packages/compiler/tests/*` | 与核心同包，相对导入不变 |
| `compiler/scripts/*` 中的模板字符串 | 暂留，P2 抽到 `@vrn/templates` | 分两步降低风险 |

**必须改的硬编码**（当前 `gen-*.ts`）

- `ROOT = join(dirname(import.meta.url), '..')` → 由 CLI 传入 `projectRoot`（默认 `process.cwd()`）
- `OUT_ROOT = join(ROOT, 'generated/<platform>')` → 用户配置 `outDir`（默认 `<projectRoot>/native`）
- 样例定位 `join(process.cwd(), arg, 'router.ts')` → 保留（对用户工程成立），并新增 `entries` 配置项显式指定页面/路由

**用户配置（`vrn.config.ts`，P1 支持 js/json + ts 二选一）**

```ts
export default {
  entry: 'src/router.ts',        // 或 pages/*.vue 单页
  outDir: 'native',              // native/ios/<Name>、native/android/<Name>
  projectName: 'MyApp',
  bundleId: 'com.example.myapp',
  platform: { ios: { deploymentTarget: '17.0' }, android: { minSdk: 24 } },
}
```

**命令面（`vrn`）**

```
vrn build ios|android [--sample <dir>] [--out <dir>] [--open]   # 生成 + 可选调用 xcodegen/gradle
vrn gen ios|android                                            # 只生成源码
vrn preview                                                    # 启动预览器（P3 起改由插件承载）
vrn doctor                                                     # 环境自检（P2）
```

**兼容期**：根 `package.json` 的 `gen:ios` / `gen:android` / `ios` / `android` 脚本保持可用（指向新 CLI），README 同步说明「仓库内开发」与「作为工具链使用」两种用法。

**验收（P1 出口标准）**：`vue-tsc` 0 error；`vitest` 全绿；`gradle assembleDebug`（VuexirDemo + Async）BUILD SUCCESSFUL；`swiftc -typecheck`（两样例）0 error；产物语义等价（关键标记抽查：`drawBehind` 发丝线、`ignoresSafeArea()`、`.navigationTitle("Calendar")`、`TabScaffold`）。

> 注：早期设想的「聚合哈希逐字节对比」口径有缺陷——基线含 Xcode/Gradle 构建产物（5541 文件 vs 纯源码 280 文件），改为按生成源码的关键标记抽查 + 全量测试。

**P1 进展（2026-10 · 已完成搬迁与解耦）**
- ✅ 文件搬迁：`compiler/src → packages/compiler/src`、`compiler/scripts → packages/cli/src`、`compiler/tests → packages/compiler/tests`、`compiler/samples → examples/`；`compiler/` 仅剩 `generated/`（构建产物）
- ✅ 导入修正：CLI 侧 `../src/* → ../../compiler/src/*`；测试样例路径 `../samples/* → ../../../examples/*`
- ✅ 路径解耦：CLI 与 compose 的 `ROOT/OUT_ROOT/samples` 改为可注入（`VRN_OUT_DIR` / `VRN_SAMPLES_ROOT`，默认回落仓库内旧路径）
- ✅ 新增 `packages/cli/src/config.ts`：`vrn.config.{ts,mts,js,mjs,json}` 加载 + 默认值合并 + 入口解析（`src/router.ts` / `src/App.vue`）+ 工程名推导 + `platformOutDir()`
- ✅ `packages/compiler/src/index.ts` 真实导出（纯函数 API 汇总，标注「零 IO」约束）
- ✅ 根脚本与 `scripts/ios-run.sh`、`scripts/android-run.sh` 指向新布局（用户可见行为不变）
- ✅ 全量回归：`vue-tsc` 0 error、`vitest` 145/145、`gen:ios`/`gen:android` 两样例、`gradle assembleDebug` BUILD SUCCESSFUL、`swiftc -typecheck` 两样例 0 error

**P1 已完成（2026-10 · CLI 与配置打通）**
- ✅ `packages/cli/src/cli.ts`：`gen|build|doctor|help` 子命令 + 参数解析（`--out/--name/--bundle/--entry/--root/--run`），配置合并（默认值 ← `vrn.config.*` ← CLI 参数）
- ✅ `packages/cli/bin/vrn.mjs`（有 `dist/cli.js` 时用编译产物，否则回退 vite-node）+ `packages/cli/src/main.ts`
- ✅ 生成器函数化：`generateIos(opts)` / `generateAndroid(opts)`；`VRN_NO_AUTO_RUN` 开关保证「旧脚本直接执行」与「CLI 复用函数」两种用法并存（踩坑：ES 模块静态导入会先于模块体求值 → CLI 必须**动态导入**生成器）
- ✅ 入口解析：位置参数（样例名/目录/.vue）→ `{dir, entry, multiPage}`，生成器接收入口**目录**；`runMain` 支持绝对路径
- ✅ `projectName` / `bundleId` 透传（`FORCED_PROJECT_NAME` / `FORCED_BUNDLE_ID`），修掉「用户工程生成到 `native/ios/Src`」的推导错误
- ✅ `vrn doctor`：node / xcodegen / xcodebuild / swiftc / gradle / adb / ANDROID_HOME，支持 `VRN_GRADLE` 与 `ANDROID_HOME` 下自定义路径（沙箱内以文件存在判定）

**P1 端到端验证**
- 仓库内：`npm run gen:ios|gen:android` 行为不变；`gradle assembleDebug` BUILD SUCCESSFUL；`vitest` 145/145；`vue-tsc` 0 error
- 工具链形态：`vrn gen android examples/async --out /tmp/vrn-out` → `/tmp/vrn-out/android/Async`；`vrn gen ios examples/async --out /tmp/vrn-out` → `/tmp/vrn-out/ios/Async`
- **用户工程形态**：临时工程 `/tmp/vrn-user`（`src/router.ts` + `vrn.config.ts`）→ `vrn gen ios|android --root /tmp/vrn-user` → `native/ios/MyUserApp`（`PRODUCT_BUNDLE_IDENTIFIER: com.example.userapp`）+ `native/android/MyUserApp`

**P1 剩余（转入 P4 处理）**：`npm install` 建立 workspace 链接并把 CLI 相对导入切到 `@vrn/compiler`（需网络安装；当前用相对路径同样可运行）；`vrn.config` 的自动化集成测试（现为手工端到端验证）。

## 三、P2 —— 模板包 + 清单 + doctor（✅ 主体完成）

**已完成**
- `@vrn/templates`：`TEMPLATE_VERSION` + `projectYml(projectName, bundleId)`（xcodegen 骨架）+ `buildGradle(bundleId)`（Android app 骨架）真实搬迁自生成器；`templateFiles(platform)`
- **依赖方向修正**：`compiler` 不依赖 `templates`——`runTabs(opts.renderGradle)` 回调式注入（踩坑：先传字符串模板时 runTabs 还没算出 bundleId，产物出现 `applicationId = "com.vrn."`）
- `.vrn/manifest.json`（双端）：`{ toolchain, templateVersion, platform, projectName, bundleId, templates, files[], generatedAt }`
- `vrn doctor`：对比工程内 manifest 的 `templateVersion` 与当前版本，不一致/缺失时提示 `vrn gen` 重生成；实测能发现旧工程缺 manifest

**P2 剩余**：运行时桥（`RUNTIME_SWIFT` / `RUNTIME_KT`）与其余模板字符串继续外置；增量重生成（entry 哈希未变则跳过）；陈旧文件按 manifest 清理。

## 三-b、P3 —— Vite 插件与脚手架（进行中）

**已完成**：`@vrn/vite-plugin` 实现 `configureServer` 中间件 —— `/__vrn/screens`（页面清单）、`/__vrn/router`（入口源码）、`/__vrn/ir?name=`（走 `vueToIr` + `validateIr` 返回 IR/警告/问题清单，用于调试）。
**P3 剩余**：HMR 增量 codegen（`handleHotUpdate` + manifest 依赖）、把仓库内 `preview/` 的机壳预览合并进插件、`create-vrn-app` 脚手架与模板工程。

## P1 遗留（已用符号链接绕过）
`node_modules/@vrn/*` 目前是手工符号链接 + `tsconfig.paths`；正式化需要一次 `npm install`（联网）生成 workspace 链接，并按 P4 配置 `files/exports`。


- `@vrn/templates`：把 `gen-*.ts` 内的模板字符串抽为 `assets/`（`project.yml.tpl`、`build.gradle.tpl`、`Runtime.swift.tpl`、`Runtime.kt.tpl`、`AndroidManifest.tpl`…），导出 `renderTemplate(name, ctx)`；模板带 `TEMPLATE_VERSION`
- 生成产物写 `.vrn/manifest.json`：`{ toolchain, templateVersion, routes: <hash>, files: [...] }`
  - 支持**增量重生成**（路由/页面未变则跳过）与**陈旧文件清理**（manifest 有、本次无 → 删除）
  - `vrn doctor` 对比 manifest 与当前工具链版本，提示需重生成
- `vrn doctor`：检测 Xcode / xcodegen / swiftc、JDK / gradle / ANDROID_HOME / adb，缺什么给**可执行修复命令**（对齐本会话踩过的 MIUI/ANDROID_HOME 坑）

## 四、P3 —— Vite 插件与脚手架

`@vrn/vite-plugin`（薄封装，不承载构建编排）：

```ts
vrn({ entry, outDir, platform: 'ios', watch: true })
```
- `configureServer`：挂 `/__vrn/screens`、`/__vrn/router`、`/__vrn/ir`、`/__vrn/asset` 中间件（复用现有 preview 实现）→ 边写 Vue 边看手机壳预览
- `handleHotUpdate` + 自定义命令 `vrn:gen`：只重生成受影响页面（依赖 manifest）
- `closeBundle`：可选触发一次全量 codegen（不调用 xcodebuild/gradle，交由 `vrn build --run`）

`create-vrn-app`：模板 = Vue 工程骨架（`src/pages/*.vue` + `router.ts` + `vrn.config.ts` + npm scripts），`npx create-vrn-app my-app` 后 `npm run native:ios` 直接出工程。

## 五、P4 —— 发布与示例仓库

- 包元数据：`exports`（含 `types`）、`files` 白名单、`peerDependencies`（`vue` 仅 plugin/preview、`vite` 仅 plugin）、`engines.node >= 18`
- `@vrn/compiler` 与 `@vrn/templates` 版本联动（模板版本参与 manifest 校验）；changesets 管理版本与 CHANGELOG
- CI：typecheck + vitest + 生成产物编译（Linux 上只能跑 Kotlin 侧，Swift 侧 macOS runner）
- 示例仓库（GitHub template）与文档站：`examples/` 作为在线预览入口；README 三段式——「快速上手（脚手架）」「仓库内开发」「作为工具链接入既有 Vue 工程」
- 安装期零原生编译（全部为文本模板）——这是本项目作为 npm 包的核心优势，需在 README 明示

## 六、风险与对策

| 风险 | 对策 |
|---|---|
| 搬迁导致产物回归 | P1 出口用「生成产物逐字节等价」判定；先搬路径不改逻辑 |
| 用户工程与仓库内开发双形态漂移 | CLI 只认 `vrn.config.ts` + cwd，仓库脚本改为调用同一 CLI |
| 模板与工具链版本错配 | manifest 记录 templateVersion + `vrn doctor` 校验 |
| 平台工具链缺失导致体验断裂 | doctor 先行；`vrn build --run` 失败时原样透传平台日志尾部 |
| npm 包体积 | 只发 `src`/`assets`（文本），`compiler/generated` 与 `examples` 不入包 |

## 七、P4 发布清单（含实测阻塞）

**阻塞 0（必须先解决）**：当前各包 `exports` 指向 `./src/*.ts` —— npm 消费者无法直接消费 TS 源码。
发布前必须产出 `dist/*.js` + `*.d.ts`，`exports` 改为 `{ types, import }` 指向 dist；`bin` 指向编译后的入口。

**阻塞 1（环境）**：本会话沙箱内 `npm` 无法读写 `~/.npm/_cacache`（EPERM，工作区外 root 权限污染）
→ `npm whoami` / `npm publish` / `npm pack` 需在**用户终端**执行，或批准一次完全访问权限。

**阻塞 2（命名）**：`@vrn/*` scope 归属未确认（npm scope 必须属于当前账号/组织）。需用户确认最终 scope 名。

**发布步骤（待执行）**
1. 各包加构建脚本（`tsc -p tsconfig.build.json` → `dist/`，或 tsup），补 `types`/`main`/`exports`/`files`
2. `@vrn/cli` 的 `bin` 指向 `dist/cli.js`（`bin/vrn.mjs` 已支持 dist 优先），并在 `dependencies` 声明 `@vrn/compiler`、`@vrn/templates`
3. `npm pack --dry-run` 逐包校验内容（只含 dist + README + assets）
4. `npm publish --access public`（scope 包需 `--access public`）；版本 `0.1.0`，changesets 管理后续
5. 发布后冒烟：临时目录 `npm i @vrn/cli@0.1.0 && npx vrn gen ios`（在用户终端）

**license / repository / author** 字段待用户提供。

## 八、包命名落地（2026-10 · 用户已确认）

用户 npm 账号 `dongmingzhixiu`（个人，无组织）→ scope = `@dongmingzhixiu`，产品名 `vuexir`：

| 目录 | 包名 | bin |
|---|---|---|
| `packages/cli` | `@dongmingzhixiu/vuexir` | `vuexir`、`vrn` |
| `packages/compiler` | `@dongmingzhixiu/vuexir-compiler` | — |
| `packages/templates` | `@dongmingzhixiu/vuexir-templates` | — |
| `packages/vite-plugin` | `@dongmingzhixiu/vuexir-vite-plugin` | — |
| `packages/create-vrn-app` | `create-vuexir`（保持非 scope：`npm create vuexir` 体验最佳） | `create-vuexir` |

- 一键改名/补元数据：`node scripts/rename-scope.mjs @dongmingzhixiu vuexir`（同步内部依赖、根脚本、`tsconfig.paths`、`node_modules` 链接；`none` 模式可切非 scope）
- 已补元数据：`license: MIT`、`engines.node >= 18`、`publishConfig.access = public`、cli 双 bin
- 源码内包名引用已全部切换（8 个文件）

**create-vuexir 已可用**（P3 完成项）：`node packages/create-vrn-app/bin/create.mjs <dir>` → 生成 `src/router.ts` + `pages/{Home,About}.vue` + `vrn.config.ts` + package.json（含 `native:gen` / `native:build` 脚本）；工程名按分段 PascalCase 推导（`my-vuexir-app → MyVuexirApp`）。实测：脚手架工程 → `vuexir gen ios|android` 双端产物正确（`PRODUCT_BUNDLE_IDENTIFIER: com.example.myvuexirapp`）。

**仍待做（发布前必做）**：`dist` 构建（`tsc`/`tsup`）+ `exports` 指向 dist + `files` 白名单 → `npm pack --dry-run` → 用户终端 `npm publish --access public`（scope 包）后冒烟 `npm i @dongmingzhixiu/vuexir && npx vuexir gen ios`。

## 九、发布就绪状态（2026-10 · 可发布）

**已完成**
- LICENSE（MIT · Copyright (c) 2026 panvu）落根目录与 5 个包
- `scripts/build-packages.mjs`：按依赖序（compiler → templates → cli → vite-plugin）用 `tsc` 产出 `dist/*.js` + `*.d.ts`；构建 tsconfig 关闭 `paths`（避免把别包源码拉进 program）→ 走 node_modules 软链 + `exports` 读依赖包 dist
- ESM 规范：源码相对导入全部补 `.js`（含 `import()` 动态导入），否则 dist 在 Node 下 `ERR_MODULE_NOT_FOUND`
- 跨包引用统一为包名（`@dongmingzhixiu/vuexir-compiler` / `-templates`），发布后不再依赖仓库相对路径
- `exports` → dist（`types` 在 `import` 前）；`files` 白名单；`bin.vuexir`/`bin.vrn` → `bin/vrn.mjs`（内部已实现 dist 优先、无 dist 回退 vite-node）
- 包名确认：`create-vuexir` 未被占用（`npm view` 404 = 可用）

**已验证**：`node -e "import('@dongmingzhixiu/vuexir-compiler')"` → 28 导出；`node packages/cli/bin/vrn.mjs doctor` ✓；`… gen android|ios --out /tmp/vrn-dist-check` 均成功；`vue-tsc` 0 error；`vitest` 145/145

**发布步骤（用户终端执行，不可逆）**
```bash
cd packages/compiler    && npm publish --access public
cd ../templates         && npm publish --access public
cd ../cli               && npm publish --access public
cd ../vite-plugin       && npm publish --access public
cd ../create-vrn-app    && npm publish --access public
```
冒烟：`cd /tmp && npx create-vuexir smoke && cd smoke && npm i && npx vuexir gen ios`

**尚缺（不阻塞首发）**：`repository` 字段（等你给 GitHub 地址）；运行时桥模板继续外置；增量重生成；Vite 插件 HMR。
