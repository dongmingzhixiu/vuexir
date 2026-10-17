# P0 最小闭环计划：IR → 原生 App（验证"静态生成原生源码"路线）

> 目标：证明最难的后端链路成立——**手写 IR 样例 → 生成器 → 标准原生工程 → 独立编译 → 真机/模拟器渲染**。
> 范围：仅 iOS（SwiftUI）单端闭环；Android 端作为 P1 对拍补充。
> 前置：✅ `docs/RULES.md` 规则已确认通过（2026-10-14，27 条全通过；R12=双端统一 QuickJS）。

---

## 已确认决策（2026-10-14）

| 决策点 | 结论 |
|---|---|
| JS 引擎（R12） | 双端统一 **QuickJS**，确保最终表达一致 |
| P0 端序 | **先做 iOS**（SwiftUI） |
| bundle id | 最小闭环使用**全新未使用过的标识**：`com.vrn.recitedemo`（避免与已安装 App 冲突；P0.4 工程配置以此为唯一 bundle id） |

> bundle id 命名说明：`com.vrn.recitedemo` 不含既有业务标识，作为独立技术验证 Demo 存在；正式业务 App 后续在 runtime 阶段另行分配。P0.4 起所有工程配置、模拟器安装、签名均使用该 id，不触碰已有安装。

---

## 为什么先做 iOS 单端

| 因素 | iOS | Android |
|---|---|---|
| 本机环境 | Xcode 可用，swiftc 命令行直验 | 需 Android Studio/Gradle 环境（未确认安装） |
| 最小可运行闭环 | 最小 Xcode 工程 + SwiftUI 即可模拟器运行 | 需完整 Gradle + Compose 依赖树，工程重 |
| 生成器验证 | IR→SwiftUI 源码 → swiftc 编译即自验 | IR→Compose 源码 → kotlinc + 依赖链 |
| 决策 | ✅ **P0 先做** | P1 对拍补充 |

## 里程碑总览

| 里程碑 | 内容 | 交付物 | 验收标准 |
|---|---|---|---|
| **P0.1** | 规则确认 + 目录骨架（本轮） | `docs/RULES.md`、`docs/PLAN-P0.md`、目录 | 规则逐条确认通过 |
| **P0.2** | IR Schema v0 + 样例 | `compiler/src/ir/schema.ts`、`compiler/samples/recite/recite.ir.json` | 样例通过 Schema 校验；可在现有 Canvas 引擎预览（黄金基准） |
| **P0.3** | SwiftUI 生成器 v0 | `compiler/src/codegen/swiftui.ts` | 对样例生成源码；`swiftc -parse` 语法检查零错误 |
| **P0.4** | 最小 Xcode 工程骨架 | `compiler/generated/ios/ReciteDemo.xcodeproj` + 源码 | Xcode 打开编译通过；模拟器运行渲染出 UI |
| **P0.5** | 闭环验证 + 对拍 | 模拟器截图 + 对比报告 `docs/PERF-P0.md` | 渲染与 IR 语义一致；无溢出/裁剪；与 Canvas 预览还原度在阈值内 |

---

## P0.2 IR Schema v0（8 个节点，最小集）

```
节点类型：root / group / text / image / button / scroll / spacer / divider
props 子集：width(fill|px) / height / padding / gap / flex / flexDirection /
           justifyContent / alignItems / colors / radius / fontSize / fontWeight /
           textAlign / lineHeight
非布局语义：bind（数据绑定，占位）、events（click → action）、repeat/condition（预留）
禁止：绝对像素宽度写死（R16）、任何原生专属 prop
```

样例：心法阁"功法卡片列表"（3 张卡片 + 标题 + 录入按钮），保持既有视觉 token（R26）。

## P0.3 SwiftUI 生成器 v0

- 递归发射器：IR 节点 → SwiftUI 视图源码字符串（缩进管理）
- 映射表：`group(row/column)→HStack/VStack + spacing/padding`、`text→Text + font/foregroundColor`、`button→Button`、`fill→.frame(maxWidth:.infinity)`、`gap→spacing`、`breakpoints` 暂不实现（P0 单宽度 360）
- 自验：对每个样例 `swiftc -parse` 语法检查

## P0.4 最小 Xcode 工程骨架

```
generated/ios/ReciteDemo.xcodeproj
└── ReciteDemo/
    ├── App.swift                 # @main 入口
    ├── IrModels.swift            # IR JSON 解码模型（Decodable）
    ├── IrParser.swift            # JSON → 节点树
    ├── ScreenView.swift          # 递归生成 SwiftUI 视图（生成器产物可替换处）
    └── recite.json               # IR 样例资源
```
- **bundle id = `com.vrn.recitedemo`**（全新标识，不触碰已安装程序）
- 工程用手写 `.pbxproj`（最小模板）或 `xcodegen`（若本机有）生成；**优先 xcodegen**（声明式、可版本化、避免手写 pbxproj 易碎）

## P0.5 闭环验证

1. `swiftc` / Xcode 编译通过 → 模拟器运行
2. 模拟器截图（xcrun simctl io screenshot）
3. 与 Canvas 预览（现有引擎渲染同一 IR）截图像素对拍：布局/间距/文字位置还原度报告
4. 验收结论写入 `docs/PERF-P0.md`（含未覆盖项：breakpoints 适配、image 真实加载、scroll 交互）

---

## 依赖与风险

| 风险 | 对策 |
|---|---|
| 手写 pbxproj 易碎 | 优先 xcodegen（brew 可装）；失败则最小 pbxproj 模板 |
| SwiftUI 需完整工程才能模拟器运行 | swiftc -parse 先行语法自验，再进 Xcode 跑 |
| 文本渲染与 Canvas 差异（行高/字体回退） | 对拍报告标注差异清单，校准映射表（R18） |
| 本机无 Xcode 命令行工具 | 先查 `xcode-select -p`，缺失则降级为"源码生成 + swiftc 语法自验"验收 |

## 产出目录（本轮已建）

```
vue-render-native/
├── docs/                       # 规则 + 计划 + 后续报告
│   ├── RULES.md                # ← 本轮交付（待确认）
│   ├── PLAN-P0.md              # ← 本轮交付
│   └── PERF-P0.md              # P0.5 生成
├── compiler/                   # 编译工具链（Node/TS，开发期）
│   ├── src/
│   │   ├── ir/schema.ts        # P0.2：IR Schema + 校验器
│   │   ├── transform/          # P1：Vue AST → IR（P0 用手写 IR 绕过）
│   │   ├── analyze/            # P1：script 分仓
│   │   └── codegen/swiftui.ts  # P0.3：SwiftUI 生成器（compose.ts 留 P1）
│   ├── samples/recite/         # P0.2：IR 样例
│   ├── generated/ios/          # P0.4：生成的 Xcode 工程（产出物）
│   ├── generated/android/      # P1：Gradle 工程
│   └── tests/                  # 生成器单测
├── runtime/                    # P1+：原生运行时（IR 解析/派发/JS 引擎）
│   ├── ios/
│   └── android/
└── src/、tests/                # 既有 Canvas 引擎（黄金基准，保持基线）
```

## 执行顺序（确认后开始）

1. ✅ 确认 `docs/RULES.md`（尤其 R12 / P0 端序两个待确认项）
2. P0.2 IR Schema + 样例（半天）
3. P0.3 SwiftUI 生成器（1 天）
4. P0.4 Xcode 工程骨架（1 天，含 xcodegen 或 pbxproj 模板）
5. P0.5 对拍报告（半天）
