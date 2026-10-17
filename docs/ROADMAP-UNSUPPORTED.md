# 不支持能力实现路线图（L2/L3 逻辑分仓・全量补齐）

> 目标：把 "当前不支持（编译报错 / 忽略）" 的 WebView 项目主力能力逐项实现，使 Vue3+TS 项目可以按页渐进迁移到 vue-render-native，最终产出
>
> **可脱离 Vue 独立编译上架的原生 App**
>
> 。
> 范围：先 iOS（SwiftUI）单端闭环；Android（Compose）作为后续对拍补充。JS 运行时沿用 
>
> **R12 锁定 = 双端统一 QuickJS**
>
> 。
> 前置：✅ R0–R44 已落地（静态渲染 + 组件独立 View + Theme token 抽离）；模拟器 / 真机全链路可跑。



***

## 一、目标与总原则



| 原则        | 内容                                                     |
| --------- | ------------------------------------------------------ |
| **不静默降级** | 每个新能力沿用 R 系列铁律：**不支持的语法必须在编译期显式报错 / 警告**，绝不静默产出错误的原生代码 |
| **白名单优先** | 表达式 / 指令支持面用白名单定义（编译期校验），不承诺 "任意 JS"                   |
| **先 iOS** | 所有里程碑先在 SwiftUI 端实现并像素验证，Android 对拍后置                  |
| **可审计**   | 每个能力配 vitest 用例 + 模拟器截图验收，回归基线只增不减                     |
| **可迁移判定** | 每个能力落地后同步更新「页面兼容性自查清单」，用户可对老项目逐页打分                     |



***

## 二、不支持能力 → 方案映射总表



| #  | 不支持能力                         | 实现方案                                                      | 里程碑         |
| -- | ----------------------------- | --------------------------------------------------------- | ----------- |
| 1  | `{{ }}` 页面级插值                 | 页面 state 表 + IR `text.bind` → SwiftUI `@State` 引用         | **M1**      |
| 2  | `v-model`                     | 值绑定 + setter 双向（单向先落地，双向随 M3 运行时）                         | **M1**      |
| 3  | `:class` / `:style` 绑定        | :class 表达式白名单扩展；:style 动态键值 → 原生动态修饰符                     | **M2**      |
| 4  | `v-for` 列表动态渲染                | IR `for` 节点 → SwiftUI `ForEach`；静态数组（M2）→ 动态数据源（M4）       | **M2 → M4** |
| 5  | `<script>` 逻辑（状态 / 事件 / 生命周期） | QuickJS 运行时能力扩展：state 读写桥、事件 handler、onMounted            | **M3**      |
| 6  | Pinia / 全局状态                  | `stateStore` 运行时桥（不移植库，映射原生实现）                            | **M3**      |
| 7  | localStorage / WebView bridge | 持久化桥（UserDefaults / 文件）+ 双向 invoke（Swift↔JS）              | **M3**      |
| 8  | Vue Router                    | routes 表 → 原生 `NavigationStack` / `TabView`（push/pop/ 参数） | **M4**      |
| 9  | axios / fetch                 | `http` 桥 → `URLSession`（async/await + QuickJS Promise 桥接） | **M4**      |
| 10 | 组件库（Vant 等）                   | 原生组件映射表（10 个高频组件）+ 注册机制                                   | **M6**      |
| 11 | position / transform          | ZStack 定位 + offset；scale/rotate/translate 原生修饰符           | **M5**      |
| 12 | 动画 /transition                | 指令子集 → SwiftUI 隐式动画 /withAnimation                        | **M5**      |
| 13 | 媒体查询 / 深色模式                   | 设备尺寸 + trait 环境适配                                         | **M5**      |
| 14 | 复杂选择器（后代 / 伪类）                | 样式作用域扩展：后代 / 子选择器 + `:active`/`:hover` 子集                 | **M5**      |
| 15 | 单边边框 / 单边内外边距（发丝线）            | `border-{side}`、`border-{side}-{width,color,style}`、`padding-{side}`、`margin-{bottom,right,left}` → IR `borderSides`/`padding(对象)`/`marginXxx`，两端逐边渲染 | **M10 ✅** |
| 16 | `overflow: hidden`           | IR `clip` → iOS `.clipped()` / Compose `Modifier.clipToBounds()` | **M10 ✅** |
| 17 | `box-shadow` / `letter-spacing` / 文本装饰 / 单行截断 / `flex-wrap` / 渐变背景 / `z-index` | 逐项映射原生修饰符（iOS shadow/tracking/underline/lineLimit/LinearGradient；Compose shadow/letterSpacing/textDecoration/maxLines+overflow/FlowRow/Brush.linearGradient） | **M10** |
| 18 | 异步能力（`fetch` / `setTimeout` / `Promise` / `async`+`await`） | iOS ✅：`fetch` 包 Promise + `setTimeout/setInterval/clear*` 宿主桥（DispatchQueue/Timer → `__vrnRunTimer` 回调 JS）+ `async` 关键字/`onMountedAsync` 全链保留；Android ✅（受限形状）：`await fetch` → `withContext(Dispatchers.IO)`、`JSON.parse` → `org.json.JSONArray`、`setTimeout`/`await new Promise(r=>setTimeout(r,ms))` → `delay`、状态赋值 → Compose state；形状外 warning | **M10 ✅** |



