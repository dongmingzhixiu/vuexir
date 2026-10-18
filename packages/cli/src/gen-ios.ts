/**
 * gen-ios.ts —— iOS 工程生成脚本（P1-lite 主入口）
 *
 * 输入：Vue SFC（默认 compiler/samples/hello/Hello.vue）或 IR JSON（.json 后缀）
 * 管线：Vue SFC → (vueToIr) → IR → (validateIr) → SwiftUI 源码 + 独立 Xcode 工程
 *
 * 运行：
 *   npx vite-node compiler/scripts/gen-ios.ts                    # 默认 Hello.vue
 *   npx vite-node compiler/scripts/gen-ios.ts path/My.vue        # 指定 Vue 文件
 *   npx vite-node compiler/scripts/gen-ios.ts path/screen.ir.json  # 或手写 IR
 *
 * 产物：compiler/generated/ios/<ProjectName>/{App.swift, ScreenView.swift, recite.json, project.yml}
 * 后续：cd compiler/generated/ios/<ProjectName> && xcodegen generate && xcodebuild ...
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundlePageScript, bundleProjectUtils } from './bundle.js';
import { TEMPLATE_VERSION, VRN_BRIDGE_SWIFT, projectYml as PROJECT_YML, templateFiles } from '@dongmingzhixiu/vuexir-templates';
import { parseRouter as parseRouterV2, findProjectRoot } from '@dongmingzhixiu/vuexir-compiler';
import { validateIr } from '@dongmingzhixiu/vuexir-compiler';
import type { IrScreen, IrNode } from '@dongmingzhixiu/vuexir-compiler';
import { generateScreenSource, generateComponentSource, collectTheme, buildTheme, generateThemeSource, VRN_HELPERS_SWIFT } from '@dongmingzhixiu/vuexir-compiler';
import { vueToIr, VueCompileError } from '@dongmingzhixiu/vuexir-compiler';

// R-PKG：产物与样例根不再假设仓库布局（CLI 通过 VRN_OUT_DIR / VRN_SAMPLES_ROOT 注入）
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// 安装形态下 <pkg>/dist/../../.. 不是仓库根，样例根不可靠 → 存在才用，否则退回 cwd（显式入口优先）
const SAMPLES_ROOT = (() => {
  const fromEnv = process.env.VRN_SAMPLES_ROOT;
  if (fromEnv) return fromEnv;
  const repoLike = join(ROOT, 'examples');
  return existsSync(repoLike) ? repoLike : process.cwd();
})();
/** 工具链版本（manifest 记录；与 @dongmingzhixiu/vuexir 版本同步） */
const TOOLCHAIN_VERSION = '0.1.0';
/** 样例根（可写副本：generateIos 可用 opts.samplesRoot 覆盖） */
let SAMPLES_ROOT_MUT = SAMPLES_ROOT;
/** CLI 注入的工程名/包名覆盖（vrn.config 的 projectName/bundleId） */
let FORCED_PROJECT_NAME: string | undefined;
let FORCED_BUNDLE_ID: string | undefined;
const DEFAULT_INPUT = join(SAMPLES_ROOT_MUT, 'vuexir-demo'); // 多页目录模式默认样例
let OUT_ROOT = process.env.VRN_OUT_DIR ?? join(ROOT, 'compiler/generated/ios');

