# runtime/ —— 运行时（P1 预留）

本阶段（P0/P1-lite）为「编译路线」：Vue SFC → IR → 原生源码（iOS SwiftUI 已完成最小闭环）。

- ios/：P1 将放置 iOS 侧运行时（IR 解释器 / 事件桥 / QuickJS 集成，R12）
- android/：P1 将放置 Android 侧运行时（Compose 生成器 / QuickJS）
