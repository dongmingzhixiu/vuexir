# @vrn/compiler

Vue SFC → IR → 原生源码（SwiftUI / Compose）的编译器核心。**纯函数、零 IO**。

```ts
import { vueToIr, validateIr, generateScreenSource, buildNavHost } from '@vrn/compiler'

const { screen, runtime, warnings } = vueToIr(sfcSource, { screenId: 'Home' })
if (!validateIr(screen).ok) throw new Error('IR 校验失败')
const swift = generateScreenSource(screen, { runtime: 'Runtime.forPage("Home")' })
```

| 导出 | 用途 |
|---|---|
| `vueToIr` | SFC（含 `<script setup>` / `<style>` / 组件）→ IR + runtime.js |
| `validateIr` / `parseAndValidateIr` | IR 结构与交叉引用校验（R15：宁编译期报错，不静默降级） |
| `parseCss` / `mergeIrProps` | CSS 子集 → IR props（含单边边框/内距的按边深合并） |
| `generateScreenSource` / `generateComponentSource` | IR → SwiftUI 源码 |
| `emitNode` / `buildNavHost` / `parseRouter` | IR → Compose 源码与导航宿主 |

> 形态说明：本包不产出运行时可 `import` 的组件——产物是**原生工程源码**；预览器与 Vite 集成见 `@vrn/vite-plugin`。