***

## 三、里程碑详述

### M1 — 状态与插值（L2 分仓第一步）

**目标**：静态渲染升级为 "状态驱动的静态 UI"—— 页面可读 `{{ }}`、按钮可切状态。

**方案**：



* `vue2ir.ts`：`<script setup>` 顶层 `ref()`/`reactive()` 常量 → 页面 `state` 表（静态默认值，含类型 string/number/boolean）；`{{ state }}` 从 "报错" 改为生成 `text` 节点 `props.bind`（复用组件 prop 的 ref 机制）

* `schema.ts`：text 节点 bind 校验放宽到页面 state 表

* `swiftui.ts`：ScreenView 增加 `@State private var <name>: <Type> = <默认值>`；`Text(<name>)` 引用；`onSet`（已有）写入对应状态

* `v-model`：input 节点 `props.value` + `onSet`（单向先落地；`@input` 双向随 M3）

**改动文件**：`schema.ts` / `vue2ir.ts` / `swiftui.ts` / `gen-ios.ts` / 测试

**验收**：新建 `samples/state` 样例 —— 含 `{{ count }}`、按钮 `@click="count++"`、`v-model` 输入框；模拟器点击后数字变化、输入框可编辑；vitest 断言 IR 与 Swift 源码；截图留证。

**风险**：插值表达式范围 → 见决策点 D1。

**执行状态（2026-10-15 ✅）**：M1 已落地。`samples/state`（`{{ count }}` 插值 + `@click="inc()"`/`@click="reset()"` 无参表达式 setter + `v-model="note"` 输入回显）→ IR state 表 → `@State` → SwiftUI `Text("\(count)")`/`Text(note)`/`TextField("输入备注…", text: $note)`；iPhone 17 模拟器 BUILD SUCCEEDED，AX 树动态验收 `0→1`、`1→0`、输入 "姑苏云游" 回显同步；vitest 58/58、vue-tsc 0 错；语义规则 R45–R48 已记入 `RULES.md`。**局限**：`@click` 仅支持无参简单表达式（D1 边界）；布尔 / 对象态、模板内多插值混合文本、`v-model` 双向（@input）留待 M2/M3。



***

### M2 — 动态结构与表达式

**目标**：列表可渲染、条件样式可表达。

**方案**：



* `v-for="(item, i) in list"`：`vue2ir` 生成 `for` 节点（`listKey`/`itemKey`/`indexKey`/ 项模板）；**M2 仅支持静态数组字面量**（`in [1,2,3]` 或 `in ['a','b']`）

* `swiftui.ts`：`for` case → `ForEach(0..<n, id: \.self)` + 项模板（item 通过下标 / 字面量注入）；key 缺失 → 编译报错（SwiftUI ForEach 必须显式 id）

* `:class` 表达式白名单：`{ 'a': cond, 'b': !cond }`、三元 `cond ? 'a' : 'b'`、布尔组合（`&&`/`||`）→ 条件真时附加样式类

* `:style` 动态：白名单键（color/fontSize/marginTop…）字面量或 state 引用 → 原生修饰符

* `@click="fn(item)"`：列表项事件参数（item/index 透传给 handler）

**改动文件**：`schema.ts`（for 节点）/ `vue2ir.ts`（v-for + 表达式解析）/ `swiftui.ts`（ForEach + 动态修饰符）

**验收**：`samples/list` 样例 —— 静态数组 v-for 列表 + `:class` 选中高亮 + 点击切换；模拟器滚动与点击正常；vitest 断言。

**依赖**：M1（项模板内插值依赖 bind）。

