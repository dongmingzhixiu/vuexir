# 1:1 迁移最终状态（第 30 轮 · 交付清单）

> 本文只写**可核对的事实**，每项标注验证等级：
> **【真机】**= iOS 模拟器装机 + OCR/剪贴板实证；**【编译】**= 双端构建通过；**【单测】**= vitest 覆盖；**【未验】**= 仅代码存在。

## 一、结论先行

| 维度 | 完成度 | 说明 |
| --- | --- | --- |
| 框架能力（P0–P4） | **约 85%** | 运行时/打包/表达式/数据层四条腿齐了，均有真机或单测证据 |
| App 页面还原（P5） | **约 8%** | 13 视图里 1 个（Settings）由真实源码直出；其余 8 个是**子集演示页**（共 820 行 vs 真实 4355 行） |
| 组件还原 | **0%** | 8 个业务组件一个都没迁移成原生组件 |
| 数据层 | **约 40%** | 种子数据全链路真机验证；写路径/表索引/迁移逻辑未验 |

**一句话**：工具链已经能跑真实的 Vue 逻辑，但 App 本身远未 1:1——现在是「引擎造好了，车还没造完」。

## 二、框架能力矩阵（P0–P4）

| 能力 | 实现 | 验证等级 |
| --- | --- | --- |
| Android JS 引擎（QuickJS） | `RUNTIME_KT.object VrnJs`（init/eval/drain + `__vrnOut` 协议） | 【编译】模拟器无法启动，行为未验 |
| iOS JS 引擎（JavaScriptCore） | 既有宿主 + runtime_<Page>.js | 【真机】 |
| utils 打包进运行时 | esbuild IIFE + 导出提升到 globalThis（12 个 util） | 【真机】`util：6 字` |
| stores 打包（vue/pinia shim） | 8 个 store 全部进 bundle | 【真机】store 读写往返 |
| dexie shim（数据层） | 内存表 + localStorage 落盘，API 子集 | 【真机】+【单测】 |
| computed 运行时求值 | `__vrnRecompute()` 写回 stateStore | 【真机】`computed：你好·光` |
| 模板表达式下沉 | 生成 `_vrnE<n>` 求值状态 | 【真机】`表达式：你 · 6 字` |
| 异步数据后重算 | 启动后 20×100ms 重算窗口 | 【真机】`数据层：3 条真实记录` |
| 原生桥（toast/openUrl/vibrate/copy/setStatusBar/keepScreenOn） | 编译期注入双端源码 | 【真机】剪贴板 `vrn-bridge-ok` |
| 手机壳浏览器预览 | 随 `vuexir-vite-plugin` 发布，`/__vrn/` | 【编译】Chrome headless 渲染通过 |
| store 静态折叠（R86/R87） | 读 state / 简单 action → 原生赋值 | 【单测】+【编译】 |

**已知能力缺口**（不掩饰）：
1. **求值状态一律字符串化** → 跨表达式算术退化成字符串拼接（`{{ a + 1 }}` 得 `"61"`）
2. **v-for 内复杂表达式**（`item.x ? '' : item.y`）不能下沉，仍走占位
3. **Android 运行时行为完全未验**（本机无虚拟化，模拟器起不来）
4. `where()/orderBy()` 等 shim 未实现，遇到即抛错

## 三、13 个视图真实状态

| 视图 | 原生状态 | 实现方式 |
| --- | --- | --- |
| SettingsView | **真实源码直出**（390 行） | `src/views/SettingsView.vue` 原样拷入，store 折叠 + CSS 降级 |
| HomeView | 子集演示页（123 行） | 手写子集版；含数据层/store/表达式自检 |
| DetailView | 子集演示页（33 行） | 手写子集版 |
| AllListView | 子集演示页（48 行） | 手写子集版 |
| AddBirthdayView | 子集演示页（65 行） | 手写子集版 |
| CalendarView | 子集演示页（46 行） | 手写子集版 |
| DiscoverView | 子集演示页（36 行） | 手写子集版 |
| ReadView | 子集演示页（36 行） | 手写子集版 |
| GrowthView | **未跑通** | `v-for="s in stats"` — computed 调外部函数 |
| FlashView | **未跑通** | `String(Math.min(...)).padStart(2,'0')` |
| ImportView | **未跑通** | `{{ chars }}` — computed 调 `countChars` |
| MapView | **未跑通** | 模板字面量三元 `` `${a.title} · 航线图` `` |
| QuizView | **未跑通** | 自定义标签 `<InkDrops>`（组件未迁移） |

> 注：后 5 个视图**不在 App 路由表内**（`src/router/index.ts` 只有 7 条路由），所以它们未跑通不影响 App 主流程。

## 四、8 个业务组件

`AppDialog` / `AppToast` / `AppTabBar` / `AppStatusBar` / `StarRating` / `InkDrops` / `ResultSheet` / `SmokeRecite`
—— **全部未迁移**。真实源码里被引用 24 次（StarRating 6、SmokeRecite 9、ResultSheet 6、InkDrops 3）。迁移页里一次都没用到。

## 五、数据层与农历逻辑

| 项 | 状态 |
| --- | --- |
| `store.init()` → `db.*` → localStorage → 回填 | 【真机】3 条种子数据（妈妈/爸爸/林晓）渲染到原生界面 |
| 农历算法 `utils/lunar.ts` | 已进 bundle，**未被页面真实调用验证** |
| 日期逻辑 `utils/calendar.ts` | 同上 |
| 数据写入/更新/删除路径 | 【单测】shim 层验证，**未走页面端到端** |

## 六、剩余工作量估算（基于 10 轮实际吞吐）

已完成 10 轮（R94–R103）产出：框架 10 条规则 + 1 个真实页面。

按此吞吐估算 1:1 完成还需要：
- **8 个组件组件化**：约 4–6 轮（每个组件涉及条件渲染、动画、事件总线）
- **13 个视图完整还原 + 视觉比对**：约 8–12 轮
- **v-for 内表达式 + 数值类型修正**：约 2–3 轮
- **Android 运行时实证**：需可虚拟化环境，或真机，本机不可完成
- **合计约 15–20 轮**（是已完成轮次的 1.5–2 倍）

## 七、发布状态

| 包 | 版本 |
| --- | --- |
| `@dongmingzhixiu/vuexir-compiler` | **0.3.9** |
| `@dongmingzhixiu/vuexir-templates` | 0.3.9 |
| `@dongmingzhixiu/vuexir`（CLI） | 0.3.9 |
| `@dongmingzhixiu/vuexir-vite-plugin` | 0.3.9 |
| `create-vuexir` | 0.3.9 |

发布脚本自带「落库轮询 + 内部依赖一致性」校验，本系列每次发布均通过。
