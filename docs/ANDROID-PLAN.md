# Vuexir・vue-android 编译生成规则（设计）

> 2026-10-16・状态：
> **A1–A5 已实现**
>
> （生成器 + Gradle 工程 + 状态 / 事件 /v-for 桥）；真机交互验证需 MIUI「USB 调试（安全设置）」

## 生成脚本命令（vue → Android）

一键链路（推荐）：`bash scripts/android-run.sh`（生成 → 构建 → 安装 → 启动 → 截图，等价下面五步）



```
# 1. 生成 Compose 工程（vuexir-demo → compiler/generated/android/VuexirDemo/）
cd /Users/panvu/sync-file/development/web/vue-render-native
npx vite-node packages/cli/src/gen-android.ts vuexir-demo

# 2. Gradle 构建（AGP 8.5.2 + Kotlin 2.0.21 + Compose BOM 2024.09）
cd compiler/generated/android/VuexirDemo
~/gradle-dist/gradle-8.9/bin/gradle assembleDebug

# 3. 安装真机（MIUI 需开启「USB 安装」）
export ANDROID_HOME=$HOME/Library/Android/sdk
$ANDROID_HOME/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk

# 4. 启动
$ANDROID_HOME/platform-tools/adb shell am start -n com.vrn.vuexirdemo/.MainActivity

# 5. 截图对拍
$ANDROID_HOME/platform-tools/adb exec-out screencap -p > /tmp/vuexir-android.png
```

交互验证（进程内驱动，绕过 MIUI 输入注入限制）：`~/gradle-dist/gradle-8.9/bin/gradle connectedDebugAndroidTest`

> —— 与 iOS 链路对位的 Android 编译生成方案。
> iOS 端现状：Vue SFC →
> `vueToIr`
> → IR →
> `generateScreenSource`
> （SwiftUI）→ xcodegen/xcodebuild → 模拟器。
> Android 端目标：同一份 Vue SFC/IR → Kotlin + Jetpack Compose → Gradle 工程 → 模拟器 / 真机对拍。

## 1. 目标与范围