**执行状态（2026-10-15 ✅）**：M2 已落地。`samples/list`（`v-for="(item, i) in ['云游','炼气','归元','御风']"` + `:class="{ 'row-on': selected == i }"` + `@click="selected = i"` + `:style="{ color: accent }"` + `{{ selected == i ? '✓' : '○' }}`）→ IR `for` 节点 + `active` + `onSet(expr)` + `colorDynamic` + `bindExpr` → Swift `ForEach(0..<4)`/`Button(action: { selected = i })`/`.background(selected == i ? … : …)`/`Color(hex: accent)`/`Text(selected == i ? "✓" : "○")`；iPhone 17 模拟器 BUILD SUCCEEDED，AX 树动态验收：初始 `0,云游,✓`，点击御风 → `3,御风,✓`、首行转 `○`；vitest 65/65、vue-tsc 0 错；语义规则 R49–R53 已记入 `RULES.md`。**边界**：v-for 仅静态数组字面量（动态数据源 → M4）；`:class` 三元假分支降级忽略；`:style` 仅 color/fontSize 动态（白名单外 warning 忽略）；模板内表达式仅三元（其余 D1 扩展）。



***

### M3 — 运行时桥（QuickJS 能力扩展，逻辑分仓 L2 完整）

**目标**：`<script setup>` 里的**纯逻辑**（无副作用）真正在原生侧跑起来。

**方案**：



* `runtime.js`（QuickJS）从 "事件桩" 升级为**状态运行时**：


  * `stateStore`：`ref`/`reactive` 状态注册表，Swift 侧 `@State` 与 JS 侧同步（Swift → JS 推送变化；JS → Swift 经桥更新）

  * 事件 handler：`@click="handlerName()"` 编译为 `Runtime.shared.invoke(...)` 调 QuickJS 中对应函数（已铺路），扩展函数体支持（算术 / 三元 / 字符串操作 / 状态读写）

  * 生命周期：`onMounted` → 原生 `onAppear` 桥接

* **localStorage 桥**：`localStorage.getItem/setItem` → 原生 `UserDefaults`（key 加 `vrn.` 前缀 + schema 版本字段）

* **双向 invoke**：`Runtime.shared.invoke(name, args)`（Swift→JS，已有）+ 新增 `JS→Swift`（状态写回、原生能力调用），经统一 `bridge` 协议

* **Pinia 映射**：不移植库 ——`defineStore` 降级为 `stateStore` 注册（M3 先支持 setup 风格 `ref` state + actions 纯函数）

**改动文件**：`runtime/runtime.js` / `compiler/src/codegen/swiftui.ts`（@State + 桥接线）/ `App.swift` / `gen-ios.ts` / 新增原生桥文件

**验收**：`samples/counter`—— 计数器、表单校验（script 内纯函数）、`onMounted` 初始化、`localStorage` 读写后重进保持；模拟器逻辑正确 + 重启保留；vitest 断言生成源码含桥接线。

**执行状态（2026-10-15 ✅）**：M3 已落地。`samples/counter`（`inc/reset/submit` handler + `onMounted` 恢复 + localStorage 计数 + v-model 校验表单）→ `runtime.js`（`stateStore` Proxy 双向 + `__lsGet/__lsSet` UserDefaults 桥 + handlers + `__onMounted`）→ Swift `Runtime`（`bindState/pushState/invoke`）+ `onAppear`（bindState 注册 + `__onMounted` 触发）+ v-model `onChange` pushState + onSet 赋值后 pushState；iPhone 17 模拟器 BUILD SUCCEEDED，AX 树动态验收：归零→加一 ×2 → `count=2`（JS→Swift ✓）、输入 "姑苏云游"→点校验 → `校验通过：姑苏云游`（Swift→JS ✓）、terminate+relaunch → `count=1` 恢复（localStorage→UserDefaults ✓；count=2→0 首验失败为 UserDefaults 异步落盘 + 强杀丢写，非链路问题）；截图 `/tmp/Counter-m3.png`；vitest 67/67、vue-tsc 0 错；语义规则 R54–R58 已记入 `RULES.md`。**局限**：handler 仅同步语句子集（D1）；Promise/async/fetch 未支持（M4）；Pinia 映射仍为 `stateStore` 注册（同 M3 方案）。

**风险**：JS 表达式执行范围 → D1/D3；QuickJS Promise / 异步 → M4。



***

### M4 — 导航与数据

