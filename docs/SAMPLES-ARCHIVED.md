# samples 历史样例归档说明（2026-10-16）

> 按用户要求，`compiler/samples/` 下仅保留 `vuexir-demo`，其余样例目录已删除。
> 本文档保留各删除样例的功能定位、文件结构与对应能力里程碑，供后续参考/恢复。

## 删除背景

- 用户指令：**samples 下只保留 vuexir-demo 示例目录，其他删除掉**。
- 删除范围：`counter / demo / fetch / hongchen / list / motion / my-app / nav / state / tabs / vant`（共 11 个目录）。
- 同步调整的历史引用：
  - `compiler/tests/ir.schema.test.ts`、`compiler/tests/codegen.swiftui.test.ts`：`SAMPLE_VUE` 由 `samples/my-app/App.vue` 改为 `samples/vuexir-demo/pages/Guide.vue`，断言重写为 Guide 页实际内容（背景 `#0a0f1e`、gap 14、`开发指南 · 5 项`、`GuideView`、cornerRadius 14）。
  - `compiler/scripts/gen-ios.ts`：默认输入与 all 模式改指 vuexir-demo（见该文件）。
  - `scripts/ios-run.sh`、`package.json`：移除对已删样例名（hongchen / my-app）的脚本引用。

## 已删除样例一览

| 目录 | 功能定位 | 关键文件 | 对应能力里程碑 |
| --- | --- | --- | --- |
| `counter` | 计数器交互样例（早期基础交互） | `App.vue` | M1 状态与插值（{{}}/@State/v-model） |
| `demo` | 早期多页 demo | `pages/` `router.ts` `books.json` | M4a 多页 TabView 导航雏形 |
| `fetch` | 网络数据样例（书籍列表） | `App.vue` `books.json` | M4b 网络数据与导航（fetch→URLSession + 动态 v-for） |
| `hongchen` | 红尘历练 · 道印视图（高保真静态 UI） | `App.vue` `components/StatCell.vue` `index.scss` | P0.4/P1 高保真还原、组件文件 |
| `list` | 列表样例 | `App.vue` | M4b 列表渲染 |
| `motion` | 动效/动画样例 | `App.vue` | M5 position/transform/动画 |
| `my-app` | **标准 Vue 工程形态**（「一个屏 = 一个 Vue 工程」） | `App.vue` `components/` `main.ts` `README.md` | P0.4/P1 闭环验证样例（原为测试与 gen-ios 默认输入） |
| `nav` | 多页导航样例（页面交互链参照） | `pages/` `router.ts` | M4a 多页目录模式、router.push 交互链 |
| `state` | 状态管理样例 | `App.vue` | M1/M3 状态桥（stateStore） |
| `tabs` | 多页 tab 样例 | `pages/` `router.ts` `books.json` | M4a 多页 TabView 模式 |
| `vant` | Vant 高频组件映射样例 | `App.vue` | M6 Vant 组件→原生映射 |

## 能力沉淀（不随样例丢失）

以上样例验证出的能力与规则已沉淀在：
- `docs/RULES.md` —— 全部翻译规则/样式子集约束/组件机制（R-* 条目）。
- `compiler/src/`（vue2ir / ir/schema / codegen/swiftui）—— 编译器能力本体。
- `examples/vuexir-demo/` —— 现行唯一样例（多页 demo，含 10 个基础组件详情页 + 7 tab）。
- `compiler/generated/ios/VuexirDemo/` —— 现行生成产物（Xcode 工程）。

若未来需要复现某能力演示，按 RULES.md 对应条目 + vuexir-demo 现有页面结构编写即可，无需恢复旧样例。