const RUNTIME_SWIFT = `final class Runtime {
    static let shared = Runtime(page: "main")
    /// M4b router 桥：容器注册 push/back 处理器（ContentView onAppear 设置）
    static var routerPushHandler: ((String) -> Void)?
    static var routerBackHandler: (() -> Void)?
    /// M4a 多页：页面 id → 独立 Runtime（独立 JSContext + runtime_<id>.js），状态互不串扰
    private static var pageRuntimes: [String: Runtime] = [:]
    static func forPage(_ id: String) -> Runtime {
        if let r = pageRuntimes[id] { return r }
        let r = Runtime(page: id)
        pageRuntimes[id] = r
        return r
    }
    private let page: String
    private let ctx = JSContext()!
    /// M3：@State 绑定表 —— JS 侧 stateStore.<name> 变更 → 写回 Swift @State
    private var stateBindings: [String: (Any) -> Void] = [:]
    private let defaults = UserDefaults.standard
    /// R72 Promise/定时器：JS setTimeout/setInterval 句柄（clearTimeout/clearInterval 取消用）
    private var jsTimeouts: [Int: DispatchWorkItem] = [:]
    private var jsIntervals: [Int: Timer] = [:]

    init(page: String = "main") {
        self.page = page
        ctx.exceptionHandler = { _, e in
            NSLog("[vrn] JS error: %@", e?.toString() ?? "unknown")
        }
        // JS alert() → 原生 UIAlertController
        let alertBridge: @convention(block) (String) -> Void = { message in
            DispatchQueue.main.async {
                guard
                    let scene = UIApplication.shared.connectedScenes
                        .compactMap({ $0 as? UIWindowScene }).first,
                    let root = scene.keyWindow?.rootViewController
                else { return }
                let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "好", style: .default))
                root.present(alert, animated: true)
            }
        }
        ctx.setObject(alertBridge, forKeyedSubscript: "alert" as NSString)

        // M3 状态写回桥：JS stateStore 属性 set → __setState(name, value) → Swift @State
        let setStateBridge: @convention(block) (String, JSValue) -> Void = { name, value in
            let v: Any
            if value.isNumber { v = Int(value.toInt32()) }
            else if value.isBoolean { v = value.toBool() }
            else { v = value.toString() ?? "" }
            DispatchQueue.main.async {
                self.stateBindings[name]?(v)
            }
        }
        ctx.setObject(setStateBridge, forKeyedSubscript: "__setState" as NSString)

        // M3 localStorage 桥（D7：vrn. 前缀 + UserDefaults 同步读写）
        let lsGet: @convention(block) (String) -> String = { key in
            self.defaults.string(forKey: key) ?? ""
        }
        let lsSet: @convention(block) (String, Any) -> Void = { key, v in
            if v is NSNull { self.defaults.removeObject(forKey: key) }
            else { self.defaults.set(v, forKey: key) }
        }
        ctx.setObject(lsGet, forKeyedSubscript: "__lsGet" as NSString)
        ctx.setObject(lsSet, forKeyedSubscript: "__lsSet" as NSString)

        // M4b fetch 桥：bundle://<resName> → App 内置资源；http(s):// → URLSession（完成回调切主线程调 JS）
        let fetchBridge: @convention(block) (String, JSValue) -> Void = { url, cb in
            NSLog("[vrn] nativeFetch url=%@", url)
            if url.hasPrefix("bundle://") {
                let name = String(url.dropFirst(9))
                var resolved = ""
                if let p = Bundle.main.path(forResource: name, ofType: nil),
                   let d = try? String(contentsOfFile: p, encoding: .utf8) { resolved = d }
                DispatchQueue.main.async {
                    NSLog("[vrn] nativeFetch bundle resolved len=%d", resolved.count)
                    cb.call(withArguments: [resolved != "" ? true : false, resolved != "" ? resolved : "资源 \(name) 未找到"])
                }
            } else if let u = URL(string: url) {
                URLSession.shared.dataTask(with: u) { data, _, err in
                    let ok = err == nil && data != nil
                    let body = ok ? String(data: data!, encoding: .utf8) ?? "" : (err?.localizedDescription ?? "error")
                    DispatchQueue.main.async { cb.call(withArguments: [ok, body]) }
                }.resume()
            } else {
                DispatchQueue.main.async { cb.call(withArguments: [false, "bad url"]) }
            }
        }
        ctx.setObject(fetchBridge, forKeyedSubscript: "__nativeFetch" as NSString)

        // R72 Promise/定时器桥：JS 侧 setTimeout/setInterval → DispatchQueue/Timer 到期回调 JS 入口
        // （JS shim 定义 __nativeSetTimeout(id, ms) 与 __vrnRunTimer(id)；JS 上下文固定主线程访问）
        let setT: @convention(block) (Double, Double) -> Void = { id, ms in
            let key = Int(id)
            let work = DispatchWorkItem { [weak self] in
                self?.jsTimeouts[key] = nil
                self?.ctx.objectForKeyedSubscript("__vrnRunTimer")?.call(withArguments: [key])
            }
            self.jsTimeouts[key] = work
            DispatchQueue.main.asyncAfter(deadline: .now() + Swift.max(ms, 0) / 1000.0, execute: work)
        }
        ctx.setObject(setT, forKeyedSubscript: "__nativeSetTimeout" as NSString)
        let clearT: @convention(block) (Double) -> Void = { id in
            self.jsTimeouts[Int(id)]?.cancel()
            self.jsTimeouts[Int(id)] = nil
        }
        ctx.setObject(clearT, forKeyedSubscript: "__nativeClearTimeout" as NSString)
        let setI: @convention(block) (Double, Double) -> Void = { id, ms in
            let key = Int(id)
            self.jsIntervals[key]?.invalidate()
            let t = Timer.scheduledTimer(withTimeInterval: Swift.max(ms, 16) / 1000.0, repeats: true) { [weak self] _ in
                self?.ctx.objectForKeyedSubscript("__vrnRunInterval")?.call(withArguments: [key])
            }
            self.jsIntervals[key] = t
        }
        ctx.setObject(setI, forKeyedSubscript: "__nativeSetInterval" as NSString)
        let clearI: @convention(block) (Double) -> Void = { id in
            self.jsIntervals[Int(id)]?.invalidate()
            self.jsIntervals[Int(id)] = nil
        }
        ctx.setObject(clearI, forKeyedSubscript: "__nativeClearInterval" as NSString)

        // R81 原生桥宿主函数：bridge.toast / bridge.openUrl（编译期注入的 VrnBridge.swift 提供实现）
        let nativeToast: @convention(block) (String) -> Void = { msg in
            VrnBridge.toast(msg)
        }
        ctx.setObject(nativeToast, forKeyedSubscript: "__nativeToast" as NSString)
        let nativeOpenUrl: @convention(block) (String) -> Void = { url in
            VrnBridge.openUrl(url)
        }
        ctx.setObject(nativeOpenUrl, forKeyedSubscript: "__nativeOpenUrl" as NSString)
        // R84 桥能力扩展：震动 / 剪贴板 / 状态栏 / 屏幕常亮
        let nativeVibrate: @convention(block) (Double) -> Void = { ms in
            VrnBridge.vibrate(Int(ms))
        }
        ctx.setObject(nativeVibrate, forKeyedSubscript: "__nativeVibrate" as NSString)
        let nativeCopy: @convention(block) (String) -> Void = { text in
            VrnBridge.copy(text)
        }
        ctx.setObject(nativeCopy, forKeyedSubscript: "__nativeCopy" as NSString)
        let nativeSetStatusBar: @convention(block) (String) -> Void = { style in
            VrnBridge.setStatusBar(style)
        }
        ctx.setObject(nativeSetStatusBar, forKeyedSubscript: "__nativeSetStatusBar" as NSString)
        let nativeKeepScreenOn: @convention(block) (Bool) -> Void = { on in
            VrnBridge.keepScreenOn(on)
        }
        ctx.setObject(nativeKeepScreenOn, forKeyedSubscript: "__nativeKeepScreenOn" as NSString)

        // M4b router 桥：router.push('/path') / router.back() → 容器导航（静态 handler 由 ContentView onAppear 注册）
        let routerPush: @convention(block) (String) -> Void = { path in
            DispatchQueue.main.async { Runtime.routerPushHandler?(path) }
        }
        ctx.setObject(routerPush, forKeyedSubscript: "__routerPush" as NSString)
        let routerBack: @convention(block) () -> Void = {
            DispatchQueue.main.async { Runtime.routerBackHandler?() }
        }
        ctx.setObject(routerBack, forKeyedSubscript: "__routerBack" as NSString)

        // R116：页面键既可能是 main（容器）也可能是页面 id → 两个候选都试，
        // 否则 tab 页会去找 runtime.js 而实际文件是 runtime_<Page>.js（旧版直接不加载脚本）
        var resName = page == "main" ? "runtime" : "runtime_" + page
        var found = Bundle.main.path(forResource: resName, ofType: "js")
        if found == nil {
            let alt = page == "main" ? "runtime_Home" : "runtime"
            if let p2 = Bundle.main.path(forResource: alt, ofType: "js") { found = p2; resName = alt }
        }
        if let path = found {
            NSLog("[vrn] loading %@", resName)
            if let src = try? String(contentsOfFile: path, encoding: .utf8) {
                // R117：JSC 会静默吞掉脚本异常 → 显式检查并打印，否则运行时错误完全不可见
                var jsErr: JSValue?
                ctx.evaluateScript(src, withSourceURL: URL(string: "vrn://" + resName + ".js"))
                if let e = jsErr, !e.isUndefined {
                    let stack = e.objectForKeyedSubscript("stack")?.toString() ?? ""
                    NSLog("[vrn] JS 异常(%@): %@ | %@", resName, e.toString() ?? "?", stack)
                }
            } else { NSLog("[vrn] read %@ failed", resName) }
        } else { NSLog("[vrn] %@ NOT in bundle", resName) }
        let om = ctx.objectForKeyedSubscript("__onMounted")
        NSLog("[vrn] __onMounted exists: %@", (om != nil && !om!.isUndefined) ? "yes" : "NO")
        let hf = ctx.objectForKeyedSubscript("__nativeFetch")
        NSLog("[vrn] has __nativeFetch: %@", (hf != nil && !hf!.isUndefined) ? "yes" : "NO")
        let hfType = hf?.toString() ?? "nil"
        NSLog("[vrn] __nativeFetch value: %@", hfType)
    }

    /// M3 注册 @State 绑定：JS stateStore.<name> 写回 → <setter>（onAppear 时由 View 注册）
    func bindState(_ name: String, _ setter: @escaping (Any) -> Void) {
        stateBindings[name] = setter
    }

    /// M3 Swift → JS 推送：@State 变更（v-model 输出等）→ stateStore 同步（__fromSwift 防回环）
    func pushState(_ name: String, _ value: Any) {
        let lit: String
        if let s = value as? String {
            // 反斜杠→引号→控制字符（\\n\\r\\t 原样内插会截断 JS 字符串字面量）
            let escaped = s.replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
                .replacingOccurrences(of: "\\"", with: "\\\\\\"")
                .replacingOccurrences(of: "\\n", with: "\\\\n")
                .replacingOccurrences(of: "\\r", with: "\\\\r")
                .replacingOccurrences(of: "\\t", with: "\\\\t")
            lit = "\\"\\(escaped)\\""
        } else if let n = value as? Int { lit = String(n) }
        else if let b = value as? Bool { lit = b ? "true" : "false" }
        else { lit = "\\(value)" }
        ctx.evaluateScript("__fromSwift = true; stateStore.\\(name) = \\(lit); __fromSwift = false")
    }

    /// 调用 <script> 里声明的 handler（@click="inc" → inc()；带参表达式如 inc(1) 原样执行）
    func invoke(_ name: String) {
        NSLog("[vrn] invoke %@ on page %@", name, page)
        if name.contains("(") { ctx.evaluateScript(name) }
        else { ctx.evaluateScript("\\(name)()") }
    }

    /// R-LOOPITEM：v-for 项点击时把当前 item 注入 JS 全局 __vrnLoop，
    /// invoke 表达式里的循环变量引用（goDetail(row.item.id)）才能求值
    func setLoopItem(_ value: Any) {
        guard let json = try? JSONSerialization.data(withJSONObject: value),
              let s = String(data: json, encoding: .utf8) else { return }
        let escaped = s.replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
            .replacingOccurrences(of: "\\"", with: "\\\\\\"")
            .replacingOccurrences(of: "\\n", with: "\\\\n")
        ctx.evaluateScript("__vrnLoop = JSON.parse(\\"\\(escaped)\\")")
    }
}
`;