**执行状态（2026-10-15 M4a ✅ / M4b ✅）**：M4a（多页 TabView 导航）已落地。`samples/tabs`（`router.ts`：`routes` 表 + `meta: { tab: true, title, icon }` 3 条 tab 路由 + `pages/{Home,Library,Settings}.vue`）→ 编译期 `parseRouter`（白名单解析 import 映射 + routes 子集，未知字段忽略）→ 每页独立 `generateScreenSource(runtime: "Runtime.forPage("<id>")")` 生成 `<Page>View.swift` + 独立 `runtime_<id>.js`（JSContext 按页隔离）→ `TabView` App.swift（`tabItem { Label(title, systemImage) }`）+ 跨页 Theme 合并（`buildThemeFromPieces`）；iPhone 17 模拟器 BUILD SUCCEEDED，AX 树动态验收：3 tab（首页 / 书库 / 设置）逐一切换渲染正确、首页「加一」→ `count=0→1`（事件 → pushState → @State → Text 插值，状态不串页）；vitest 67/67、vue-tsc 0 错。**边界**：router 仅 tab 路由（push / 参数 → M4b 的 NavigationStack 部分）；页面数据仍为静态 / 本地 state（fetch 桥 → M4b）；TabView 内页面背景未铺满内容区底部（已知视觉缺口，M4b 一并处理）。

**M4b 执行状态（2026-10-15 ✅，iPhone 17 模拟器 AX 动态验收全链路）**：



* **fetch 桥**：JS 侧 `fetch()` shim（`bundle://` 读内置资源 / `http(s)://` 走 URLSession，Promise 包 `__nativeFetch(String, cb)`）；Swift `Runtime` 注入 `__nativeFetch`（Bundle.main.path + UTF-8 读，回调统一主线程）；Tabs 书库 AX 显示 `books.json` 原文 JSON，日志 `nativeFetch bundle resolved len=122`。

* **动态 v-for 列表**：IR `for.listState` + `props.dynField/bindParts` → Swift `Group { if let arr = try? JSONSerialization… ForEach(Array(enumerated())) }`；书库 AX 显示三行书目（`心法 · 云游诀 · Lv.3 / 剑经 · 归元式 · Lv.5 / 丹方 · 炼气要略 · Lv.2`）。

* **NavigationStack push**：`parseRouter` 拆 `{tabs, details}`；非 tab 路由生成独立 `<Page>View.swift` + `runtime_<id>.js`（默认模式，push 目标页 onAppear 正常触发）；JS `router.push/back` shim → Swift `__routerPush/__routerBack` 桥 → 容器 `.navigationDestination(item:)`；AX 验收：书库「打开详情页」→ 功法详情页（onMounted 文案已换）→ 原生 Back 返回书库。

* **历史三根因修复**：`\(page)` 被 esbuild 转译吃掉 → 字符串拼接；`@Binding private` 致 init 私有 → 去 private；if 语句直接挂 View 修饰符编译错 → 包 Group。

* **生命周期结论**：iOS 26 模拟器 ZStack 嵌套 /opacity 切换页面 `.onAppear/.task` 不触发 → 状态提升到容器（WindowGroup 直接子视图必触发）。

* 资源：`books.json` 等非 .ts/.vue 文件随工程拷入 Bundle（fetch `bundle://` 可读）。vitest 67/67、vue-tsc 0 错。

**目标**：多页 App + 网络数据。

**方案**：



* **Vue Router 映射**：编译期 routes 表（`path → 页面`）→ 原生 `NavigationStack`（push/pop、参数经 `route.params` 桥）；tab 布局 → `TabView`；页面跳转 `router.push` → 原生导航调用

* **axios/fetch 桥**：QuickJS 中 `fetch`/`axios.get` → 原生 `URLSession`（`http` 桥，Promise 桥接 async/await）；超时 / 错误码映射

* **动态数据源 v-for**：列表数据来自 `fetch` 结果 → 原生 `ForEach` + 数据更新（M2 静态数组升级）

**改动文件**：`vue2ir.ts`（routes 表）/ `swiftui.ts`（NavigationStack/TabView）/ `runtime/runtime.js`（fetch/axios shim）/ 原生 `HttpBridge.swift` / `gen-ios.ts`

**验收**：`samples/tabs`——tab 导航 3 页 + 列表页 `fetch` 本地 Mock 数据渲染；模拟器切页 / 返回 / 数据加载正常；vitest。

**依赖**：M3（fetch 需要 Promise 桥）。



***

