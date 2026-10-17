import SwiftUI
import UIKit
import JavaScriptCore

final class Runtime {
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
                    cb.call(withArguments: [resolved != "" ? true : false, resolved != "" ? resolved : "资源 (name) 未找到"])
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

        // M4b router 桥：router.push('/path') / router.back() → 容器导航（静态 handler 由 ContentView onAppear 注册）
        let routerPush: @convention(block) (String) -> Void = { path in
            DispatchQueue.main.async { Runtime.routerPushHandler?(path) }
        }
        ctx.setObject(routerPush, forKeyedSubscript: "__routerPush" as NSString)
        let routerBack: @convention(block) () -> Void = {
            DispatchQueue.main.async { Runtime.routerBackHandler?() }
        }
        ctx.setObject(routerBack, forKeyedSubscript: "__routerBack" as NSString)

        let resName = page == "main" ? "runtime" : "runtime_" + page
        if let path = Bundle.main.path(forResource: resName, ofType: "js") {
            NSLog("[vrn] loading %@", resName)
            if let src = try? String(contentsOfFile: path, encoding: .utf8) {
                ctx.evaluateScript(src)
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
            // 反斜杠→引号→控制字符（\n\r\t 原样内插会截断 JS 字符串字面量）
            let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
                .replacingOccurrences(of: "\t", with: "\\t")
            lit = "\"\(escaped)\""
        } else if let n = value as? Int { lit = String(n) }
        else if let b = value as? Bool { lit = b ? "true" : "false" }
        else { lit = "\(value)" }
        ctx.evaluateScript("__fromSwift = true; stateStore.\(name) = \(lit); __fromSwift = false")
    }

    /// 调用 <script> 里声明的 handler（@click="inc" → inc()；带参表达式如 inc(1) 原样执行）
    func invoke(_ name: String) {
        NSLog("[vrn] invoke %@ on page %@", name, page)
        if name.contains("(") { ctx.evaluateScript(name) }
        else { ctx.evaluateScript("\(name)()") }
    }
}


/// M4a 多页入口：router.ts 顶层 tab routes → 原生 tab 容器
/// 说明：不依赖系统 TabView——iOS 26 TabView 子视图按内容高度建议，页面背景无法铺满内容区；
/// 改为 VStack{ 页面区(剩余高度) + 底部 tab bar(固定 56pt) }，页面 root ZStack 拿满建议高度，背景铺满。
/// 页面实例常驻 ZStack（opacity 切换），@State 跨 tab 保留。
/// M4b：页面状态提升到容器——ZStack 嵌套页面（iOS 26 模拟器）onAppear/.task 不触发，
/// 由容器（WindowGroup 直接子视图）onAppear 统一注册绑定 + 触发各页 onMounted。
struct ContentView: View {
    @State private var selected = 0
    @State private var pushedRoute: String?
    @State private var p0_keyword: String = ""
    @State private var p1_on: Bool = true
    @State private var p2_list: String = "[{ id: 1, name: \"A\", on: true }, { id: 2, name: \"B\", on: true }]"

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                ListView(keyword: $p0_keyword, on: $p1_on, list: $p2_list)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .opacity(selected == 0 ? 1 : 0)
                    .allowsHitTesting(selected == 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack(spacing: 0) {
                Button(action: { selected = 0 }) {
                    VStack(spacing: 2) {
                        Image(systemName: "home.fill")
                        Text("列表").font(.system(size: 10))
                    }
                    .foregroundColor(selected == 0 ? Color(red: 217/255.0, green: 179/255.0, blue: 108/255.0) : Color(red: 168/255.0, green: 174/255.0, blue: 194/255.0))
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
            .frame(height: 56)
            .background(Color(red: 16/255.0, green: 24/255.0, blue: 40/255.0))
            .overlay(Divider(), alignment: .top)
            }
            // R68：容器背景兜底——页面内容不足或底部安全区不露白
            .background(Color(red: 10/255.0, green: 15/255.0, blue: 30/255.0))
            .navigationDestination(item: $pushedRoute) { route in
                Group {
                    if route == "/d" { DDetailView() }
                }
            }
        .navigationTitle(selected == 0 ? "列表" : "列表")
        .navigationBarTitleDisplayMode(.inline)
            .onAppear {
            Runtime.forPage("List").bindState("keyword") { v in p0_keyword = v as? String ?? p0_keyword }
            Runtime.forPage("List").bindState("on") { v in p1_on = v as? Bool ?? p1_on }
            Runtime.forPage("List").bindState("list") { v in p2_list = v as? String ?? p2_list }

            Runtime.routerPushHandler = { path in pushedRoute = path }
            Runtime.routerBackHandler = { pushedRoute = nil }
            }
        }
    }
}

@main
struct RealvueApp: App {
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