const APP_SWIFT = (projectName: string, viewName: string, screenTitle: string) => `import SwiftUI
import UIKit
import JavaScriptCore

${RUNTIME_SWIFT}


/// ${projectName} 入口 —— 由 vue-render-native 编译器生成
@main
struct ${projectName}App: App {
    init() {
        _ = Runtime.shared // M4b：启动即初始化运行时（桥注入先于任何 onAppear）
        // R68：全局深色导航栏——push/返回转场期间不白闪；标题浅色可读（页面级 toolbarBackground 仍可覆盖）
        configureGlobalNavigationBar()
    }
    var body: some Scene {
        WindowGroup {
            // M7：单页也包 NavigationStack——navBar 配置（navigationTitle/toolbarBackground）生效的前提
            NavigationStack {
                ${viewName}()
                    .preferredColorScheme(.dark)
            }
        }
    }
}

/// R68：全局 UINavigationBar 深色外观（背景 #0a0f1e、浅色标题、金色 tint）
func configureGlobalNavigationBar() {
    let appearance = UINavigationBarAppearance()
    appearance.configureWithOpaqueBackground()
    appearance.backgroundColor = UIColor(red: 10/255.0, green: 15/255.0, blue: 30/255.0, alpha: 1)
    let titleColor = UIColor(red: 233/255.0, green: 230/255.0, blue: 221/255.0, alpha: 1)
    appearance.titleTextAttributes = [.foregroundColor: titleColor]
    appearance.largeTitleTextAttributes = [.foregroundColor: titleColor]
    UINavigationBar.appearance().standardAppearance = appearance
    UINavigationBar.appearance().scrollEdgeAppearance = appearance
    UINavigationBar.appearance().compactAppearance = appearance
    UINavigationBar.appearance().tintColor = UIColor(red: 217/255.0, green: 179/255.0, blue: 108/255.0, alpha: 1)
}
`;