**M5 执行状态（2026-10-15 ✅，iPhone 17 模拟器 AX 动态验收）**：M5 已落地。`samples/motion`（3 张 `position:absolute` 卡片 top/left + `transform: rotate(12deg)/scale(1.2)` + 按钮 `@click="toggle"`（JS handler `visible.value = !visible.value`）+ `v-show="visible"` 卡片 + `.stage .abs-card` 后代选择器 border + `.btn:active` 按压态 + `@media (prefers-color-scheme: dark)` 深色变体）→ IR `position/absTop/absLeft/transform/show/pressBg` → Swift `ZStack(alignment: .topLeading)`（absolute 父容器无 spacing 参数）+ `.offset/.rotationEffect/.scaleEffect` + `.opacity(visible ? 1 : 0).animation(.easeInOut(duration: 0.25), value: visible)` + `@State private var visible = true`（boolean 态全链贯通：extractScreenState/IR schema/@State/bindState/JS runtime init） + `.overlay(stroke)`（后代选择器命中）+ `PressButtonStyle`（:active 按压背景覆盖）+ `Theme` token（dark media 变体覆盖；light media 降级 warning）；iPhone 17 模拟器 BUILD SUCCEEDED（首建失败根因：ZStack 不接受 spacing 参数 → codegen 已修），AX 树动态验收：六段文本齐备 → 点「切换显示」→ v-show 卡片从 AX 树消失（opacity 0）→ 再点恢复（toggle 双向 ✓）；vitest 67/67、vue-tsc 0 错；语义规则 R61–R64 已记入 `RULES.md`。**边界**：`right/bottom` 绝对定位降级 warning（仅 left/top）；`:hover` 在 iOS 无意义仅解析 `:active`；媒体查询仅 `prefers-color-scheme: dark`（light / 宽度媒体 warning）；transform 仅 scale/rotate/translate 组合。

### M5 — 布局表达扩展

**目标**：position/transform/ 动画 / 媒体查询 / 复杂选择器。

**方案**：



* `position: absolute` → `ZStack` + `offset`/`alignment` 定位（父级 relative 语义映射）

* `transform: scale()/rotate()/translate()` → `scaleEffect/rotationEffect/offset`

* 动画：`transition`/`animation` 指令子集（opacity / 位移 /scale + 时长 / 缓动）→ `withAnimation` 与隐式动画；`keyframes` 暂不支持（报错）

* 媒体查询：设备宽度区间 + `prefers-color-scheme` 深色模式 → SwiftUI `@Environment` trait 适配（Theme 色板支持深色变体）

* 复杂选择器：后代 `a b`、子 `a > b` 组合 + `:active`/`:hover` 伪类子集（映射按压态）；其余伪类 / 属性选择器 → 警告

**改动文件**：`vue2ir.ts`（CSS 解析扩展）/ `swiftui.ts`（定位 / 变换 / 动画 /trait）/ `Theme.swift`（深色变体）

**验收**：`samples/motion`—— 绝对定位卡片 + 缩放 / 旋转 + 点击动画 + 深色模式切换；模拟器与浅 / 深色各截图。

**风险**：动画覆盖范围 → D5；媒体查询完整度 → D6。



***

### M6 — 组件生态

**目标**：Vant 常用组件可直接使用，渲染为原生组件。

**方案**：



* 高频映射表（首批 10 个）：`van-button` `van-cell` `van-field` `van-tabbar` `van-nav-bar` `van-switch` `van-toast` `van-dialog` `van-list` `van-image`

* 每个映射组件：props / 事件 / 插槽定义 → 原生 SwiftUI 实现（沿用 Theme token 风格）；复用 R41 组件注册机制（`components/` 目录 + 使用点校验）

* 未映射组件 → 编译期显式报错（不静默）

**改动文件**：`compiler/src/components/`（原生组件定义表）/ `vue2ir.ts`（组件注册扩展）/ `swiftui.ts`（组件 case 扩展）/ `gen-ios.ts`

**验收**：`samples/vant`—— 用 Vant 风格标签编写 tabbar+cell+switch+toast 页 → 原生渲染与交互全通过；模拟器截图。

**依赖**：M3（组件事件 / 状态）。