* **输入**：`examples/vuexir-demo/`（router.ts + pages/*.vue + components/*.vue）—— 与 iOS 完全同一份。

* **输出**：`compiler/generated/android/VuexirDemo/` 完整 Gradle 工程（可 `gradle assembleDebug` 构建、模拟器安装）。

* **复用**：`vueToIr`（Vue→IR）、`validateIr`（schema 校验）、样式子集约束（R-COMPDETAIL-A 11 条）——**两端同一 IR，行为一致**。

* **对拍**：同一页面 iOS SwiftUI 截图 vs Android Compose 截图，像素级 / 视觉级比对，偏差回写规则。

## 2. 技术选型：Kotlin + Jetpack Compose



| 维度     | SwiftUI                       | Compose                                   | 对位关系                        |
| ------ | ----------------------------- | ----------------------------------------- | --------------------------- |
| 声明式 UI | `View`                        | `@Composable`                             | 页面 = Composable 函数          |
| 布局     | `VStack/HStack/ZStack`        | `Column/Row/Box`                          | IR group flexDirection → 容器 |
| 修饰     | `.frame/.padding/.background` | `Modifier.fillMaxSize/padding/background` | 样式 props → Modifier 链       |
| 状态     | `@State`                      | `remember { mutableStateOf }`             | 页面状态类                       |
| 列表     | `ForEach`                     | `items(list)`                             | v-for → items               |
| 导航     | `NavigationStack`             | `NavHost`                                 | router.ts → NavGraph        |
| 图标     | SF Symbols                    | Material Icons / 自定义                      | meta.icon 映射表               |

**选 Compose 理由**：声明式模型与 SwiftUI 语义对齐（IR 层无需分叉），Modifier 链与 SwiftUI 修饰符一一对应，导航 / 列表 / 状态 API 同构，对拍成本最低。

## 3. 编译链路



```
vuexir-demo/ (router.ts + pages/*.vue + components/*.vue)
        │ ① vueToIr（复用，含组件表/v-for 常量/script 状态）
        ▼
      IR Screen[]（validateIr 校验通过）
        │ ② codegen/compose.ts（新增：IR → Kotlin 源码，对位 swiftui.ts）
        ▼
   generated/android/VuexirDemo/
   ├── settings.gradle.kts / build.gradle.kts / gradle.properties
   ├── app/build.gradle.kts
   ├── app/src/main/AndroidManifest.xml
   ├── app/src/main/java/com/vrn/vuexirdemo/
   │   ├── MainActivity.kt            （入口：setContent { VuexirTheme { AppNavHost() } }）
   │   ├── AppNavHost.kt              （router.ts → NavHost + NavigationBar，对位 TAB_APP_SWIFT）
   │   ├── Theme.kt                   （collectTheme → Color token，对位 Theme.swift）
   │   ├── runtime/Runtime.kt         （状态/事件/导航桥，对位 RUNTIME_SWIFT）
   │   ├── pages/<PascalName>View.kt  （tab 页，对位 *View.swift）
   │   ├── pages/comp/<Name>DetailView.kt（push 详情页，对位 *DetailView.swift）
   │   └── components/VirRowView.kt   （共享组件，对位 VirRowView.swift）
```

## 4. IR → Compose 映射规则（核心表）



| IR 节点     | Compose 输出                                      | 关键参数映射                                                                                                                      |
| --------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `root`    | `@Composable fun XxxView(modifier)` + `Surface` | width/height/background → Modifier                                                                                          |
| `group`   | `Column/Row/Box(modifier)`                      | flexDirection→容器；gap→`Arrangement.spacedBy`；padding→`Modifier.padding`；alignItems→`HorizontalAlignment`/`VerticalAlignment` |
| `text`    | `Text(text, ...)`                               | fontSize→`fontSize.sp`；color→`Color(0xFF…)`；fontWeight→`FontWeight`；textAlign→`TextAlign`                                   |
| `button`  | `Button/OutlinedButton/TextButton(onClick)`     | 类型分支；disabled→`enabled=false`；height→`Modifier.height`                                                                      |
| `image`   | `Image/AsyncImage`                              | src 网络→`AsyncImage`；本地→`Image(painterResource)`                                                                             |
| `scroll`  | `LazyColumn` / `Column.verticalScroll`          | flexDirection column→LazyColumn                                                                                             |
| `spacer`  | `Spacer(Modifier.weight(1f))`                   | flex → weight                                                                                                               |
| `divider` | `HorizontalDivider/VerticalDivider`             | height/background                                                                                                           |
| `v-for`   | `items(list) { item -> … }`                     | 常量数组 → `val rows: List<Map<String,String>>`（数据 / 布局分离，对位 R-VFOBJ-D）                                                         |
| `v-if`    | `if (cond) { … }`                               | 条件表达式：`===`→`==`、单引号→双引号（复用 swiftCondExpr 逻辑）                                                                               |
| 组件引用      | `VirRowView(name, desc, onClick)`               | components/\*.vue → 独立 Composable 文件                                                                                        |
| 事件        | `Modifier.clickable {}` / `Button(onClick)`     | onClick → 调用 `Runtime.push(route)` 或状态更新                                                                                    |

### 样式 props → Modifier 链（对齐 R-COMPDETAIL-A 子集）



| CSS 子集           | Modifier                                | 注意                        |
| ---------------- | --------------------------------------- | ------------------------- |
| `padding: 1~4 值` | `Modifier.padding(all/dp)`              | 单写 padding-top 不支持（同 iOS） |
| `gap`            | `Arrangement.spacedBy(dp)`              | 容器级                       |
| `background`     | `Modifier.background(Color)`            | transparent 非法（同 iOS）     |
| `border-radius`  | `Modifier.clip(RoundedCornerShape(dp))` | 圆角需 clip 才生效              |
| `border`         | `Modifier.border(dp, Color, shape)`     |                           |
| `flex`           | `Modifier.weight(f)`                    | 替代百分比宽                    |
| `opacity`（禁用态）   | 暗色 / 灰文字                                | group 不接 opacity（同 iOS）   |

## 5. 运行时桥（Runtime.kt）

对位 RUNTIME\_SWIFT 的 `Runtime`：



```
object Runtime {
  var page = "main"
  // M4b 导航桥：NavHost 注册 push/back
  var pushHandler: ((String) -> Unit)? = null
  var backHandler: (() -> Unit)? = null
  // 状态桥（M3）：页面状态读写，对位 iOS stateStore
  val stateStore = mutableStateMapOf<String, Any?>()
  fun push(route: String) { pushHandler?.invoke(route) }
  fun back() { backHandler?.invoke(Unit) }
  fun setState(key: String, value: Any?) { stateStore[key] = value }
  fun getState(key: String): Any? = stateStore[key]
}
```



* **页面状态**：script setup 的 `ref` → 页面内 `remember { mutableStateOf }`；跨页共享（M3 stateStore）→ Runtime.stateStore。

* **onMounted** → `LaunchedEffect(Unit) { … }`。

* **fetch**（bundle://）→ 本地资源读取（assets）或网络（OkHttp/HttpURLConnection），对位 iOS URLSession。

## 6. 主题系统（Theme.kt）

collectTheme 聚合（对位 iOS 已实现）→ Compose 主题：



```
// 深色鎏金（vuexir-demo 现行）
val Gold = Color(0xFFD9B36C)
val InkBg = Color(0xFF0A0F1E)
val CardBg = Color(0xFF0F1832)
val SubText = Color(0xFFA8AEC2)

object VuexirColors {
  val background get() = InkBg
  val card get() = CardBg
  val accent get() = Gold
  val subText get() = SubText
}
```

所有页面 Composable 引用主题 token，不写死色值（与 iOS Theme.swift 同构）。

## 7. 多页导航（AppNavHost.kt）

对位 TAB\_APP\_SWIFT：



* `router.ts` 顶层 `meta.tab=true` 路由 → `NavigationBar` + `NavHost` 首层 `composable(route)`。

* 非 tab 路由 → push 栈内 `composable(route)`，返回按钮处理。

* 空 tab（如组合式 API 空页）→ 自动隐藏（复用 R-VFOBJ-E 判定）。

* `meta.icon` → Material Icons 映射表（缺省按序给默认图标）。

## 8. 构建与验证



* **依赖**：Android SDK + JDK + Gradle；`gradle wrapper` 固定版本。

* **命令**：



```
npx vite-node packages/cli/src/gen-android.ts vuexir-demo
cd compiler/generated/android/VuexirDemo && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.vrn.vuexirdemo/.MainActivity
adb exec-out screencap -p > /tmp/vuexir-android.png
```



* **对拍**：Android 截图 vs iOS 截图（simctl）逐页比对；偏差回写 RULES.md（对位「按偏差调整翻译规则并回归」）。

* **回归**：`npx vitest run compiler/tests/`（新增 compose 生成器单测，断言关键结构：`@Composable fun ButtonDetailView`、`Column`、`Modifier.padding(16.dp)` 等）+ `vue-tsc --noEmit`。

## 9. 与 iOS 的差异点（需在两端规则中显式标注）



| 能力                  | iOS 现状             | Android 首版              |
| ------------------- | ------------------ | ----------------------- |
| 状态持久化（localStorage） | runtime 桥          | SharedPreferences 对位    |
| 网络图片                | AsyncImage 需实现     | AsyncImage（Coil）        |
| 系统返回手势              | NavigationStack 自带 | BackHandler 显式处理        |
| 安全区                 | safeAreaInset      | WindowInsets 对位         |
| 字体                  | 系统字体               | 系统字体（需 `fontFamily` 映射） |

## 10. 里程碑拆分（建议）



* **A1 工程骨架**：gen-android.ts + Gradle 工程模板 + MainActivity/Theme/NavHost 空跑通（`assembleDebug` 成功）。

* **A2 基础映射**：root/group/text/button/image/spacer/divider + padding/gap/background/cornerRadius → Compose；Guide 页对拍。

* **A3 多页导航**：router.ts → NavHost + NavigationBar + push/back；7 tab 首页对拍。

* **A4 列表与组件**：v-for 常量数组 + components/\*.vue 独立文件（VirRow）；Base 页对拍。

* **A5 状态与事件**：ref/@State、v-model、onClick 状态更新、fetch 桥；交互页（Button/Popup/Toast）对拍。

* **A6 规则回写**：对拍偏差 → RULES.md ANDROID 段；vitest 断言补全。

> 建议 A1–A3 先行（页面静态渲染对拍），A4–A6 后置（交互 / 列表 / 状态）。
## 2026-10-16 追加（A5.1 真机对拍修复轮）
- **tab 选中文字不可见**：Material3 NavigationBarItem 默认配色在深色 bar 上失效 → 显式 `NavigationBarItemDefaults.colors(selectedIconColor/selectedTextColor = Gold, unselected = SubText, indicatorColor = Gold.copy(alpha=0.14f))`，与 iOS 选中金色对齐。
- **点击 row 无 detail 跳转（根因确诊）**：`VirRowView` 等组件文件 root 用 `Modifier.padding(...)` 而非 `modifier.padding(...)`——调用方传入的 `Modifier.clickable { Runtime.push(...) }` 被整体丢弃 → 点击事件丢失。修复：emitNode 加 `useParamModifier`（组件 root depth=1 用 `modifier` 参数拼接 chain，页面内仍用 `Modifier`）。
- **modifier 顺序统一**：paddingModifiers 移到 background/clip/border 之后（SwiftUI `padding().background()` 语义，背景/边框覆盖含 padding 区域），8 处 modChain 调用已改。
- 构建链：gen-android → gradle assembleDebug BUILD SUCCESSFUL → adb install 已到真机（16:16 版）。
