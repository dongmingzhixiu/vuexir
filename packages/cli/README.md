# @vrn/cli

```bash
npx vrn build ios        # Vue SFC → IR → Swift 源码 →（--run 时）xcodegen + xcodebuild
npx vrn build android    # 同上，产出 Compose 源码 → gradle assembleDebug
npx vrn gen ios          # 只生成源码，不调用平台构建
npx vrn doctor           # 环境自检：Xcode / xcodegen / JDK / ANDROID_HOME / adb（P2）
npx vrn preview          # 多页预览器（P3 起由 @vrn/vite-plugin 承载）
```

配置（`vuexir.config.ts`，P1 落地）：

```ts
export default {
  entry: 'src/router.ts',
  outDir: 'native',
  projectName: 'MyApp',
  bundleId: 'com.example.myapp',
}
```