**M6 执行状态（2026-10-16 ✅，iPhone 17 模拟器 BUILD SUCCEEDED + 截图视觉验收）**：M6 已落地。映射表 `compiler/src/components/vant.ts`（首批 10 个 van-* 注册，7 个 `impl:true`（button/cell/field/switch/image/tabbar/toast）+ 3 个 `impl:false`（navbar/dialog/list 编译期显式报错不静默）+ `validateVantProps` 白名单校验）→ schema `NODE_TYPES` 加 `'vant'` 节点 + IrProps vant 字段组 → vue2ir 未知标签分支接 `VANT_COMPONENTS` → `vantUseNode`（van-* 属性归一化：title/value/is-link/type/plain/disabled/@click/v-model/子文本 label/van-tabbar 子项 items + 白名单外 warning）→ swiftui `case 'vant'` 原生生成：cell（HStack 行 + chevron 箭头 + `onTapGesture` invoke）、switch（`Toggle("", isOn: $x).labelsHidden()`）、field（label + `TextField`）、button（primary 金底/plain 描边 + `onTapGesture`）、toast（金底胶囊提示）、tabbar（固定底部 3 项 icon+label 高亮）、image（占位圆角卡）；Theme token 由 collectTheme vant 分支补固定色板/字体；`samples/vant` 组合页 → iPhone 17 模拟器 BUILD SUCCEEDED + 装机启动 + simctl 截图视觉验收（云游散人/入世第 7 日/道行 9 点/已诵章句 96 句/绿色开关/备注输入框/保存设置/已保存设置 toast/底部 首页·书库·设置 tabbar 全渲染）；vitest 67/67、vue-tsc 0 错；语义规则 R65 已记入 `RULES.md`。**边界**：tabbar 无点击切页（active 静态，路由切页走 M4a TabView）；toast/dialog 为静态文本胶囊（动态弹层后续）；navbar/dialog/list 注册但原生实现未就绪（编译期显式报错）；AX 树动态交互验收因本机 Computer Use 服务故障改以截图视觉验收（构建/安装/启动链路与 M1–M5 相同已验证）。



***

### M7 — 导航栏与沉浸式（配置参数标准）〔2026-10-16 已完结〕
> 目标：**后续页面开发只需配置参数**即可实现导航栏/沉浸式，零编译器改动。R66。

| 配置（Vue 侧 `<script setup>` 顶层 `const navBar = {...}`） | SwiftUI 生成 |
|---|---|
| `mode: 'fixed'` + `bg: '#0f1832'` | `.toolbarBackground(.visible)` + 导航栏背景色 |
| `mode: 'transparent'` | `.toolbarBackground(.hidden)`——内容穿透导航栏 |
| `mode: 'scroll'` | `.navigationBarTitleDisplayMode(.large)`——大标题滚动自动折叠（系统原生） |
| `immersive: true` | 背景 `.ignoresSafeArea(edges: .top)` 顶到状态栏（仅背景，内容留安全区） |
| `title: '书库'` | `.navigationTitle(...)`（默认取页面 title） |
| `backText: '返回'` | 隐藏系统返回 + 自定义返回按钮（`ToolbarItem` + `onTapGesture dismiss`） |

- 白名单键 `mode/title/bg/backText/immersive`，非法值 warning 忽略（R13）。
- 多页 tab：页面级修饰符在 ZStack 叠加下竞争 → **容器按 `selected` 聚合驱动**（title/displayMode/toolbarBackground/immersive 背景全链路）。
- 单页 App 已包 NavigationStack（navBar 修饰符生效前提）。
- 验收：`samples/nav`（transparent+immersive / scroll / fixed+bg / backText 详情页）iPhone 17 BUILD SUCCEEDED + AX/截图全模式；vitest 67/67、vue-tsc 0 错。
- 已知边界：`scroll` 折叠为系统原生动画（无自定义折叠阈值）；tab 页 fixed bg 由容器聚合（页内 bg 仅详情页生效）；手势/滑动返回样式后续专项。

### M8 — 综合 demo（M1–M7 功能整合）〔2026-10-16 已完结〕
> 目标：把各里程碑能力整合为一个**界面跳转合理、风格样式统一**的可演示 Vue 项目。R67。

- 结构：`samples/demo/` —— 2 tab（`/home` 首页入口分组 + `/settings` 设置）+ 8 push 页（`/counter` 状态与插值、`/list` 数据与列表、`/motion` 布局与动画、`/vant` 组件生态、`/nav-fixed` 固定导航、`/nav-transparent` 沉浸导航、`/nav-scroll` 滚动导航、`/detail` 详情）。
- 首页 5 组入口：基础交互 / 数据与列表 / 布局与动画 / 组件生态 / 导航栏模式（全部 push 跳转）。
- 统一风格 token：深色鎏金（背景 `#0a0f1e`、卡片 `#0f1832`、金色 `#d9b36c`、亮金 `#f5e9c8` 等），圆角 14/8/20 分级。
- 编译器本次修复：① TS 参数类型标注剥除（带参 handler 进 QuickJS）；② 泛型 `ref<X[]>([])` 动态列表识别；③ 样式容器 div 须双层 div+span（group 文本约束）。
- 验收：10 页 BUILD SUCCEEDED + AX 逐页断言 + 截图；全链路（事件/双向/v-show/toast/fetch/push/返回）跑通；vitest 67/67、vue-tsc 0 错。

