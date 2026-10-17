# P0 闭环验证报告（PERF-P0 · 2026-10-14）

> 验证目标：**IR → 生成 SwiftUI 源码 → 独立 Xcode 工程 → 编译 → 模拟器渲染** 全链路成立。
> 验证环境：Xcode 26 / Swift 6.2 / iPhone 17 模拟器（402x874 pt，@3x）· 全量测试 48/48 通过。

---

## 一、验证结论（总）

| 验收项 | 结果 | 证据 |
|---|---|---|
| IR 样例通过 Schema 校验 | ✅ | `compiler/tests/ir.schema.test.ts` 10/10 |
| 生成器产出可编译 Swift 源码 | ✅ | `swiftc -parse` 零错误；`xcodebuild` **BUILD SUCCEEDED** |
| 独立原生工程（无旧代码引用） | ✅ | 工程 Sources 仅 `App.swift + ScreenView.swift + recite.json`，bundle id=`com.vrn.recitedemo` |
| 模拟器渲染出完整 UI | ✅ | 标题/副标题/三卡片/底部按钮，品牌色与描边圆角正确 |
| 布局无溢出/无裁剪 | ✅ | 卡片满宽（126~845/1000）、按钮贴安全区底部（908/1000） |
| 与设计稿（360x640）语义一致 | ✅ | 结构、层级、间距比例、颜色 token 一致 |

**结论：P0 最小闭环成立——"手写 IR → 原生源码 → 独立编译运行" 这条最难后端链路已验证通过。** 后续 P1 可安全接 Vue 官方 AST 转换器（R13/R14）。

## 二、模拟器渲染核对（OCR 坐标，千分比）

```
y:88   心法阁（鎏金 #d9b36c · 22pt bold）
y:134  已收录 3 部功法 · 今日已诵 12 句（#9aa3ba · 13pt）
y:180  卡片1《心经》 + 经文          ┐
y:274  卡片2《金刚经》 + 经文          ├ 面板 #070b16 · radius 12 · 鎏金描边 0.16
y:368  卡片3《楞严咒》 + 经文          ┘
y:908  录入新功法（鎏金底 · 深色文字 · radius 10 · 高 44）← 贴安全区底部
```

- 卡片文字满宽（左 114~126 / 右 732~845），padding 16 生效
- 副标题与标题间距 12（gap）生效
- 背景全屏 #04060d；ScrollView 区域（卡片下方至按钮）为滚动空间

## 三、发现的布局坑（已修复，记入规则）

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| L1 | ScrollView 内容不满屏时按钮悬空/内容不占满剩余 | SwiftUI 中 ScrollView 在 VStack 内需要显式 `minHeight: 0` 才能正确压缩/拉伸（经典坑） | 生成器 flex 子节点统一输出 `.frame(minHeight: 0, maxHeight: .infinity)`（row 主轴对应 minWidth:0 + maxWidth:.infinity） |
| L2 | root 直接子节点未撑满全屏 | root(ZStack) 内子容器默认按内容尺寸 | root 分支对直接子节点追加 `.frame(maxWidth:.infinity, maxHeight:.infinity)`（对齐 flex alignItems:stretch） |

> 探针验证：`/tmp/vrn_layout_probe2.png`（最小复现确认 L1 修复路径正确）。

## 四、差异清单（Canvas 基准 vs 原生渲染，P0 未做像素级对拍）

| 差异项 | 说明 | 状态 |
|---|---|---|
| 状态栏/安全区 | SwiftUI 视图含系统状态栏与安全区（原生常态），Canvas 预览无 | 预期行为，非缺陷 |
| padding 归属 16pt | 生成器 frame/padding 修饰顺序导致按钮贴底位置与理想值差约 16pt | 已记录，P1 校准映射表（R18） |
| 字体渲染 | 系统字体（SF）vs Canvas 预览字体渲染存在微差 | P1 三端截图对拍校准（R18） |
| ScrollView 滚动区 | 内容不足一屏时上方留白为滚动空间（原生常态） | 预期行为 |

## 五、未覆盖项（P0 边界，P1 处理）

- **breakpoints 适配**：多宽度（320/360/375/390/414/428）未跑，R16 适配矩阵待 P1
- **image 真实加载**：image 节点为占位（RoundedRectangle），真实 drawImage 链路待 P1
- **scroll 交互验证**：滚动行为未实测（样例内容不足一屏）
- **数据绑定/事件**：bind/events 仅占位，双模式派发待运行时阶段
- **Android（Compose）端**：P1 对拍补充
- **Canvas 黄金基准对拍**：现有引擎渲染 IR 的能力（读 IR JSON → Canvas）待开发，P0 用结构核对代替

## 六、产物清单

```
compiler/generated/ios/
├── project.yml                     # xcodegen 声明（bundle id=com.vrn.recitedemo）
├── ReciteDemo.xcodeproj            # 生成的独立 Xcode 工程
├── ReciteDemo/
│   ├── App.swift                   # 入口（@main）
│   ├── ScreenView.swift            # 生成器现场产出（干净，无旧代码）
│   └── recite.json                 # IR 样例资源
└── build/                          # xcodebuild 产物（Debug-iphonesimulator）
```