/** 屏/工程名 → PascalCase（my-app → MyApp；用于 Swift 类型名与 bundle id 派生） */
function toIdentifier(id: string): string {
  return id
    .split(/[^A-Za-z0-9]/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

/** M7 容器级 navBar 聚合：hex → Swift Color 表达式 */
function swiftColorExpr(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `Color(red: ${r}/255.0, green: ${g}/255.0, blue: ${b}/255.0)`;
}
function swiftStrEscape(x: string): string {
  return x.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
/** M7：TAB 容器 navBar 聚合修饰符（ZStack 叠加下页面级修饰符竞争，改由容器按 selected 驱动） */
function tabNavBarModifiers(
  tabs: {
    title: string;
    navBar?: { mode?: 'fixed' | 'transparent' | 'scroll'; title?: string; bg?: string; immersive?: boolean };
    rootBg?: string;
  }[],
): string {
  const mods: string[] = [];
  // R68：标题挂容器动态（selected 条件）——页面常驻 ZStack 时页面级标题会取第一个不跟随；
  // 颜色由页面级 toolbarColorScheme 兜底（容器级在 iOS 26 不生效）
  const titleExpr =
    tabs.map((t, i) => `selected == ${i} ? "${swiftStrEscape(t.navBar?.title ?? t.title)}"`).join(' : ') +
    ` : "${swiftStrEscape(tabs[0]?.navBar?.title ?? tabs[0]?.title ?? '')}"`;
  mods.push(`        .navigationTitle(${titleExpr})`);
  // 多 tab 导航栏背景统一三元链（R68 续：不再只取第一个 fixed/transparent）：
  //   fixed+bg → 具体色；transparent → Color.clear（透明）；其余 → Color.clear（系统默认由页面级兜底）
  //   全链统一 Color 类型（混 .hidden/.visible 会与 Color 类型冲突编译失败）
  const bgExpr = tabs
    .map((t, i) => {
      const m = t.navBar?.mode;
      if (m === 'fixed' && t.navBar?.bg) return `selected == ${i} ? ${swiftColorExpr(t.navBar.bg)}`;
      if (m === 'transparent') return `selected == ${i} ? Color.clear`;
      return null;
    })
    .filter((x): x is string => x !== null);
  if (bgExpr.length > 0) {
    mods.push(`        .toolbarBackground(${bgExpr.join(' : ')} : Color.clear, for: .navigationBar)`);
  }
  // scroll 模式：所有 scroll tab 动态 large，其余 inline
  // 无 scroll tab 时全站强制 inline（R68 续：默认 large 标题模式在 Pro 机型上会多占约 2 个灵动岛高度，
  // 标题下沉、内容区被压；inline 使导航栏贴状态栏、内容紧贴栏下，接近 Vue 移动端页面观感）
  const scrollTabs = tabs.map((t, i) => (t.navBar?.mode === 'scroll' ? i : -1)).filter((i) => i >= 0);
  if (scrollTabs.length > 0) {
    mods.push(`        .navigationBarTitleDisplayMode(${scrollTabs.map((i) => `selected == ${i} ? .large : `).join('')}.inline)`);
  } else {
    mods.push(`        .navigationBarTitleDisplayMode(.inline)`);
  }
  // immersive：每个 immersive tab 独立延伸背景到状态栏（多 tab 可并存）
  const immTabs = tabs
    .map((t, i) => (t.navBar?.immersive ? { i, bg: t.navBar?.bg ?? t.rootBg ?? '#0a0f1e' } : null))
    .filter((x): x is { i: number; bg: string } => x !== null);
  if (immTabs.length > 0) {
    mods.push(`        .background(Group {`);
    for (const x of immTabs) {
      mods.push(`            if selected == ${x.i} { ${swiftColorExpr(x.bg)}.ignoresSafeArea(edges: .top) }`);
    }
    mods.push(`        })`);
  }
  return mods.join('\n');
}

/** R40 组件表：输入 .vue 同目录 components/*.vue → { PascalCase 名: SFC 源码 }
 *  R-VFOBJ：并向上查找样例根 components/（共享组件目录，如 vuexir-demo/components/VirRow.vue） */
/** R86 扫描工程内的 Pinia store 源码（src/stores/*.ts），供编译器做状态折叠 */
function loadStoreSources(anchor: string): Record<string, string> {
  const table: Record<string, string> = {};
  let up = anchor;
  for (let i = 0; i < 6 && up !== dirname(up); i++) {
    for (const cand of [join(up, 'stores'), join(up, 'src', 'stores')]) {
    if (existsSync(cand)) {
      for (const f of readdirSync(cand)) {
        if (!/\.(ts|js|mts)$/.test(f)) continue;
        table[f] = readFileSync(join(cand, f), 'utf-8');
      }
      if (Object.keys(table).length > 0) return table;
    }
    }
    up = dirname(up);
  }
  return table;
}

function loadComponents(input: string): Record<string, string> {
  const dirs = new Set<string>();
  const local = join(dirname(input), 'components');
  if (existsSync(local)) dirs.add(local);
  // 向上查找样例根（<samplesRoot>/<proj>/components）：从 input 逐级上溯，命中最顶层（不含 samples 的父级）
  let up = dirname(input);
  for (let i = 0; i < 6 && up !== dirname(up); i++) {
    const cand = join(up, 'components');
    if (existsSync(cand) && readdirSync(cand).some((f) => f.endsWith('.vue'))) dirs.add(cand);
    up = dirname(up);
  }
  const table: Record<string, string> = {};
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.vue')) continue;
      const name = f.slice(0, -4);
      table[toIdentifier(name)] = readFileSync(join(dir, f), 'utf-8');
    }
  }
  return table;
}

/** 解析输入参数 → 一个 .vue/.json 输入路径（支持 all / 样例名 / 路径） */
function resolveInput(arg: string | undefined): string | null {
  if (!arg) return DEFAULT_INPUT;
  if (arg === 'all') return null; // 由 main 特殊处理
  if (arg.endsWith('.vue') || arg.endsWith('.json')) {
    return arg.startsWith('/') || /^[A-Za-z]:[\\/]/.test(arg)
      ? arg
      : join(process.cwd(), arg);
  }
  // 样例名 → <samplesRoot>/<name>/App.vue
  const byName = join(SAMPLES_ROOT_MUT, arg, 'App.vue');
  return existsSync(byName) ? byName : null;
}

function runOne(input: string): string | undefined {
  if (!input.endsWith('.vue') && !input.endsWith('.json')) {
    console.error('[gen-ios] 仅支持 .vue 或 .json 输入');
    process.exit(1);
  }

  // 1) 输入 → IR
  let screen: IrScreen;
  let runtimeSrc: string | undefined;
  let components: { name: string; ui: IrNode }[] = [];
  if (input.endsWith('.vue')) {
    console.log(`[gen-ios] 读取 Vue SFC: ${input}`);
    try {
      // 屏 id 优先取目录名（<samplesRoot>/my-app/App.vue → my-app → MyApp）
      // 文件名非 App.vue/Screen.vue 时退回文件名
      const fileName = basename(input, '.vue');
      const dirName = basename(dirname(input));
      const idSource =
        (fileName === 'App' || fileName === 'Screen') && dirName && dirName !== 'samples'
          ? dirName
          : fileName;
      const r = vueToIr(readFileSync(input, 'utf-8'), {
        storeSources: loadStoreSources(input),
        screenId: toIdentifier(idSource),
        title: idSource,
        // R41 组件表：同目录 components/*.vue（PascalCase 文件名 → SFC 源码）
        components: loadComponents(input),
      });
      screen = r.screen;
      runtimeSrc = r.runtime;
      components = r.components ?? [];
      if (r.warnings.length > 0) {
        console.log(`[gen-ios] 编译提示（${r.warnings.length} 条）:`);
        for (const w of r.warnings) console.log(`  - ${w}`);
      }
    } catch (e) {
      if (e instanceof VueCompileError) {
        console.error(`[gen-ios] Vue 编译失败: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  } else {
    const parsed = JSON.parse(readFileSync(input, 'utf-8')) as IrScreen;
    screen = parsed;
  }

  // 2) IR 校验（Schema）
  const v = validateIr(screen);
  if (!v.ok) {
    console.error('[gen-ios] IR 校验失败:');
    for (const i of v.issues) console.error(`  ${i.path}: ${i.message}`);
    process.exit(1);
  }
  console.log(`[gen-ios] IR 校验通过: ${screen.id} (${screen.width ?? 360}x${screen.height ?? 640})`);

  // 3) 生成 SwiftUI 源码 + 工程文件
  // 目录结构（xcodegen sources 约定）：
  //   generated/ios/<ProjectName>/project.yml
  //   generated/ios/<ProjectName>/<ProjectName>/{App.swift, ScreenView.swift, recite.json}
  const projectName = FORCED_PROJECT_NAME ?? toIdentifier(screen.id);
  const viewName = `${projectName}View`;
  const bundleId = FORCED_BUNDLE_ID ?? `com.vrn.${projectName.toLowerCase()}`;
  const outDir = join(OUT_ROOT, projectName);
  const srcDir = join(outDir, projectName);
  // 写前清空源目录（重生成不留旧组件/运行时文件）
  rmSync(srcDir, { recursive: true, force: true });
  mkdirSync(srcDir, { recursive: true });

  const genWarnings: string[] = [];
  // R42：收集页面 + 组件全树颜色/字体 → Theme.swift token；codegen 引用 Theme.*
  const themeTokens = collectTheme(screen.ui, ...components.map((c) => c.ui));
  const theme = buildTheme(themeTokens);
  const themeSrc = generateThemeSource(theme);
  const cssVars = loadCssVars(input);
  const swift = generateScreenSource(screen, { warnings: genWarnings, theme, cssVars });
  if (genWarnings.length > 0) {
    console.log(`[gen-ios] 布局降级提示（${genWarnings.length} 条，R-H3/H4/H5）:`);
    for (const w of genWarnings) console.log(`  - ${w}`);
  }
  writeFileSync(join(srcDir, 'ScreenView.swift'), swift);
  writeFileSync(join(srcDir, 'App.swift'), APP_SWIFT(projectName, viewName, screen.title));
  writeFileSync(join(srcDir, 'recite.json'), JSON.stringify(screen, null, 2));
  // 事件运行时（<script setup> 逻辑源码；无逻辑时生成空文件保持 Bundle 引用成立）
  writeFileSync(join(srcDir, 'runtime.js'), runtimeSrc ?? '');
  // R41 组件：每个 components/Xxx.vue → 独立 XxxView.swift（struct XxxView；页面引用 XxxView(attrs)）
  const compFiles: { name: string; bytes: number }[] = [];
  for (const comp of components) {
    const compWarnings: string[] = [];
    const src = generateComponentSource(comp.name, comp.ui, { warnings: compWarnings, theme, cssVars });
    writeFileSync(join(srcDir, `${comp.name}View.swift`), src);
    compFiles.push({ name: `${comp.name}View.swift`, bytes: src.length });
  }
  // R42 Theme token：颜色/字体抽离（去重常量，页面与组件共享引用）
  writeFileSync(join(srcDir, 'Theme.swift'), themeSrc);
  writeFileSync(join(srcDir, 'VrnHelpers.swift'), VRN_HELPERS_SWIFT);
  writeFileSync(join(srcDir, 'VrnBridge.swift'), VRN_BRIDGE_SWIFT);
  writeFileSync(join(outDir, 'project.yml'), PROJECT_YML(projectName, bundleId));
  writeManifest(outDir, 'ios', projectName, bundleId, ['ScreenView.swift', ...compFiles.map((f) => f.name), 'Theme.swift', 'App.swift', 'project.yml', 'runtime.js', 'recite.json']);
  console.log(`[gen-ios] 已生成工程: ${outDir}`);
  console.log(`[gen-ios]   - ${projectName}/ScreenView.swift (${swift.length} bytes)`);
  for (const cf of compFiles) console.log(`[gen-ios]   - ${projectName}/${cf.name} (${cf.bytes} bytes) · R41 component view`);
  console.log(`[gen-ios]   - ${projectName}/Theme.swift (${themeSrc.length} bytes) · R42 tokens（${theme.colorNames.size} 色 / ${theme.fontNames.size} 字体）`);
  console.log(`[gen-ios]   - ${projectName}/App.swift / runtime.js / recite.json / project.yml (bundleId=${bundleId})`);
  console.log('');
  console.log(`[gen-ios] 下一步:`);
  console.log(`  cd ${outDir}`);
  console.log('  xcodegen generate');
  console.log('  # 模拟器（跳过签名，脚本内部已带 CODE_SIGNING_ALLOWED=NO）');
  console.log("  xcodebuild -project *.xcodeproj -scheme <名称> -configuration Debug \\");
  console.log("    -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build build CODE_SIGNING_ALLOWED=NO");
  console.log('  # 真机（自动签名，需已登录开发者账号并连接设备）');
  console.log('  #   npm run ios -- --device <硬件UDID> <样例名>   （或 Xcode 打开工程 → Signing 选 Team → Run）');

  return outDir;
}

/** M4a：TabView 多页 App.swift（router.ts 顶层 tab routes → 原生 TabView） */
const TAB_APP_SWIFT = (
  projectName: string,
  tabs: {
    id: string;
    title: string;
    icon: string;
    states: { name: string; type: 'string' | 'number' | 'boolean'; init: string | number | boolean }[];
    onMounted: boolean;
    navBar?: { mode?: 'fixed' | 'transparent' | 'scroll'; title?: string; bg?: string; immersive?: boolean };
    rootBg?: string;
  }[],
  details: { id: string; title: string; view: string; path: string }[] = [],
  rootBg = '#0a0f1e',
) => `import SwiftUI
import UIKit
import JavaScriptCore

${RUNTIME_SWIFT}

/// M4a 多页入口：router.ts 顶层 tab routes → 原生 tab 容器
/// 说明：不依赖系统 TabView——iOS 26 TabView 子视图按内容高度建议，页面背景无法铺满内容区；
/// 改为 VStack{ 页面区(剩余高度) + 底部 tab bar(固定 56pt) }，页面 root ZStack 拿满建议高度，背景铺满。
/// 页面实例常驻 ZStack（opacity 切换），@State 跨 tab 保留。
/// M4b：页面状态提升到容器——ZStack 嵌套页面（iOS 26 模拟器）onAppear/.task 不触发，
/// 由容器（WindowGroup 直接子视图）onAppear 统一注册绑定 + 触发各页 onMounted。
struct ContentView: View {
    @State private var selected = 0
${details.length > 0 ? `    @State private var pushedRoute: String?` : ''}
${tabs
  .flatMap((t) => t.states.map((s) => ({ ...s, page: t.id })))
  .map(
    (s, i) =>
      `    @State private var p${i}_${s.name}: ${
        s.type === 'string' ? 'String' : s.type === 'boolean' ? 'Bool' : 'Int'
      } = ${s.type === 'string' ? `"${swiftStrEscape(String(s.init))}"` : s.type === 'boolean' ? (s.init ? 'true' : 'false') : typeof s.init === 'number' ? String(s.init) : '0'}`,
  )
  .join('\n')}

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
${tabs
  .map(
    (t, i) =>
      `                ${toIdentifier(t.id)}View(${t.states
        .map((s, j) => `${s.name}: $p${flatIndex(tabs, i, j)}_${s.name}`)
        .join(', ')})
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .opacity(selected == ${i} ? 1 : 0)
                    .allowsHitTesting(selected == ${i})`,
  )
  .join('\n')}
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack(spacing: 0) {
${tabs
  .map(
    (t, i) =>
      `                Button(action: { selected = ${i} }) {
                    VStack(spacing: 2) {
                        Image(systemName: "${t.icon}")
                        Text("${t.title}").font(.system(size: 10))
                    }
                    .foregroundColor(selected == ${i} ? Color(red: 217/255.0, green: 179/255.0, blue: 108/255.0) : Color(red: 168/255.0, green: 174/255.0, blue: 194/255.0))
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)`,
  )
  .join('\n')}
            }
            .frame(height: 56)
            .background(Color(red: 16/255.0, green: 24/255.0, blue: 40/255.0))
            .overlay(Divider(), alignment: .top)
            }
            // R68：容器背景兜底——页面内容不足或底部安全区不露白
            .background(${swiftColorExpr(rootBg)})
${details.length > 0
  ? `            .navigationDestination(item: $pushedRoute) { route in
                Group {
${details
  .map(
    (d) =>
      `                    if route == "${d.path}" { ${d.view}() }`,
  )
  .join('\n')}
                }
            }`
  : ''}
${tabNavBarModifiers(tabs)}
            .onAppear {
${tabs
  .flatMap((t) => t.states.map((s) => ({ ...s, page: t.id })))
  .map(
    (s, i) =>
      `            Runtime.forPage("${s.page}").bindState("${s.name}") { v in p${i}_${s.name} = v as? ${
        s.type === 'string' ? 'String' : s.type === 'boolean' ? 'Bool' : 'Int'
      } ?? p${i}_${s.name} }`,
  )
  .join('\n')}
${tabs
  .filter((t) => t.onMounted)
  .map((t) => `            Runtime.forPage("${t.id}").invoke("__onMounted")`)
  .join('\n')}
${details.length > 0
  ? `            Runtime.routerPushHandler = { path in pushedRoute = path }
            Runtime.routerBackHandler = { pushedRoute = nil }`
  : ''}
            }
        }
    }
}

@main
struct ${projectName}App: App {
    init() {
        _ = Runtime.shared // M4b：启动即初始化运行时（桥注入先于任何 onAppear）
        // R68：全局深色导航栏——push/返回转场期间不白闪；标题浅色可读
        configureGlobalNavigationBar()
    }
    var body: some Scene {
        WindowGroup {
            ContentView()
                // R68：深色 scheme——底部安全区/Home 指示条区域默认深色，不露白
                .preferredColorScheme(.dark)
        }
    }
}

/// R68：全局 UINavigationBar 深色外观（背景 #0a0f1e、浅色标题、金色 tint）
func configureGlobalNavigationBar() {
    let appearance = UINavigationBarAppearance()
    appearance.configureWithOpaqueBackground()
    appearance.backgroundColor = UIColor(red: 10/255.0, green: 15/255.0, blue: 30/255.0, alpha: 1)
    let titleColor = UIColor(red: 233/255.0, green: 230/255.0, blue: 221/255.0, alpha: 1)
    appearance.titleTextAttributes = [.foregroundColor: titleColor]
    appearance.largeTitleTextAttributes = [.foregroundColor: titleColor]
    UINavigationBar.appearance().standardAppearance = appearance
    UINavigationBar.appearance().scrollEdgeAppearance = appearance
    UINavigationBar.appearance().compactAppearance = appearance
    UINavigationBar.appearance().tintColor = UIColor(red: 217/255.0, green: 179/255.0, blue: 108/255.0, alpha: 1)
}
`;

/** 计算页面 state 在全部 state 平铺数组中的下标（TAB_APP_SWIFT 生成 @State 命名 p<i>_<name> 用） */
function flatIndex(
  tabs: { states: { name: string }[] }[],
  tabIdx: number,
  stateIdx: number,
): number {
  let idx = 0;
  for (let t = 0; t < tabIdx; t++) idx += tabs[t].states.length;
  return idx + stateIdx;
}

/** tab 图标映射（meta.icon 缺省按序给系统图标） */
const TAB_ICONS = ['house.fill', 'book.fill', 'gearshape.fill', 'person.fill', 'square.grid.2x2.fill'];

/** 编译期解析 router.ts 子集：import 组件映射 + routes 表（path/name/component/meta.tab/title/icon）
 * M4b：非 tab 路由（无 meta.tab）→ details 列表（router.push → NavigationStack push） */

/** M4a 多页目录模式：samples/<name>/ 含 router.ts + pages/*.vue → TabView 工程 */
/** 加载项目全局 CSS 变量（tokens.css 等 :root 定义）→ 供 parseColor 解析 var(--xxx) */
function loadCssVars(appDir: string): Map<string, string> {
  const root = findProjectRoot(appDir); // appDir 可能是 src/router 等子目录 → 回退到项目根
  const map = new Map<string, string>();
  const roots = [join(root, 'src/styles/tokens.css'), join(root, 'src/tokens.css'), join(root, 'styles/tokens.css'), join(root, 'src/styles/app.css')];
  for (const p of roots) {
    if (!existsSync(p)) continue;
    const css = readFileSync(p, 'utf-8');
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
      map.set(m[1], m[2].trim());
    }
  }
  return map;
}

function runTabs(appDir: string, opts: { routerFile?: string } = {}): string {
  const routerSrc = readFileSync(opts.routerFile ?? join(appDir, 'router.ts'), 'utf-8');
  const { tabs, details, warnings: routerWarnings } = parseRouterV2(routerSrc, findProjectRoot(appDir), opts.routerFile ?? join(appDir, 'router.ts'));
  for (const w of routerWarnings) console.log(`[gen-ios] 路由提示: ${w}`);
  console.log(`[gen-ios] 多页模式: router.ts → ${tabs.length} 个 tab 页面` + (details.length ? ` + ${details.length} 个 push 页面` : ''));

  const cssVars = loadCssVars(appDir);
  const projectName = FORCED_PROJECT_NAME ?? toIdentifier(basename(appDir));
  const bundleId = FORCED_BUNDLE_ID ?? `com.vrn.${projectName.toLowerCase()}`;
  const outDir = join(OUT_ROOT, projectName);
  const srcDir = join(outDir, projectName);
  // 写前清空源目录：删除页面后残留的旧 View/runtime 仍会进 Xcode 工程（幽灵页面）
  rmSync(srcDir, { recursive: true, force: true });
  mkdirSync(srcDir, { recursive: true });

  // R97 P2：把可独立运行的 utils 打成 IIFE，前置到每个页面 runtime 之前，
  // 让 computed 里引用的外部函数（countChars / normalize …）在原生 JS 运行时可用
  const utilsBundle = bundleProjectUtils(findProjectRoot(appDir));
  if (utilsBundle.included.length > 0) {
    console.log(`[gen-ios] utils bundle: ${utilsBundle.included.join(', ')}`);
  }
  for (const sk of utilsBundle.skipped) {
    console.log(`[gen-ios] utils bundle 跳过 ${sk.file}：${sk.reason}`);
  }

  const allUis: IrNode[] = [];
  const pageFiles: string[] = [];
  const pageRuntimes: { id: string; src: string }[] = [];
  const pageStates: {
    id: string;
    title: string;
    icon: string;
    states: { name: string; type: 'string' | 'number' | 'boolean'; init: string | number | boolean }[];
    onMounted: boolean;
    navBar?: { mode?: 'fixed' | 'transparent' | 'scroll'; title?: string; bg?: string; immersive?: boolean };
    rootBg?: string;
  }[] = [];
  let themeTokens;
  const themePieces: { ui: IrNode; comps: { name: string; ui: IrNode }[] }[] = [];

  for (const tab of tabs) {
    const src = readFileSync(tab.file, 'utf-8');
    const pageId = toIdentifier(tab.id);
    const r = vueToIr(src, {
      screenId: pageId,
      title: tab.title,
      components: loadComponents(tab.file),
      storeSources: loadStoreSources(tab.file),
      allowUnknownComponents: true,
    });
    if (r.warnings.length > 0) {
      console.log(`[gen-ios] 编译提示（${tab.id}，${r.warnings.length} 条）:`);
      for (const w of r.warnings) console.log(`  - ${w}`);
    }
    const v = validateIr(r.screen);
    if (!v.ok) {
      console.error(`[gen-ios] IR 校验失败（${tab.id}）:`);
      for (const i of v.issues) console.error(`  ${i.path}: ${i.message}`);
      process.exit(1);
    }
    themePieces.push({ ui: r.screen.ui, comps: r.components ?? [] });
    // 页面 View 源：运行时引用 per-page（JS 上下文隔离）
    // M4b：状态提升到容器（页面用 @Binding、无 onAppear；绑定+onMounted 由容器 onAppear 统一驱动——
    // iOS 26 模拟器上 ZStack 嵌套页面的 onAppear/.task 不触发，容器（WindowGroup 直接子视图）必触发）
    const genWarnings: string[] = [];
    const swift = generateScreenSource(r.screen, {
      warnings: genWarnings,
      theme: undefined,
      cssVars,
      // runtime 页键与 JS 资源名统一用标识符化 pageId（tab.id 可能含非法字符；也避免与 detail 撞名）
      runtime: `Runtime.forPage("${pageId}")`,
      bindingMode: 'external',
    });
    for (const w of genWarnings) console.log(`[gen-ios] 生成提示（${tab.id}，tab 页）: ${w}`);
    // R134：安全网——内部状态名绝不能被当成字符串字面量渲染
    writeFileSync(
      join(srcDir, `${pageId}View.swift`),
      swift.replace(/Text\("(_vrn[EAC][0-9]+)"\)/g, 'Text($1)'),
    );
    // R118：页面脚本 bundle（computed/store 别名/局部函数）必须排在 utils 之后、runtime 之前
    const pageBundle = bundlePageScript(tab.file, findProjectRoot(appDir));
    if (pageBundle) console.log(`[gen-ios] 页面脚本打包：${tab.id}（${pageBundle.names.length} 个绑定）`);
    writeFileSync(
      join(srcDir, `runtime_${pageId}.js`),
      utilsBundle.code + '\n' + (pageBundle?.code ?? '') + '\n' + (r.runtime ?? ''),
    );
    pageFiles.push(`${pageId}View.swift`);
    pageRuntimes.push({ id: pageId, src: r.runtime ?? '' });
    pageStates.push({
      // R72-fix：容器 bindState/invoke 的 page key 必须与运行时文件名一致——
      // 页面视图用 Runtime.forPage("<pageId>")（文件 runtime_<pageId>.js），
      // 容器若用路由名（tab.id）会创建另一个空 JSContext（大小写不一致 → 脚本从未加载）
      id: pageId,
      title: tab.title,
      icon: tab.icon,
      states: (r.screen.state ?? []).map((s) => ({
        name: s.name,
        type: typeof s.init === 'string' ? 'string' : typeof s.init === 'boolean' ? 'boolean' : 'number',
        init: s.init,
      })),
      onMounted: r.screen.onMounted !== undefined,
      navBar: r.screen.navBar,
      rootBg: typeof r.screen.ui.props?.background === 'string' ? (r.screen.ui.props.background as string) : undefined,
    });
    console.log(`[gen-ios]   - ${pageId}View.swift (${swift.length} bytes) · tab「${tab.title}」`);
  }

  // M4b：push 详情页（非 tab 路由）——默认模式（页面自带 @State + onAppear；
  // NavigationStack push 的目标页 onAppear 正常触发，无需状态提升）
  const detailPages: { id: string; title: string; view: string; path: string }[] = [];
  for (const d of details) {
    const src = readFileSync(d.file, 'utf-8');
    const pageId = toIdentifier(d.id);
    // R-VFOBJ-C：detail View 文件名加 Detail 后缀（与 tab 页同名时防覆盖——
    // 如 /comp/form 的 name='form' 与 tab /form 冲突，tabs 先写后 details 覆盖）
    // screenId 同步带 Detail → struct 名 = <Id>DetailView，与文件/view 引用一致（防 Swift 重复声明）
    const viewFile = `${pageId}DetailView.swift`;
    const viewName = `${pageId}DetailView`;
    const r = vueToIr(src, {
      screenId: `${pageId}Detail`,
      title: d.title,
      components: loadComponents(d.file),
      storeSources: loadStoreSources(d.file),
      allowUnknownComponents: true,
    });
    for (const w of r.warnings) console.log(`[gen-ios] 编译提示（${d.id}，push 页）: ${w}`);
    const v = validateIr(r.screen);
    if (!v.ok) {
      for (const i of v.issues) console.error(`  ${i.path}: ${i.message}`);
      process.exit(1);
    }
    themePieces.push({ ui: r.screen.ui, comps: r.components ?? [] });
    const genWarnings: string[] = [];
    const swift = generateScreenSource(r.screen, {
      warnings: genWarnings,
      theme: undefined,
      cssVars,
      // runtime 页键与 tab 页同规则标识符化 + Detail 后缀——
      // tab/detail 同名时（R-VFOBJ-C）JS 资源文件与 forPage 键都独立，不会互相覆盖
      runtime: `Runtime.forPage("${pageId}Detail")`,
    });
    for (const w of genWarnings) console.log(`[gen-ios] 生成提示（${d.id}，push 页）: ${w}`);
    writeFileSync(join(srcDir, viewFile), swift.replace(/Text\("(_vrn[EAC][0-9]+)"\)/g, 'Text($1)'));
    writeFileSync(join(srcDir, `runtime_${pageId}Detail.js`), utilsBundle.code + '\n' + (r.runtime ?? ''));
    pageFiles.push(viewFile);
    pageRuntimes.push({ id: `${pageId}Detail`, src: r.runtime ?? '' });
    detailPages.push({ id: d.id, title: d.title, view: viewName, path: d.path });
    console.log(`[gen-ios]   - ${viewFile} (${swift.length} bytes) · push「${d.title}」`);
  }

  // 合并 Theme（R42）：所有页面 + 组件 token 汇总（跨页共享色板/字体表）
  // M4b：内置资源（books.json 等非 .ts/.vue 文件）随工程打入 App Bundle（fetch bundle://<name> 可读）
  for (const f of readdirSync(appDir)) {
    if (f.endsWith('.ts') || f.endsWith('.vue')) continue;
    const fp = join(appDir, f);
    if (!statSync(fp).isFile()) continue;
    copyFileSync(fp, join(srcDir, f));
    console.log(`[gen-ios]   - 资源 ${f} → Bundle`);
  }
  const theme = buildThemeFromPieces(themePieces);
  writeFileSync(join(srcDir, 'Theme.swift'), generateThemeSource(theme));
  writeFileSync(join(srcDir, 'VrnHelpers.swift'), VRN_HELPERS_SWIFT);
  writeFileSync(join(srcDir, 'VrnBridge.swift'), VRN_BRIDGE_SWIFT);
  // R-VFOBJ：多页组件合并生成（各页组件表去重 → 独立 XxxView.swift；页面引用点已生成）
  const compSeen = new Set<string>();
  for (const p of themePieces) {
    for (const comp of p.comps) {
      if (compSeen.has(comp.name)) continue;
      compSeen.add(comp.name);
      const compWarnings: string[] = [];
      const src = generateComponentSource(comp.name, comp.ui, { warnings: compWarnings, theme, cssVars });
      writeFileSync(join(srcDir, `${comp.name}View.swift`), src);
      console.log(`[gen-ios]   - ${comp.name}View.swift (${src.length} bytes) · R41 component view`);
    }
  }
  writeFileSync(join(srcDir, 'App.swift'), TAB_APP_SWIFT(projectName, pageStates, detailPages, pageStates[0]?.rootBg ?? '#0a0f1e'));
  writeFileSync(join(outDir, 'project.yml'), PROJECT_YML(projectName, bundleId));
  writeManifest(outDir, 'ios', projectName, bundleId, [
    ...pageFiles,
    ...pageRuntimes.map((r) => `runtime_${r.id}.js`),
    'Theme.swift',
    'App.swift',
    'project.yml',
  ]);
  console.log(`[gen-ios] 已生成多页工程: ${outDir}`);
  console.log(`[gen-ios]   - App.swift (TabView ${tabs.length} 页) / Theme.swift / ${pageFiles.join(' / ')}`);
  console.log(`[gen-ios]   - runtime_*.js × ${pageRuntimes.length} / project.yml (bundleId=${bundleId})`);
  console.log('');
  console.log(`[gen-ios] 下一步: cd ${outDir} && xcodegen generate && xcodebuild …（见单页提示）`);
  return outDir;
}

/** M4a 多页 Theme 合并：跨页面共享 token 表 */
function buildThemeFromPieces(pieces: { ui: IrNode; comps: { name: string; ui: IrNode }[] }[]) {
  const colors = new Set<string>();
  const fonts = new Set<string>();
  for (const p of pieces) {
    const t = collectTheme(p.ui, ...p.comps.map((c) => c.ui));
    t.colors.forEach((c) => colors.add(c));
    t.fonts.forEach((f) => fonts.add(f));
  }
  return buildTheme({ colors, fonts });
}

export interface GenerateIosOptions {
  /** 显式路由文件（src/router/index.ts 等非标准命名） */
  routerFile?: string;
  /** 样例名 / 目录 / 显式 .vue 或 .json 路径；'all' 批量；省略 = 默认 vuexir-demo */
  input?: string;
  /** 产物根（<outDir>/<ProjectName>） */
  outDirRoot?: string;
  /** 样例根（默认 examples/） */
  samplesRoot?: string;
  projectName?: string;
  bundleId?: string;
}

/**
 * 生成 iOS（SwiftUI）工程。返回产物目录；失败抛错（不调用 process.exit，便于 CLI 复用）。
 * 说明：本函数沿用既有 main 逻辑（多页/单页/批量），仅把路径来源从「仓库布局」改成可注入。
 */
export function generateIos(opts: GenerateIosOptions = {}): string | undefined {
  // R141：直接给路由文件（src/router/index.ts）时，目录里并没有 router.ts
  // 先注入全局（OUT_ROOT / 工程名 / bundleId），再按入口形态分派
  if (opts.outDirRoot) OUT_ROOT = opts.outDirRoot;
  if (opts.samplesRoot) SAMPLES_ROOT_MUT = opts.samplesRoot;
  if (opts.projectName) FORCED_PROJECT_NAME = opts.projectName;
  if (opts.bundleId) FORCED_BUNDLE_ID = opts.bundleId;
  if (opts.routerFile) return runTabs(dirname(opts.routerFile), { routerFile: opts.routerFile });
  return runMain(opts.input);
}


/** P2：写 .vrn/manifest.json（工具链/模板版本 + 文件清单）并对齐陈旧文件 */
function writeManifest(dir: string, platform: 'ios' | 'android', projectName: string, bundleId: string, files: string[]): void {
  const metaDir = join(dir, '.vrn');
  mkdirSync(metaDir, { recursive: true });
  const manifest = {
    toolchain: TOOLCHAIN_VERSION,
    templateVersion: TEMPLATE_VERSION,
    platform,
    projectName,
    bundleId,
    entry: process.env.VRN_ENTRY ?? '',
    generatedAt: new Date().toISOString(),
    templates: templateFiles(platform),
    files: [...new Set(files)].sort(),
  };
  writeFileSync(join(metaDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function main(): void {
  runMain(process.argv[2]);
}

function runMain(arg: string | undefined): string | undefined {

  // all：生成全部样例（compiler/samples/*/ 含 router.ts 的多页目录）
  if (arg === 'all') {
    const dirs = (existsSync(SAMPLES_ROOT_MUT) ? readdirSync(SAMPLES_ROOT_MUT, { withFileTypes: true }) : [])
      .filter((d) => d.isDirectory() && existsSync(join(SAMPLES_ROOT_MUT, d.name, 'router.ts')))
      .map((d) => join(SAMPLES_ROOT_MUT, d.name));
    if (dirs.length === 0) {
      console.error('[gen-ios] samples 下没有可用的多页样例（含 router.ts）');
      process.exit(1);
    }
    console.log(`[gen-ios] 批量生成 ${dirs.length} 个样例…`);
    let last: string | undefined;
    for (const p of dirs) last = runTabs(p);
    return last;
  }

  // 无参数：默认 vuexir-demo（多页目录模式）
  if (!arg) {
    return runTabs(join(SAMPLES_ROOT_MUT, 'vuexir-demo'));
  }

  // CLI/用户工程：arg 为含 router.ts 的目录（绝对或相对当前工作目录）
  if (arg && existsSync(join(arg, 'router.ts'))) {
    return runTabs(join(arg));
  }
  // 直接给路由文件（src/router/index.ts 等）：用其所在目录 + 显式 routerFile
  if (arg && /\.(ts|js|mts)$/.test(arg) && existsSync(arg)) {
    return runTabs(dirname(arg), { routerFile: arg });
  }
  // 单页工程：arg 为含 App.vue 的目录（Vite 常见结构 src/App.vue）
  if (arg && existsSync(join(arg, 'App.vue'))) {
    return runOne(join(arg, 'App.vue'));
  }

  // M4a 多页目录模式：arg 指向含 router.ts 的目录（如 samples/tabs）
  if (arg && existsSync(join(process.cwd(), arg, 'router.ts'))) {
    return runTabs(join(process.cwd(), arg));
  }
  if (arg && existsSync(join(SAMPLES_ROOT_MUT, arg, 'router.ts'))) {
    return runTabs(join(SAMPLES_ROOT_MUT, arg));
  }
  const input = resolveInput(arg);
  if (!input) {
    console.error(`[gen-ios] 未找到样例「${arg}」`);
    const samples = (existsSync(SAMPLES_ROOT_MUT) ? readdirSync(SAMPLES_ROOT_MUT, { withFileTypes: true }) : [])
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    console.error(`  可用样例: ${samples.join(' / ') || '(无)'}   （或用 all 批量生成）`);
    process.exit(1);
  }
  return runOne(input);
}

// 直接执行（旧脚本用法兼容）；CLI 导入前设置 VRN_NO_AUTO_RUN=1
if (process.env.VRN_NO_AUTO_RUN !== '1') main();