### M9 — 预览器：多页支持 + 多规格尺寸〔2026-10-16 已完结〕
> 目标：浏览器界面可预览全部样例（含多页 router.ts），并支持多种手机规格尺寸切换。R68。

- 样例双形态：`/__screens` 返回 `{name, mode}`——有 `router.ts` 判 `router`，否则 `single`（App.vue 直接渲染）。
- 新增中间件：`/__router`（router.ts 源码）、`/__comp`（动态 import 302 → `@fs`）、`/__asset`（`bundle://` 资源桥）。
- 自动注入 vue import：样例 `<script setup>` 按编译器约定不 import，transform 插件（enforce:pre）按用到的 API 自动注入，不写回样例。
- `RouterPreview.vue`：正则解析路由表 + 自绘 tab 底栏 + push 栈 + 返回条 + `window.router` shim（与编译器路由桥同形）。
- fetch shim：`bundle://` → `/__asset`，**resolve 字符串**（与 QuickJS fetch 桥语义一致，`JSON.parse(String(data))`）。
- 多规格：iPhone 16 Pro / 15 / SE / Pixel 8 / Galaxy S24 五机型，状态栏（灵动岛/刘海/打孔/无）按机型渲染。
- 验证：demo 首页/push/交互/返回/tab、tabs 书库 bundle 数据、counter 单页全跑通；机型切换视觉生效；回归 vitest 67/67、vue-tsc 0 错。

### M10 — 异步与样式扩展〔进行中〕

**目标**：补齐「写 Vue 的常见需求」中缺口最大的两类——**异步数据能力**（fetch / setTimeout / async-await）与**样式表达**（发丝边框、阴影、字距、文本装饰/截断、换行、渐变、层级）。

**第 1 批（✅ 已完成 · 结构化样式）**
- CSS：`border-{top,right,bottom,left}`、`border-{side}-{width,color,style}`、`border-style`、`padding-{side}`、`margin-{bottom,right,left}`、`overflow: hidden`
- IR：新增 `borderSides`（每边 `{width,color}`）/`clip`/`marginBottom`/`marginRight`/`marginLeft`；`mergeIrProps` 统一按边深合并（同 class 多条声明、跨 class 覆盖都不丢边）
- 双端渲染：iOS `.overlay(alignment:) { Rectangle().fill(c).frame(height|width: w) }` + `.clipped()`；Compose `Modifier.drawBehind { val w = N.dp.toPx(); drawLine(...) }` + `Modifier.clipToBounds()`
- 成效：样例编译提示里 558 条 `border-bottom-*`/`border-style`/`padding-*` 警告**归零**；`gradle assembleDebug` BUILD SUCCESSFUL、`swiftc -typecheck` 0 error；vitest 134/134

**第 2 批（待做 · 视觉样式）**：`box-shadow`、`letter-spacing`、`text-decoration`(underline/line-through)、`font-style: italic`、单行截断（`white-space: nowrap` + `text-overflow: ellipsis`）、`flex-wrap`、`linear-gradient` 背景、`z-index`、`border-radius` 四角独立、`aspect-ratio`。

**第 3 批（✅ 已完成 · Promise / 异步）**
- **iOS（JavaScriptCore 真实运行时，模拟器实测）**
  - `async` 关键字保留：`extractFunctions` 识别 `async function` 并写入 IR `handlers[].async`；`onMounted(async () => {})` 识别为 `onMountedAsync`（生成 `async function __onMounted`）。**此前 `async` 被丢弃 → body 里的 `await` 让整份 runtime.js 解析失败（P0）**
  - 前导脚本注入 `setTimeout/setInterval/clearTimeout/clearInterval/queueMicrotask`（浏览器预览器用原生实现，`typeof … !== "function"` 守卫不覆盖），宿主函数 `__nativeSetTimeout/__nativeSetInterval/__nativeClear*` 由 Runtime 用 DispatchQueue/Timer 实现，到期回调 `__vrnRunTimer/__vrnRunInterval`
  - `fetch` 继续以 Promise 形式暴露（`__nativeFetch` 回调 → resolve/reject），`await fetch(...)`、`.then(...)`、`Promise.all`、`try/catch` 均原生可用
  - 实测（iPhone 17 模拟器，`com.vrn.async`）：`onMounted(async () => { await load(); status += ' ✓' })` → 页面显示 `done ✓`；日志确认 `nativeFetch url=https://jsonplaceholder.typicode.com/todos?_limit=3`；定时器页 `await new Promise(r => setTimeout(r, 800))` → 显示「延时完成」
  - **同时修掉一个回归**：容器 `bindState/invoke` 的 page key 用路由名（`async`）而运行时文件用标识符名（`runtime_Async.js`）→ 大小写不一致，tab 页脚本从未加载（日志 `runtime_async NOT in bundle`）；统一为 `pageId`
