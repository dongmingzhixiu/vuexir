/** CLI 运行时入口（vite-node 直接加载本文件；bin/vrn.mjs 未编译时也走这里） */
import { run } from './cli.js';

// 生成器模块在 import 时会自动执行，必须先行关闭（见 gen-ios/gen-android 的 VRN_NO_AUTO_RUN）
process.exit(await run(process.argv.slice(2)));
