# birthday-app 1:1 迁移方案（R95 起）

## 为什么要换路线

此前走的是「编译期翻译模板表达式」的子集路线：13 个视图里只有 2 个整页编译通过，剩下 11 个卡在
`{{ chars }}`（computed 调外部函数）、`{{ form.name.slice(0,1) }}`（字符串方法）、
`` `${article.title} · 航线图` ``（模板字面量）、`item.x ? '' : item.y`（循环项三元）等。

这些**不是语法糖，而是业务逻辑**——农历计算、倒计时排序、文本分词、等级生成。把它们逐个翻译成
Swift/Kotlin 表达式意味着要在编译器里重写一遍业务代码，既不可能 1:1，也会随 App 演进立刻失效。

**结论：1:1 只能让「真实的 JS 逻辑」在两端跑起来**，编译器退回它擅长的部分——把 template 编译成原生
视图树，数据由 JS 运行时求值后推送给原生。

## 目标架构

```
Vue SFC ──┬─→ template  → IR → SwiftUI / Compose 视图树（静态渲染能力不变）
          └─→ <script setup> + stores + utils → esbuild 打包成 bundle.js
                                   │
                    ┌──────────────┴──────────────┐
              iOS: JavaScriptCore            Android: QuickJS (JNI)
                    │                              │
                    └──── vrnState 桥：JS 求值 → 原生 @State / Compose State ────┘
```

- **渲染**：IR 视图树照旧（布局、样式、导航、列表）。
- **数据**：模板里编译器无法静态翻译的表达式 → 变成 `jsExpr:<key>` 绑定，运行时求值后推送字符串。
- **交互**：`@click` 仍指向 handler 名，JS 运行时执行后统一 `pushState`。
- **持久化**：`localStorage` → 原生 UserDefaults/SharedPreferences（已有 R73）；`Dexie/IndexedDB` →
  运行时 JS 侧的内存实现 + 落盘到原生键值存储（新增）。

## 阶段计划

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **P0 可行性** ✅ | Android 引入 QuickJS 依赖（`app.cash.quickjs:quickjs-android:0.9.2`），渐变不影响现有构建 | `gradle assembleDebug` BUILD SUCCESSFUL（已达成） |
| **P1 JS 运行时打底** | 两端各自加载 `runtime.js`（bundle）并暴露 `__vrn.eval/__vrn.set`；Android 新增 `VrnJs.kt`（QuickJS 封装） | 两端各跑通 `1+1`/状态读写 smoke test |
| **P2 全量脚本打包** | 编译器把 `<script setup>` + `stores/*` + `utils/*`（剔除 DOM/Dexie）用 esbuild 打成单文件，替代现在的「只提取 handlers」 | 页面 `computed` 值能算出来（如 `chars`） |
| **P3 表达式下沉** | 模板表达式无法静态翻译时生成 `jsExpr` 绑定 + 运行时求值推送；覆盖三元/方法调用/模板字面量/字符串方法 | 11 个阻塞页面通过编译 |
| **P4 数据层** | Dexie → 运行时内存实现 + 原生落盘；`utils/lunar.ts`/`calendar.ts` 等纯算法直接进 bundle | 生日数据增删改查在两端一致 |
| **P5 1:1 验证** | 逐页 Web 预览 ↔ iOS ↔ Android 截图/OCR 对比 | 13 个视图全部还原，交互可用 |

## 每轮硬门槛（不变）

`vue-tsc` 0 error · `vitest` 全绿 · `gradle assembleDebug` + `xcodebuild` 双端成功 · 浏览器预览可跑；
每轮结束自行执行 `npm run publish:pkgs -- --bump patch|minor` 发布。

## 已知风险

1. **QuickJS 能力边界**：ES2020 子集，无 `Intl`（农历/日期格式化要自己实现或换 `Date` 基础 API）。
2. **包体积**：QuickJS so 库约 1–2 MB/ABI。
3. **性能**：每次状态变更过桥有开销 → 采用「批量推送 + 变更去重」。
4. **Dexie 依赖**：`indexedDB` 在两端都不存在，需提供 shim（内存表 + 落盘）。