- **Android（受限形状协程生成）**：`vrnScope = rememberCoroutineScope()` + `launch {}`；`await fetch(url)` → `withContext(Dispatchers.IO) { java.net.URL(url).readText() }`；`JSON.parse(String(res))` → `org.json.JSONArray(res)`（`.length` → `.length()`）；`state.value = expr` → `state = expr`；`setTimeout(fn, ms)` 与 `await new Promise(r => setTimeout(r, ms))` → `delay(ms)`；`try/catch` → `catch (e: Throwable)`；`console.log` → `Log.d`；async `onMounted` → `LaunchedEffect(Unit) {}`。形状外（带参、`Promise.all` 等）→ TODO 占位 + 编译期 warning（R15）

**验收**：`vue-tsc`+`vitest` 全绿；两端可编译；`samples/async`（真实 HTTP + 定时器 + 加载态）在模拟器/真机跑通；RULES.md 已记 R70–R72。

## 四、里程碑顺序与依赖



```
M1 状态与插值 ──► M2 动态结构与表达式 ──► M3 运行时桥 ──► M4 导航与数据
   │                                        │                │
   └─────────────► M5 布局扩展（可与 M3 并行）◄───────────────┘
                                        │
                                        ▼
                                   M6 组件生态（依赖 M3 事件/状态）
```



* **串行关键路径**：M1 → M2 → M3 → M4（每个里程碑的表达式 / 运行时能力是下一个的基础）

* **可并行**：M5 与 M3 相互独立（CSS 解析 vs JS 运行时）；M6 严格依赖 M3



***

## 五、决策点（需确认，逐条拍板）



| #  | 决策点                               | 建议方案                                                                                |
| -- | --------------------------------- | ----------------------------------------------------------------------------------- |
| D1 | `{{ }}`/`:class`/`:style` 表达式支持范围 | **白名单**：字面量、算术（+ - \* / %）、三元、比较、`&&`/\`                                            |
| D2 | `v-for` key                       | **必须显式 key**（`v-for="(item,i) in list" :key="i"`）；缺失 → 编译报错（SwiftUI ForEach id 硬要求） |
| D3 | `<script>` 逻辑分仓                   | M3 仅支持**纯函数 + 状态读写 + 同步运算**（无副作用、无异步）；async/await、setTimeout 等随 M4 Promise 桥        |
| D4 | 组件库范围                             | 首批 **10 个** Vant 高频组件（M6 列表）；其余编译期显式报错                                              |
| D5 | 动画边界                              | 隐式动画 + `transition` 基础子集（opacity/offset/scale）；手势（拖拽 / 缩放 / 滑动删除）后续专项               |
| D6 | 媒体查询                              | 设备宽度区间 + 深色模式；不做完整 breakpoint 语法                                                    |
| D7 | localStorage 语义                   | 原生 UserDefaults 持久化，`vrn.` 前缀 + 版本字段；同步读写（体积小），异步化后续                                |
| D8 | 迁移判定工具                            | 每个里程碑交付后同步更新「页面兼容性自查脚本」（扫描不支持的指令 / API → 每页可转换度报告）                                  |



***

## 六、验收体系（统一）



| 层   | 方式                                                                     |
| --- | ---------------------------------------------------------------------- |
| 单元  | 每能力新增 vitest 用例（vue2ir 输出 IR 断言 + swiftui 输出源码断言 + schema 校验）；回归基线只增不减 |
| 语法  | 生成 Swift 经 `swiftc -parse` 自验（沿用 R41 机制）                               |
| 渲染  | 每个里程碑 `npm run ios:<样例>` 模拟器截图 + PIL 颜色聚类像素验证（禁用 OCR）                  |
| 真机  | M3 起每里程碑至少一次 `--device` 真机部署（签名链路已通）                                   |
| 端到端 | M4 起与老 WebView 项目逐页对比（结构 / 样式 / 交互还原度报告）                               |
| 迁移  | D8 自查脚本跑老项目 → 每页可转换度评分 → 排迁移优先级                                        |



***

## 七、首个实施建议

从 **M1 的最小闭环**开始：`samples/state` 样例（`{{ }}` + `@click` 状态切换 + `v-model` 输入框）→ 模拟器验证 → 更新 RULES.md（M1 规则确认）→ 再进 M2。节奏与 R 系列一致：**先方案确认 → 实现 → vitest + 截图 → 写规则**。