/**
 * R81 编译期注入的原生桥源码（要求②：webview 时代的 JSBridge → 编译期直接写入原生实现）
 *
 * Vue 侧统一调用形态：`bridge.toast('文案')` / `bridge.openUrl('https://…')`
 *  - iOS：运行时前导脚本提供 `bridge` 对象 → `__nativeToast` 宿主函数（JavaScriptCore → UIKit）
 *  - Android：编译期把 `bridge.xxx(...)` 翻译为 `VrnBridge.xxx(...)`（Kotlin 实现内联进产物）
 *
 * 本文件只提供**原生实现源码**；注入由 gen-ios / gen-android 完成。
 */
export const BRIDGE_VERSION = '0.1.0';

/** iOS 桥实现（写入 VrnBridge.swift） */
export const VRN_BRIDGE_SWIFT = `import Foundation
import UIKit

/// vuexir 原生桥（R81）——编译期注入，Vue 侧通过 bridge.* 调用
enum VrnBridge {
    /// 轻提示：在 key window 的 rootViewController.view 上叠加一个自动消失的 label
    /// （不依赖 window 层级，避免 SwiftUI Scene 下 keyWindow 为 nil 或视图被覆盖）
    static func toast(_ message: String, duration: TimeInterval = 1.8) {
        DispatchQueue.main.async {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let window = scenes.flatMap { $0.windows }.first(where: { $0.isKeyWindow })
                ?? scenes.flatMap { $0.windows }.first
            guard let host = window?.rootViewController?.view else { return }

            let label = UILabel()
            label.text = "\\(message)"
            label.font = .systemFont(ofSize: 15)
            label.textColor = .white
            label.backgroundColor = UIColor.black.withAlphaComponent(0.8)
            label.numberOfLines = 0
            label.textAlignment = .center
            label.layer.cornerRadius = 12
            label.layer.masksToBounds = true
            label.tag = 0x5652 // 'VR' 标记，便于重复调用时替换
            label.translatesAutoresizingMaskIntoConstraints = false
            host.viewWithTag(0x5652)?.removeFromSuperview()
            host.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerXAnchor.constraint(equalTo: host.centerXAnchor),
                label.centerYAnchor.constraint(equalTo: host.centerYAnchor, constant: 120),
                label.widthAnchor.constraint(lessThanOrEqualTo: host.widthAnchor, constant: -56),
                label.heightAnchor.constraint(greaterThanOrEqualToConstant: 40),
            ])
            label.layoutIfNeeded()
            UIView.animate(withDuration: 0.18, animations: { label.alpha = 1 }) { _ in
                UIView.animate(withDuration: 0.25, delay: duration, options: [], animations: { label.alpha = 0 }) { _ in
                    label.removeFromSuperview()
                }
            }
        }
    }

    /// 震动反馈（毫秒，默认 18ms 轻震；无振动马达设备静默忽略）
    static func vibrate(_ milliseconds: Int = 18) {
        DispatchQueue.main.async {
            let gen = UIImpactFeedbackGenerator(style: .medium)
            gen.prepare()
            gen.impactOccurred()
            if milliseconds > 40 {
                // 长震：连续两次冲击近似 40ms+ 的反馈强度
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { gen.impactOccurred() }
            }
        }
    }

    /// 复制文本到系统剪贴板
    static func copy(_ text: String) {
        DispatchQueue.main.async {
            UIPasteboard.general.string = text
        }
    }

    /// 状态栏样式：'light'（浅色图标，深色背景用）/ 'dark'（深色图标，浅色背景用）
    static func setStatusBar(_ style: String) {
        DispatchQueue.main.async {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let target: UIUserInterfaceStyle = style == "dark" ? .light : .dark
            for window in scenes.flatMap({ $0.windows }) {
                window.overrideUserInterfaceStyle = target
            }
        }
    }

    /// 保持屏幕常亮（true 开启 / false 关闭）
    static func keepScreenOn(_ on: Bool) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
        }
    }

    /// 打开链接（Safari / 系统处理）
    static func openUrl(_ url: String) {
        DispatchQueue.main.async {
            guard let u = URL(string: url) else { return }
            UIApplication.shared.open(u)
        }
    }
}
`;

/** Android 桥实现（写入 VrnBridge.kt） */
export const VRN_BRIDGE_KT = `package {BUNDLE_ID}

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/** vuexir 原生桥（R81）——编译期注入，Vue 侧 bridge.* 由编译器翻译为 VrnBridge.* */
object VrnBridge {
    private var appCtx: Context? = null
    fun init(ctx: Context) {
        if (appCtx == null) appCtx = ctx.applicationContext
    }
    fun toast(message: String) {
        val ctx = appCtx ?: return
        android.os.Handler(ctx.mainLooper).post { Toast.makeText(ctx, message, Toast.LENGTH_SHORT).show() }
    }
    fun vibrate(milliseconds: Int = 18) {
        val ctx = appCtx ?: return
        try {
            val v = ctx.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            if (v == null || !v.hasVibrator()) return
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                v.vibrate(android.os.VibrationEffect.createOneShot(milliseconds.toLong(), android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(milliseconds.toLong())
            }
        } catch (e: Throwable) {
            // 无权限/无马达：静默忽略
        }
    }

    fun copy(text: String) {
        val ctx = appCtx ?: return
        try {
            val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("vrn", text))
        } catch (e: Throwable) {
            // 忽略
        }
    }

    fun setStatusBar(style: String) {
        val act = currentActivity ?: return
        android.os.Handler(act.mainLooper).post {
            val light = style != "dark"
            val controller = androidx.core.view.WindowCompat.getInsetsController(act.window, act.window.decorView)
            controller.isAppearanceLightStatusBars = !light
            controller.isAppearanceLightNavigationBars = !light
        }
    }

    fun keepScreenOn(on: Boolean) {
        val act = currentActivity ?: return
        android.os.Handler(act.mainLooper).post {
            if (on) act.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else act.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    fun openUrl(url: String) {
        val ctx = appCtx ?: return
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            ctx.startActivity(i)
        } catch (e: Throwable) {
            toast("无法打开链接")
        }
    }
}
`;
