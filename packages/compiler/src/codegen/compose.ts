/**
 * compose.ts —— Android（Jetpack Compose）代码生成器（codegen 核心，对位 swiftui.ts）
 *
 * 输入：页面 IR（vueToIr 产出）+ 组件表 → 输出 Kotlin/Gradle 工程源码字符串
 * 链路：gen-android.ts（入口）→ vueToIr → validateIr → 本模块 → compiler/generated/android/
 *
 * 与 iOS（swiftui.ts）同一 IR 输入；样式子集约束复用 R-COMPDETAIL-A（两端行为一致）。
 * 已实现：A1–A3 工程骨架/基础映射/多页导航；A4 v-for 常量数组；A5 状态/事件/路由桥；
 *         M7 详情页 TopAppBar 导航栏（标题/返回/背景，对位 iOS NavigationStack push）+ 详情页隐藏底部 tab 栏。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vueToIr } from '../transform/vue2ir.js';
import { validateIr } from '../ir/schema.js';
import type { IrNode, IrProps } from '../ir/schema.js';

// R-PKG：本模块的工程生成入口（runTabs）属于 CLI 职责，产物/样例根均可由环境注入，
// 便于 @dongmingzhixiu/vuexir 指向用户工程；纯函数 API（emitNode/buildNavHost 等）不读这些常量。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SAMPLES_DIR = process.env.VRN_SAMPLES_ROOT ?? join(ROOT, 'examples');
const DEFAULT_INPUT = join(SAMPLES_DIR, 'vuexir-demo');
const OUT_ROOT = process.env.VRN_OUT_DIR ?? join(ROOT, 'compiler/generated/android');

/* ================= 工程模板（静态字符串） ================= */

const SETTINGS_GRADLE = (projectName: string) => `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${projectName}"
include(":app")
`;

const ROOT_BUILD_GRADLE = `// Vuexir 生成工程 · 根构建脚本
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
`;

const GRADLE_PROPERTIES = `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`;


const MANIFEST = (label: string) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="${label}"
        android:theme="@style/Theme.Vuexir"
        android:supportsRtl="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

const STYLES_XML = `<resources>
    <!-- R-SYSTEMBAR：固定深色主题 → 系统栏图标固定浅色（windowLightStatusBar=false），不跟随系统明暗 -->
    <style name="Theme.Vuexir" parent="android:Theme.Material.NoActionBar">
        <item name="android:windowBackground">#0A0F1E</item>
        <item name="android:statusBarColor">#0A0F1E</item>
        <item name="android:navigationBarColor">#0A0F1E</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
</resources>
`;

const MAIN_ACTIVITY = (bundleId: string) => `package ${bundleId}

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(applicationContext)
        VrnBridge.init(this)
        VrnJs.init()
        // R-SYSTEMBAR：应用固定深色主题（InkBg/InkBar），与系统明暗设置无关。
        // enableEdgeToEdge() 默认用 SystemBarStyle.auto(...)，会跟随系统明暗切换图标明暗——
        // 系统处于浅色模式时给出深色图标，落在深色顶栏/底栏上不可读（真机反馈：系统栏文字看不清）。
        // 固定 dark 样式（= 深色栏底配浅色图标），始终匹配固定深色主题。
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContent {
            VuexirTheme {
                AppNavHost()
            }
        }
    }
}
`;

const THEME_KT = (bundleId: string) => `package ${bundleId}

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Vuexir 深色鎏金主题（对位 iOS Theme.swift）
val Gold = Color(0xFFD9B36C)
val InkBg = Color(0xFF0A0F1E)
val CardBg = Color(0xFF0F1832)
val SubText = Color(0xFFA8AEC2)
val InkBar = Color(0xFF10182C)

/** 运行时动态色（:style="{ color: state }" 的 hex 字符串 → Color；对位 iOS Color(hex:)） */
fun dynamicColor(hex: String): Color =
    try { Color(android.graphics.Color.parseColor(hex)) } catch (_: Exception) { Gold }

@Composable
fun VuexirTheme(content: @Composable () -> Unit) {
    // 深色 colorScheme：未显式着色的 Text/背景取主题色，避免默认黑字压深底
    MaterialTheme(
        colorScheme = darkColorScheme(
            background = InkBg,
            surface = CardBg,
            primary = Gold,
            onPrimary = InkBg,
            onBackground = SubText,
            onSurface = SubText,
        ),
        content = content,
    )
}
`;

const RUNTIME_KT = (bundleId: string) => `package ${bundleId}

// Vuexir Android 运行时桥（对位 iOS RUNTIME_SWIFT）
/** R73 持久化桥：对位 iOS runtime 的 localStorage（UserDefaults）—— SharedPreferences 同步读写 */
/** R78 对象字段取值：状态里存 JSON 字符串时按 key 取值 */
// R85 点路径取值：path 支持 "a.b.c"，末段可为 length/size（数组/对象/字符串长度）
fun vrnTruthy(v: String): Boolean = v.isNotEmpty() && v != "false" && v != "0" && v != "null" && v != "undefined"

fun vrnField(json: String, path: String, fallback: String = ""): String {
    val raw = vrnFieldRaw(json, path)
    return if (raw.isEmpty()) fallback else raw
}

fun vrnFieldRaw(json: String, path: String): String {
    return try {
        var cur: Any = org.json.JSONTokener(json).nextValue()
        for (seg in path.split(".")) {
            cur = when {
                seg == "length" || seg == "size" -> when (cur) {
                    is org.json.JSONArray -> cur.length()
                    is org.json.JSONObject -> cur.length()
                    is String -> cur.length
                    else -> return ""
                }
                cur is org.json.JSONObject && cur.has(seg) -> cur.get(seg)
                else -> return ""
            }
        }
        when (cur) {
            is String -> cur
            is Boolean -> if (cur) "true" else "false"
            is Double -> if (cur == Math.floor(cur) && !cur.isInfinite()) cur.toInt().toString() else cur.toString()
            is Int, is Long -> cur.toString()
            else -> cur.toString()
        }
    } catch (e: Throwable) {
        ""
    }
}

object Store {
    private var prefs: android.content.SharedPreferences? = null
    fun init(ctx: android.content.Context) {
        if (prefs == null) prefs = ctx.getSharedPreferences("vrn", android.content.Context.MODE_PRIVATE)
    }
    fun get(key: String, def: String = ""): String = prefs?.getString(key, def) ?: def
    fun set(key: String, value: String) { prefs?.edit()?.putString(key, value)?.apply() }
    fun remove(key: String) { prefs?.edit()?.remove(key)?.apply() }
}

/**
 * R95 P1 Android JS 运行时（与 iOS JavaScriptCore 对位）。
 *
 * 设计：QuickJS 里跑业务逻辑，结果通过全局对象 __vrnOut 回传给原生——
 * 不用 Java/JS 互调反射（QuickJS-Android 的反射桥对复杂类型支持有限，且易在混淆后失效）。
 *
 *   VrnJs.eval("1+1")                       → "2"
 *   VrnJs.eval("__vrnOut.chars = countChars(raw)") -> 之后 VrnJs.drain() 取走 {"chars":"12"}
 *
 * drain() 会清空 __vrnOut，原生据此批量更新 Compose State。
 */
object VrnJs {
    private var js: app.cash.quickjs.QuickJs? = null
    private val lock = Any()

    /** 预置宿主 shim：console / localStorage（落 SharedPreferences）/ 输出对象 */
    private const val PRELUDE = """
var __vrnOut = {};
var __vrnStore = {};
var localStorage = {
  getItem: function (k) { return __vrnStore[k] === undefined ? null : __vrnStore[k]; },
  setItem: function (k, v) { __vrnStore[k] = String(v); __vrnOut['__ls:' + k] = String(v); },
  removeItem: function (k) { delete __vrnStore[k]; __vrnOut['__ls:' + k] = ''; }
};
var console = { log: function () {}, warn: function () {}, error: function () {} };
"""

    fun init() {
        synchronized(lock) {
            if (js == null) {
                js = app.cash.quickjs.QuickJs.create()
                js?.evaluate(PRELUDE)
            }
        }
    }

    /** 执行一段 JS；返回最后一个表达式的值（字符串化），异常返回 null 并打日志 */
    fun eval(code: String): String? = synchronized(lock) {
        val engine = js ?: return null
        return try {
            val v = engine.evaluate(code)
            v?.toString()
        } catch (e: Throwable) {
            android.util.Log.w("VrnJs", "eval 失败: " + e.message)
            null
        }
    }

    /** 取走 JS 侧累积的状态变更（JSON 文本），并清空 */
    fun drain(): String = synchronized(lock) {
        val engine = js ?: return "{}"
        val json = try {
            engine.evaluate("(function(){var s=JSON.stringify(__vrnOut);__vrnOut={};return s;})()")?.toString()
        } catch (e: Throwable) {
            null
        } ?: "{}"
        json.ifEmpty { "{}" }
    }

    fun close() = synchronized(lock) {
        try {
            js?.close()
        } catch (e: Throwable) {
            // 忽略
        }
        js = null
    }
}

/**
 * R81 原生桥（Android）——编译期注入；Vue 侧 bridge.toast(...) 由编译器翻译为 VrnBridge.toast(...)
 * 与 @dongmingzhixiu/vuexir-templates 的 VRN_BRIDGE_KT 保持一致
 */
object VrnBridge {
    private var appCtx: android.content.Context? = null
    private var currentActivity: android.app.Activity? = null
    fun init(ctx: android.content.Context) {
        if (appCtx == null) appCtx = ctx.applicationContext
        if (ctx is android.app.Activity) currentActivity = ctx
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
            // 无马达/无权限：静默忽略
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
    fun toast(message: String) {
        val ctx = appCtx ?: return
        android.os.Handler(ctx.mainLooper).post { android.widget.Toast.makeText(ctx, message, android.widget.Toast.LENGTH_SHORT).show() }
    }
    fun openUrl(url: String) {
        val ctx = appCtx ?: return
        try {
            val i = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)).apply { addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK) }
            ctx.startActivity(i)
        } catch (e: Throwable) {
            toast("无法打开链接")
        }
    }
}

object Runtime {
    var pushHandler: ((String) -> Unit)? = null
    var backHandler: (() -> Unit)? = null
    fun back() {
        backHandler?.invoke()
    }
    fun push(route: String) {
        pushHandler?.invoke(route)
    }
}
`;

const NAV_TEST_KT = (bundleId: string) => `package ${bundleId}

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

// Vuexir A5 交互验证（进程内驱动，不受 MIUI USB 模拟输入限制）
@RunWith(AndroidJUnit4::class)
class NavTest {

    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun tabSwitchToBase() {
        rule.onNodeWithText("基础组件").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Button").assertExists()
    }

    @Test
    fun openButtonDetail() {
        rule.onNodeWithText("基础组件").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Button").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("按钮类型").assertExists()
    }

    @Test
    fun buttonCounterIncrement() {
        rule.onNodeWithText("基础组件").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Button").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("主要按钮").performScrollTo().performClick()
        rule.waitForIdle()
        // 点击计数卡应显示数字变化（初始 0，点击后 1）
        rule.onNodeWithText("1").assertExists()
    }
}
`;

/* ================= IR → Compose 生成 ================= */

/**
 * 颜色 → Compose Color 表达式。
 * 支持 #rgb/#rrggbb 与 rgb()/rgba()（rgba 必须带 alpha，否则会拼出 `0xFFRGBA(...)` 这种非法字面量）。
 */
function colorExpr(c: string): string {
  const raw = c.trim();
  const fn = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(',').map((t) => Number(t.trim()));
    const [r, g, b] = parts;
    const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      const hex = `FF${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g)
        .toString(16)
        .padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`.toUpperCase();
      const alpha = `0x${Math.round(a * 255)
        .toString(16)
        .padStart(2, '0')}`.toUpperCase();
      return `Color(0x${alpha.slice(2)}${hex.slice(2)})`;
    }
  }
  const hex = raw.replace('#', '').toUpperCase();
  const full = hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex;
  return `Color(0xFF${full.padEnd(6, '0')})`;
}

function dp(n: number): string {
  return `${n}.dp`;
}

function sp(n: number): string {
  return `${n}.sp`;
}

function kotlinStr(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '${\'$\'}').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

/** 条件表达式 → Kotlin（对位 iOS swiftCondExpr：=== / !== 归一 + 单引号字符串转双引号） */
function kotlinCondExpr(expr: string): string {
  // R78 续（G12）：对象字段条件 → 非空判断
  const f = expr.match(/^__vrnField__:(\w+):(\w+)$/);
  if (f) return `vrnField(${f[1]}, "${f[2]}").isNotEmpty()`;
  let s = expr.replace(/!==/g, '!=').replace(/===/g, '==');
  s = s.replace(/'(\\[^]|[^'\\])*'/g, (m) => '"' + m.slice(1, -1).replace(/"/g, '\\"') + '"');
  // R111：Kotlin 不接受 String/Int 当条件 → 统一判真
  const neg = s.match(/^!([A-Za-z_$][\w$]*)(?:\.length)?$/);
  if (neg) return `vrnTruthy(${neg[1]}.toString()).not()`;
  if (/^[A-Za-z_$][\w$]*\.length$/.test(s)) return `${s} > 0`;
  if (/^[A-Za-z_$][\w$]*$/.test(s) && !['true', 'false'].includes(s)) return `vrnTruthy(${s}.toString())`;
  return s;
}

/** Swift 风格字符串表达式 → Kotlin（三元 c ? a : b → if (c) a else b；引号归一双引号） */
function kotlinStringExpr(expr: string): string {
  let s = expr.replace(/'(\\[^]|[^'\\])*'/g, (m) => '"' + m.slice(1, -1).replace(/"/g, '\\"') + '"');
  const ternary = s.match(/^([^?]+)\?([^:]+):(.+)$/);
  if (ternary) {
    return `if (${ternary[1].trim()}) ${ternary[2].trim()} else ${ternary[3].trim()}`;
  }
  return s;
}

/** v-show（props.show）→ alpha 修饰符（布局占位保留，仅视觉隐藏，对位 iOS .opacity） */
/** v-show 条件透明 + CSS opacity 静态透明（可叠加：alpha 相乘） */
function alphaModifier(p: IrProps): string | undefined {
  const parts: string[] = [];
  if (p.show !== undefined) parts.push(`if (${p.show}) 1f else 0f`);
  if (p.opacity !== undefined) parts.push(`${p.opacity}f`);
  if (parts.length === 0) return undefined;
  const expr = parts.length === 1 ? parts[0] : parts.join(' * ');
  return `Modifier.alpha(${expr})`;
}

/** M5 transform（scale/rotate/translate）→ graphicsLayer（对位 iOS scaleEffect/rotationEffect/offset） */
function transformModifiers(p: IrProps): string[] {
  const t = p.transform;
  if (!t) return [];
  const args: string[] = [];
  if (t.scale !== undefined) args.push(`scaleX = ${t.scale}f`, `scaleY = ${t.scale}f`);
  if (t.rotate !== undefined) args.push(`rotationZ = ${t.rotate}f`);
  if (t.translateX !== undefined) args.push(`translationX = ${t.translateX}.dp.toPx()`);
  if (t.translateY !== undefined) args.push(`translationY = ${t.translateY}.dp.toPx()`);
  return args.length > 0 ? [`Modifier.graphicsLayer { ${args.join(' ')} }`] : [];
}

/** M5 position:absolute → Box 内 align + offset（absRight/absBottom 负偏移锚定对边，对位 iOS ZStack+offset） */
function absModifiers(p: IrProps): string[] {
  if (p.position !== 'absolute') return [];
  const v = p.absBottom !== undefined ? 'Bottom' : 'Top';
  const h = p.absRight !== undefined ? 'End' : 'Start';
  const x = p.absLeft !== undefined ? p.absLeft : p.absRight !== undefined ? -p.absRight : 0;
  const y = p.absTop !== undefined ? p.absTop : p.absBottom !== undefined ? -p.absBottom : 0;
  const mods = [`Modifier.align(Alignment.${v}${h})`];
  if (x !== 0 || y !== 0) mods.push(`Modifier.offset(${dp(x)}, ${dp(y)})`);
  return mods;
}

function toPascal(id: string): string {
  return id
    .split(/[-_.]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/** 组件引用名（components/*.vue → PascalCase，对位 iOS VirRowView） */
function compKotlinName(name: string): string {
  return `${name.replace(/\s/g, '')}View`;
}

interface ComposeCtx {
  warnings: string[];
  pageId: string;
  /** R72 异步：本页是否需要协程作用域（async handler / async onMounted）→ 页面 composable 声明 vrnScope */
  needsScope?: boolean;
  /** 常量数组（v-for 数据，首版生成 Kotlin 内联列表） */
  lists?: Record<string, string[]>;
  /** 页面状态（script setup ref → remember mutableStateOf） */
  states?: { name: string; type: 'string' | 'number' | 'boolean'; init: string | number | boolean }[];
  /** M3 handler 函数（@click="fn()" 引用；body 已做 .value → stateStore 重写，Kotlin 侧反向内联）
   *  R72：async:true → 走协程形状翻译（fetch/setTimeout/await 子集），形状外回退 TODO 注释 + warning */
  handlers?: { name: string; params: string; body: string; async?: boolean }[];
  /** v-for 循环上下文（item 字段引用展开） */
  loop?: { itemKey: string; indexKey?: string };
  /** R72：onMounted 回调体与其 async 标记（生成 LaunchedEffect + 协程） */
  onMountedBody?: string;
  onMountedAsync?: boolean;
}

function sizeModifiers(props: IrProps): string[] {
  const mods: string[] = [];
  if (props.width === 'fill') mods.push('Modifier.fillMaxWidth()');
  else if (typeof props.width === 'number') mods.push(`Modifier.width(${dp(props.width)})`);
  if (props.height === 'fill') mods.push('Modifier.fillMaxHeight()');
  else if (typeof props.height === 'number') mods.push(`Modifier.height(${dp(props.height)})`);
  return mods;
}

function paddingModifiers(props: IrProps): string[] {
  const p = props.padding;
  if (p === undefined) return [];
  if (typeof p === 'number') return [`Modifier.padding(${dp(p)})`];
  const parts: string[] = [];
  if (p.top !== undefined) parts.push(`top = ${dp(p.top)}`);
  if (p.bottom !== undefined) parts.push(`bottom = ${dp(p.bottom)}`);
  if (p.left !== undefined) parts.push(`start = ${dp(p.left)}`);
  if (p.right !== undefined) parts.push(`end = ${dp(p.right)}`);
  return [`Modifier.padding(${parts.join(', ')})`];
}

function visualModifiers(props: IrProps): string[] {
  const mods: string[] = [];
  if (props.background !== undefined) mods.push(`Modifier.background(${colorExpr(props.background)})`);
  return mods;
}

function clipModifiers(props: IrProps): string[] {
  const mods: string[] = [];
  if (props.radius !== undefined) {
    mods.push(`Modifier.clip(RoundedCornerShape(${dp(props.radius)}))`);
  }
  // R71 overflow:hidden → 裁剪溢出内容（对位 iOS .clipped()）
  if (props.clip === true) mods.push('Modifier.clipToBounds()');
  return mods;
}

function borderModifiers(props: IrProps): string[] {
  const mods: string[] = [];
  if (props.borderWidth !== undefined && props.borderColor !== undefined && props.borderWidth > 0) {
    const shape = props.radius !== undefined ? `RoundedCornerShape(${dp(props.radius)})` : 'RoundedCornerShape(0.dp)';
    mods.push(`Modifier.border(${dp(props.borderWidth)}, ${colorExpr(props.borderColor)}, ${shape})`);
  }
  // R70 单边边框（发丝分隔线 0.5px 等）：drawBehind 逐边画线（对位 iOS overlay 矩形）
  const sides = props.borderSides;
  if (sides !== undefined) {
    // DrawScope 的 strokeWidth/Offset 都是像素 Float → 在 lambda 内 toPx()（Dp 直接传会编译失败）
    const decls: string[] = [];
    const draws: string[] = [];
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const sv = sides[side];
      if (sv === undefined || sv.width <= 0) continue;
      const color = colorExpr(sv.color ?? props.borderColor ?? '#2a3550');
      const v = `w${side.charAt(0).toUpperCase()}${side.slice(1)}`;
      decls.push(`val ${v} = ${dp(sv.width)}.toPx()`);
      if (side === 'top') draws.push(`drawLine(${color}, strokeWidth = ${v}, start = Offset(0f, ${v} / 2), end = Offset(size.width, ${v} / 2))`);
      else if (side === 'bottom') draws.push(`drawLine(${color}, strokeWidth = ${v}, start = Offset(0f, size.height - ${v} / 2), end = Offset(size.width, size.height - ${v} / 2))`);
      else if (side === 'left') draws.push(`drawLine(${color}, strokeWidth = ${v}, start = Offset(${v} / 2, 0f), end = Offset(${v} / 2, size.height))`);
      else draws.push(`drawLine(${color}, strokeWidth = ${v}, start = Offset(size.width - ${v} / 2, 0f), end = Offset(size.width - ${v} / 2, size.height))`);
    }
    if (draws.length > 0) {
      const body = [...decls, ...draws].map((l) => '                ' + l).join('\n');
      mods.push('Modifier.drawBehind {\n' + body + '\n            }');
    }
  }
  return mods;
}

function flexModifier(props: IrProps): string {
  return props.flex !== undefined ? `Modifier.weight(${props.flex}f)` : '';
}

/** 容器选择（对位 iOS VStack/HStack/ZStack） */
function containerKind(props: IrProps): 'Column' | 'Row' | 'Box' {
  if (props.position === 'absolute') return 'Box';
  return props.flexDirection === 'row' ? 'Row' : 'Column';
}

/** 排列参数（按容器方向：Column 用 verticalArrangement/horizontalAlignment；Row 用 horizontalArrangement/verticalAlignment） */
function arrangementExpr(props: IrProps, kind: 'Column' | 'Row' | 'Box'): string {
  if (kind === 'Box') return ''; // Box 无排列参数（子元素用 Modifier.align）
  const parts: string[] = [];
  const horiz = kind === 'Row' ? 'horizontalArrangement' : 'verticalArrangement';
  const vert = kind === 'Row' ? 'verticalAlignment' : 'horizontalAlignment';
  // R79：gap 与 justify-content 共用同一个排列参数 → 必须合并（否则 Kotlin 报 duplicate argument）
  const just = props.justifyContent;
  const justAlign =
    just === 'center'
      ? kind === 'Row'
        ? 'Alignment.CenterHorizontally'
        : 'Alignment.CenterVertically'
      : just === 'end'
        ? kind === 'Row'
          ? 'Alignment.End'
          : 'Alignment.Bottom'
        : '';
  if (props.gap !== undefined && justAlign !== '') {
    parts.push(`${horiz} = Arrangement.spacedBy(${dp(props.gap)}, ${justAlign})`);
  } else if (props.gap !== undefined) {
    parts.push(`${horiz} = Arrangement.spacedBy(${dp(props.gap)})`);
  } else if (just === 'center') {
    parts.push(`${horiz} = Arrangement.Center`);
  } else if (just === 'end') {
    parts.push(`${horiz} = Arrangement.${kind === 'Row' ? 'End' : 'Bottom'}`);
  } else if (just === 'spaceBetween') {
    parts.push(`${horiz} = Arrangement.SpaceBetween`);
  } else if (just === 'spaceAround') {
    parts.push(`${horiz} = Arrangement.SpaceAround`);
  }
  const align = props.alignItems;
  if (align === 'center') parts.push(`${vert} = Alignment.${kind === 'Row' ? 'CenterVertically' : 'CenterHorizontally'}`);
  else if (align === 'end') parts.push(`${vert} = Alignment.${kind === 'Row' ? 'Bottom' : 'End'}`);
  return parts.join(', ');
}

/** Modifier 数组 → 点链（去掉每项 Modifier. 前缀，用 . 连接换行缩进）
 *  如 ['Modifier.fillMaxWidth()','Modifier.height(640.dp)'] →
 *     Modifier.fillMaxWidth()
 *             .height(640.dp)
 */
function modChain(mods: string[], indent: string): string {
  const list = mods.filter((m) => m.length > 0);
  if (list.length === 0) return '';
  const steps = list.map((m) => m.replace(/^Modifier\./, ''));
  return '\n' + indent + '.' + steps.join('\n' + indent + '.');
}

/** v-for 循环字段引用：item.name → item["name"] ?: ""（对位 iOS R-VFOBJ） */
function loopField(v: string, loop?: { itemKey: string }): string {
  if (!loop) return v;
  const m = v.match(new RegExp('^' + loop.itemKey + '\\.(\\w+)$'));
  if (m) return loop.itemKey + '["' + m[1] + '"] ?: ""';
  return v;
}

/** handler 函数体 → Kotlin 语句（无 JS 引擎的 M1 内联子集：仅状态赋值/自增减/字面量与状态间运算）
 *  body 中 .value 已被 vue2ir 重写为 stateStore.x → 反向剥离回 Kotlin 状态变量名；
 *  含 localStorage/网络/控制流的 body 超出子集 → 返回 null（调用方降级 TODO 注释） */
function inlineHandlerKotlin(fn: { name: string; params: string; body: string }): string | null {
  if (fn.params && fn.params.trim() !== '') return null; // 带参 handler 不内联（A5 需数据桥）
  // R73：localStorage / Number() 现已支持（见 jsExprToKotlin）；其余（window/document/fetch/setTimeout/return/嵌套函数）仍走协程或降级
  if (/window\.|document\.|fetch\(|setTimeout|alert\(|console\.|return\b|function/.test(fn.body)) return null;
  const out: string[] = [];
  for (const raw of fn.body.split(/[\n;]+/)) {
    const st = raw.trim().replace(/stateStore\.(\w+)/g, '$1').replace(/'([^']*)'/g, '"$1"');
    if (!st) continue;
    let m: RegExpMatchArray | null;
    if ((m = st.match(/^(\w+)\s*=\s*([\w\s+\-*/%()."[]*)$/))) {
      const rhs = m[2].trim();
      if (!rhs) return null;
      out.push(`${m[1]} = ${rhs}`);
    } else if (/^\w+(\+\+|--)$/.test(st)) {
      out.push(st);
    } else if ((m = st.match(/^(\w+)\s*(\+|-)=\s*(-?\w+)$/))) {
      out.push(`${m[1]} = ${m[1]} ${m[2]} ${m[3]}`);
    } else {
      return null;
    }
  }
  // 单个 lambda 内联：多语句必须用 '; ' 连接（裸换行会让 `clickable { a\nb = c }` 语法错）
  return out.length > 0 ? out.join('; ') : null;
}

/** 点击事件 → Kotlin 表达式（A5：onSet 内联赋值；onClick 模式识别：自增减/路由 push/无参 handler 内联/其他 JS TODO） */
function kotlinClickAction(p: IrProps, ctx: ComposeCtx, loop?: { itemKey: string }): string {
  if (p.onSet) {
    const v = p.onSet.value;
    const rhs = p.onSet.kind === 'expr' ? String(v) : typeof v === 'string' ? kotlinStr(v) : String(v);
    return p.onSet.var + ' = ' + rhs;
  }
  if (p.onClick) {
    const h = p.onClick.trim();
    const inc = h.match(/^(\w+)\+\+$/);
    if (inc) return inc[1] + ' = ' + inc[1] + ' + 1';
    const dec = h.match(/^(\w+)--$/);
    if (dec) return dec[1] + ' = ' + dec[1] + ' - 1';
    const push = h.match(/router(?:\.push|Push)?\(\s*(.+?)\s*\)/);
    if (push) {
      const arg0 = push[1].trim();
      // R111：router.push({ name: 'x' }) / { path: 'x' } → 只取目标值（Kotlin 里对象字面量会被当 lambda）
      const objM = arg0.match(/^\{[^}]*?(?:name|path)\s*:\s*['"]([^'"]+)['"]/);
      if (objM) return 'Runtime.push("' + objM[1] + '")';
      const arg = arg0;
      const isLit = (arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'));
      if (isLit) return 'Runtime.push(' + kotlinStr(arg.slice(1, -1)) + ')';
      return 'Runtime.push(' + loopField(arg, loop) + ')';
    }
    // 无参 handler 调用（@click="fn" / @click="fn()"）→ 简单 setter 函数体内联（M1 子集）
    const call = h.match(/^(\w+?)(?:\(\s*\))?$/);
    if (call) {
      const fnDef = (ctx.handlers ?? []).find((f) => f.name === call[1]);
      if (fnDef) {
        if (fnDef.async || /(^|[^\w$.])await\s/.test(fnDef.body)) {
          // R72：async handler → 协程（形状子集翻译；形状外返回 null → 显式 warning + TODO，不静默）
          const susp = asyncHandlerKotlin(fnDef, ctx);
          if (susp) {
            ctx.needsScope = true;
            return 'vrnScope.launch {\n' + susp.split('\n').map((l) => '            ' + l).join('\n') + '\n        }';
          }
          ctx.warnings.push(
            'async handler「' + fnDef.name + '」含超出协程子集的形状（支持：await fetch(url) / JSON.parse / 状态赋值 / setTimeout / try-catch / if），已生成 TODO 占位',
          );
          return '/* async handler ' + fnDef.name + ': 形状超出协程子集（R72），待补齐 */';
        }
        const ks = inlineHandlerKotlin(fnDef);
        if (ks) return ks;
        // R72：非 async handler 但含 setTimeout（定时器语义）→ 同样生成协程
        if (/setTimeout\s*\(/.test(fnDef.body)) {
          const susp = asyncHandlerKotlin(fnDef, ctx);
          if (susp) {
            ctx.needsScope = true;
            return 'vrnScope.launch {\n' + susp.split('\n').map((l) => '            ' + l).join('\n') + '\n        }';
          }
        }
      }
    }
    return '/* JS handler: ' + h + ' TODO（A5 需 QuickJS 桥） */';
  }
  return '';
}

/**
 * R72 async handler → Kotlin 协程（受限形状子集）：
 *   await fetch(url)                       → withContext(Dispatchers.IO) { URL(url).readText() }
 *   const x = JSON.parse(String(res))      → val x = org.json.JSONArray(res)
 *   x.length                               → x.length()      （数组状态写入转为 JSON 字符串，对位 iOS 动态列表协议）
 *   state.value = expr                     → state = expr
 *   setTimeout(function () { B }, ms)      → delay(ms) + B
 *   await new Promise(function (r) { setTimeout(r, ms) })  → delay(ms)
 *   try/catch、if、console.log             → 同形
 * 形状外返回 null（调用方补 warning + TODO 占位，R15 不静默）
 */
function asyncHandlerKotlin(fn: { name: string; params: string; body: string }, ctx: ComposeCtx): string | null {
  if (fn.params.trim().length > 0) return null; // 带参 handler 需调用点实参，暂不翻译
  let body = fn.body;
  try {
    const out: string[] = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line === '') continue;
      const t = asyncLineKotlin(line, ctx);
      if (t === null) return null;
      if (t.length > 0) out.push(t);
    }
    return out.join('\n');
  } catch {
    return null;
  }
}

/** 单行翻译（含 try/catch 的 kt 关键字差异）；不支持 → null */
function asyncLineKotlin(line: string, ctx: ComposeCtx): string | null {
  // 状态赋值：`x.value = expr`（vue2ir 已重写为 stateStore.x = expr）
  const assign = line.match(/^(?:stateStore\.)?([A-Za-z_$][\w$]*)(?:\.value)?\s*=\s*(.+?);?$/);
  // 注释：整行注释原样保留
  if (line.startsWith('//')) return line;

  // await fetch(url)
  const fetchAssign = line.match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+fetch\((.+)\);?$/);
  if (fetchAssign) {
    const url = jsExprToKotlin(fetchAssign[2].trim());
    if (url === null) return null;
    return `val ${fetchAssign[1]} = withContext(Dispatchers.IO) { java.net.URL(${url}).readText() }`;
  }
  // await fetch(...) 作为语句（结果丢弃）
  if (/^await\s+fetch\(/.test(line)) {
    const m = line.match(/^await\s+fetch\((.+)\);?$/);
    if (!m) return null;
    const url = jsExprToKotlin(m[1].trim());
    if (url === null) return null;
    return `withContext(Dispatchers.IO) { java.net.URL(${url}).readText() }`;
  }
  // JSON.parse(String(x)) / JSON.parse(x) → org.json.JSONArray
  const parseAssign = line.match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*JSON\.parse\((?:String\()?(.+?)\)?\);?$/);
  if (parseAssign) {
    const src = jsExprToKotlin(parseAssign[2].trim());
    if (src === null) return null;
    return `val ${parseAssign[1]} = org.json.JSONArray(${src})`;
  }
  // await new Promise(function (r) { setTimeout(r, ms) })
  const awaitDelay = line.match(/^await\s+new\s+Promise\(\s*function\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*setTimeout\(\s*[A-Za-z_$][\w$]*\s*,\s*([\d.]+)\s*\)\s*;?\s*\}\s*\)\s*;?$/);
  if (awaitDelay) return `delay(${awaitDelay[1]}.toLong())`;
  // setTimeout(function () { ... }, ms) 单行
  const timer = line.match(/^setTimeout\(\s*function\s*\(\s*\)\s*\{\s*(.*?)\s*\}\s*,\s*([\d.]+)\s*\);?$/);
  if (timer) {
    const inner = timer[1].trim().replace(/;$/, '');
    const t = asyncLineKotlin(inner, ctx);
    if (t === null) return null;
    return `delay(${timer[2]}.toLong())\n${t}`;
  }
  // try { / } catch (e) { / } 结构
  if (line === 'try {') return 'try {';
  if (/^\}\s*catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{$/.test(line)) {
    const name = line.match(/catch\s*\(\s*([A-Za-z_$][\w$]*)/)![1];
    return `} catch (${name}: Throwable) {`;
  }
  if (/^\}\s*(else\s*\{)?$/.test(line)) return line.replace('else {', 'else {');
  // if (cond) {
  const ifLine = line.match(/^if\s*\((.*)\)\s*\{$/);
  if (ifLine) {
    const cond = jsExprToKotlin(ifLine[1]);
    if (cond === null) return null;
    return `if (${cond}) {`;
  }
  // R81/R84 原生桥语句：bridge.toast('x') / bridge.vibrate(18) / bridge.copy('x') …
  const bm = line.match(/^bridge\.(toast|openUrl|vibrate|copy|setStatusBar|keepScreenOn)\((.+)\);?$/);
  if (bm) {
    const arg = jsExprToKotlin(bm[2].trim());
    return arg === null ? null : `VrnBridge.${bm[1]}(${arg})`;
  }
  // G15 router 语句：router.push('x') / router.back() → Runtime.push / Runtime.back
  // router.push({ name: 'x' }) → Runtime.push("x")（对象参数取 name/path）
  const rpObj = line.match(/^router\.push\(\s*\{\s*(?:name|path)\s*:\s*'([^']+)'[^}]*\}\s*\);?$/);
  if (rpObj) return `Runtime.push("${rpObj[1]}")`;
  const rp = line.match(/^router\.push\((.+)\);?$/);
  if (rp) {
    const a = jsExprToKotlin(rp[1].trim());
    return a === null ? null : `Runtime.push(${a})`;
  }
  if (/^router\.back\(\)\s*;?$/.test(line)) return 'Runtime.back()';
  // R73 localStorage（语句形态）：setItem / removeItem
  const lsSet = line.match(/^localStorage\.setItem\((.+),\s*(.+)\);?$/);
  if (lsSet) {
    const k = jsExprToKotlin(lsSet[1].trim());
    const v = jsExprToKotlin(lsSet[2].trim());
    if (k === null || v === null) return null;
    return `Store.set(${k}, ${v})`;
  }
  if (/^localStorage\.removeItem\(/.test(line)) {
    const k = jsExprToKotlin(line.replace(/^localStorage\.removeItem\(/, '').replace(/\);?$/, ''));
    return k === null ? null : `Store.remove(${k})`;
  }
  // 通用 `const x = <expr>` → `val x = <expr>`（置于 localStorage/fetch/JSON 专项之后）
  const constAssign = line.match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?);?$/);
  if (constAssign) {
    const v = jsExprToKotlin(constAssign[2].trim());
    return v === null ? null : `val ${constAssign[1]} = ${v}`;
  }
  // console.log(x) → Log.d
  const logLine = line.match(/^console\.log\((.+)\);?$/);
  if (logLine) {
    const v = jsExprToKotlin(logLine[1]);
    if (v === null) return null;
    return `android.util.Log.d("vrn", ${v}.toString())`;
  }
  // 状态赋值
  if (assign) {
    const name = assign[1];
    const rhsRaw = assign[2].trim().replace(/;$/, '');
    const isListState = (ctx.states ?? []).some((st) => st.name === name && st.type === 'string');
    const rhs = jsExprToKotlin(rhsRaw);
    if (rhs === null) return null;
    // 动态列表协议：数组/对象 → JSON 字符串（对位 iOS stateStore JSON 协议）
    if (isListState && /^(new\s+)?Array|^\[/.test(rhsRaw)) return `${name} = ${rhs}.toString()`;
    return `${name} = ${rhs}`;
  }
  // 表达式语句（函数调用等）
  if (/^[A-Za-z_$][\w$]*\(.*\);?$/.test(line)) {
    const v = jsExprToKotlin(line.replace(/;$/, ''));
    if (v === null) return null;
    return v;
  }
  if (line === '}' || line === '});' || line === '};') return '}';
  return null;
}

/** JS 表达式 → Kotlin 表达式（受限：字面量 / 标识符 / 成员 / 算术比较 / JSON 数组长度） */
function jsExprToKotlin(expr: string): string | null {
  let s = expr.trim().replace(/;$/, '');
  if (s === '') return null;
  // 字符串字面量（单引号 → 双引号）
  const lit = s.match(/^'(.*)'$/);
  if (lit) return kotlinStr(lit[1]);
  if (/^"[^"]*"$/.test(s)) return s;
  if (/^-?[\d.]+$/.test(s)) return s;
  if (s === 'true' || s === 'false') return s;
  // .length → .length()（JSONArray）
  s = s.replace(/\.length\b(?!\()/g, '.length()');
  // R73 localStorage → Store（函数式写法：getItem 直接用；setItem/removeItem 走语句分支）
  s = s.replace(/localStorage\.getItem\((.+)\)$/g, (_m, k: string) => `Store.get(${k})`);
  // R81 bridge.* → VrnBridge.*（表达式形态）
  s = s.replace(/\bbridge\.(toast|openUrl|vibrate|copy|setStatusBar|keepScreenOn)\(/g, (_m, fn: string) => `VrnBridge.${fn}(`);
  // JS 单引号字符串 → Kotlin 双引号（Kotlin 的单引号是 Char 字面量，'x' 编译不过）
  s = s.replace(/'([^']*)'/g, (_m, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
  // JS 类型转换 → Kotlin
  s = s.replace(/Number\((.+)\)$/g, (_m, inner: string) => `${inner}.toInt()`);
  s = s.replace(/String\((.+)\)$/g, (_m, inner: string) => `${inner}.toString()`);
  // JSON.stringify(x) → x.toString()（Kotlin 无 JSON 全局对象；与 JS 侧动态列表协议一致）
  s = s.replace(/JSON\.stringify\(([^()]*)\)/g, (_m, inner: string) => `${inner}.toString()`);
  // 成员访问 a.b（对象状态字段）
  s = s.replace(/\bstateStore\./g, '');
  // 严格等号 → Kotlin
  s = s.replace(/===/g, '==').replace(/!==/g, '!=');
  // 白名单校验：标识符/数字/运算符/括号/点/方括号/引号/空白
  if (!/^[\w\s().\[\]"'+\-*/%<>=!&|?:]+$/.test(s.replace(/"[^"]*"/g, '""'))) return null;
  // 未加引号的裸标识符成员（如 e.message）保守放行
  return s;
}

/** 页面状态声明块（script setup ref → var x by remember { mutableStateOf(init) }） */
function stateDeclarations(ctx: ComposeCtx, pad: string): string {
  if (!ctx.states || ctx.states.length === 0) return '';
  return ctx.states
    .map((st) => {
      const init = st.type === 'string' ? kotlinStr(String(st.init)) : st.type === 'boolean' ? (st.init ? 'true' : 'false') : String(st.init ?? 0);
      return pad + '    var ' + st.name + ' by remember { mutableStateOf(' + init + ') }';
    })
    .join('\n');
}

/** 纯字符串拼接生成节点（避免嵌套模板转译问题）；v-if（node.condition）在此统一包裹 */
function emitNode(node: IrNode, ctx: ComposeCtx, depth: number, loop?: { itemKey: string; indexKey?: string }, useParamModifier = false, parentStretch = false): string {
  const pad = '  '.repeat(depth);
  // v-if → Kotlin if 包裹（表达式为双端兼容子集 ==/!=/&&/||/!，=== / !== 由 kotlinCondExpr 归一）
  if (node.condition && node.type !== 'root') {
    return (
      pad + 'if (' + kotlinCondExpr(node.condition) + ') {\n' +
      emitNodeInner(node, ctx, depth + 1, loop, useParamModifier, parentStretch) +
      '\n' + pad + '}\n'
    );
  }
  return emitNodeInner(node, ctx, depth, loop, useParamModifier, parentStretch);
}

/** CSS 默认 align-items:stretch：column 父容器内未声明宽度/弹性/绝对定位的子项拉满父宽（R29 盒模型，对位 iOS maxWidth 无穷） */
function stretchModifiers(parentStretch: boolean, node: IrNode): string[] {
  if (!parentStretch || node.type === 'spacer' || node.type === 'divider') return [];
  return ['Modifier.fillMaxWidth()'];
}

/** R-PAGESCROLL 守卫：子树内是否存在 flex / marginTopAuto（→ Modifier.weight，滚动容器内不可用） */
function subtreeHasWeight(node: IrNode): boolean {
  const p = node.props as IrProps | undefined;
  if (p && (p.flex !== undefined || p.marginTopAuto)) return true;
  return (node.children ?? []).some(subtreeHasWeight);
}

function emitNodeInner(node: IrNode, ctx: ComposeCtx, depth: number, loop?: { itemKey: string; indexKey?: string }, useParamModifier = false, parentStretch = false): string {
  const pad = '  '.repeat(depth);
  const p = (node.props ?? {}) as IrProps;
  const alphaMod = alphaModifier(p);
  const alphaArr = alphaMod ? [alphaMod] : [];
  /** 容器类型：存在 absolute 子节点 → Box（ZStack 语义，对位 iOS）；否则按 flexDirection */
  const kindFor = (nd: IrNode, props: IrProps): 'Column' | 'Row' | 'Box' => {
    const absChild = (nd.children ?? []).some((c) => (c.props as IrProps | undefined)?.position === 'absolute');
    if (absChild) return 'Box';
    return containerKind(props);
  };
  /** :class 选中态背景（node.active.props.background → 条件色；对位 iOS 668-676） */
  const groupBackground = (nd: IrNode, props: IrProps): string[] => {
    const activeBg = nd.active ? (nd.active.props as Record<string, unknown> | undefined)?.background : undefined;
    if (typeof activeBg === 'string' && nd.active) {
      const when = kotlinCondExpr(nd.active.when);
      const active = colorExpr(activeBg);
      // 无基础背景时回退透明（对位 iOS `.background(when ? color : Color.clear)`）——
      // 否则选中态会变成「所有行都高亮」（此前 bug）
      const base = typeof props.background === 'string' ? colorExpr(props.background) : 'Color.Transparent';
      return [`Modifier.background(if (${when}) ${active} else ${base})`];
    }
    return visualModifiers(props);
  };
  /** 子节点前置 margin（方向感知，对位 iOS：column 处理 marginTop*、row 处理 marginLeftAuto）
   *  + CSS 默认 stretch 模拟：column 内未声明 width/flex/绝对定位的子项补 fillMaxWidth */
  const childrenBody = (nd: IrNode, d: number, kind: 'Column' | 'Row' | 'Box'): string => {
    if (!nd.children) return '';
    return nd.children
      .map((c) => {
        const cp = (c.props ?? {}) as IrProps;
        const cpad = '  '.repeat(d);
        let pre = '';
        let post = '';
        if (kind === 'Column') {
          if (cp.marginTopAuto) {
            pre += cpad + 'Spacer(\n' + cpad + '    modifier = Modifier.weight(1f),\n' + cpad + ')\n';
          }
          if (cp.marginTop !== undefined) {
            pre += cpad + 'Spacer(\n' + cpad + '    modifier = Modifier.height(' + dp(cp.marginTop) + '),\n' + cpad + ')\n';
          }
        }
        if (kind === 'Row' && cp.marginLeftAuto) {
          pre += cpad + 'Spacer(\n' + cpad + '    modifier = Modifier.weight(1f),\n' + cpad + ')\n';
        }
        // R70 其余单边外边距（前置/后置固定间隔，对位 iOS Color.clear 间隔）
        if (kind === 'Row' && cp.marginLeft !== undefined) {
          pre += cpad + 'Spacer(\n' + cpad + '    modifier = Modifier.width(' + dp(cp.marginLeft) + '),\n' + cpad + ')\n';
        }
        if (kind === 'Row' && cp.marginRight !== undefined) {
          post = post + '\n' + cpad + 'Spacer(\n' + cpad + '    modifier = Modifier.width(' + dp(cp.marginRight) + '),\n' + cpad + ')\n';
        }
        if (kind === 'Column' && cp.marginBottom !== undefined) {
          post = post + '\n' + cpad + 'Spacer(\n' + cpad + '    modifier = Modifier.height(' + dp(cp.marginBottom) + '),\n' + cpad + ')\n';
        }
        const stretch = kind === 'Column' && cp.width === undefined && cp.flex === undefined && cp.position !== 'absolute' && !cp.marginLeftAuto;
        return pre + emitNode(c, ctx, d, undefined, false, stretch) + post;
      })
      .join('\n');
  };
  switch (node.type) {
    case 'root': {
      // 单层容器：设计稿固定高度（640）在真机上会导致内容被限高挤压 → 移除 height，fillMaxSize 铺满（对位 iOS 背景铺满）
      const size = sizeModifiers(p).filter((m) => !m.includes('.height('));
      // R-PAGESCROLL：页面根 = 可滚动视口（对位 Web body 默认滚动 / 对位 iOS root ScrollView）。
      // 守卫：子树存在 flex/marginTopAuto（→ Modifier.weight）时不加滚动——滚动容器沿主轴给无界高度约束，
      // weight 在其中会抛异常（Vertically scrollable component was measured with infinity constraints）
      const weighty = subtreeHasWeight(node);
      if (weighty) {
        ctx.warnings.push(
          '页面含 flex/marginTopAuto（weight 布局）→ 根容器不启用滚动（滚动容器内 weight 会因高度无界崩溃）；内容超高时请把长内容放进 overflow:auto 容器',
        );
      }
      const scrollMods = weighty ? [] : ['Modifier.verticalScroll(rememberScrollState())'];
      const chain = modChain([...size, ...scrollMods, ...clipModifiers(p), ...visualModifiers(p), ...borderModifiers(p), ...paddingModifiers(p)], pad + '              ');
      const kind = kindFor(node, p);
      const args = arrangementExpr(p, kind);
      let out = pad + '@Composable\n';
      out += pad + 'fun ' + toPascal(ctx.pageId) + 'Content(\n';
      out += pad + '    modifier: Modifier = Modifier\n' + pad + ') {\n';
      const states = stateDeclarations(ctx, pad);
      out += pad + '    ' + kind + '(\n';
      out += pad + '        modifier = modifier.fillMaxSize()' + (chain ? '\n' + pad + '            ' + chain.trimStart() : '') + (args ? ',\n' + pad + '        ' + args : '') + ',\n';
      // 先遍历子节点（async handler 在其中置位 ctx.needsScope），再决定是否声明协程作用域
      const children = childrenBody(node, depth + 1, kind);
      // R72 异步：本页含 async handler / async onMounted → 声明协程作用域（按钮 onClick 用 vrnScope.launch）
      const pre: string[] = [];
      const asyncOm = ctx.onMountedAsync && ctx.onMountedBody ? asyncHandlerKotlin({ name: '__onMounted', params: '', body: ctx.onMountedBody }, ctx) : null;
      if (ctx.onMountedAsync && ctx.onMountedBody && asyncOm === null) {
        ctx.warnings.push('async onMounted 含超出协程子集的形状（R72 子集：await fetch / JSON.parse / 状态赋值 / setTimeout），已跳过生成');
      }
      if (ctx.needsScope || asyncOm !== null) pre.push(pad + '    val vrnScope = rememberCoroutineScope()');
      if (asyncOm !== null) {
        pre.push(
          pad + '    LaunchedEffect(Unit) {\n' + asyncOm.split('\n').map((l) => pad + '        ' + l).join('\n') + '\n' + pad + '    }',
        );
      }
      const decls = [states, ...pre].filter((x) => x && x.length > 0).join('\n');
      out += pad + '    ) {' + (decls ? '\n' + decls : '') + '\n' + children + '\n' + pad + '    }\n';
      out += pad + '}';
      return out;
    }
    case 'group': {
      const click = kotlinClickAction(p, ctx, loop);
      const gm = depth === 1 && useParamModifier ? 'modifier' : 'Modifier';
      const chain = modChain(
        [
          ...stretchModifiers(parentStretch, node),
          ...sizeModifiers(p),
          ...absModifiers(p),
          ...clipModifiers(p),
          ...groupBackground(node, p),
          ...borderModifiers(p),
          ...paddingModifiers(p),
          flexModifier(p),
          ...alphaArr,
          ...transformModifiers(p),
        ].concat(click ? [gm + '.clickable { ' + click + ' }'] : []),
        pad + '            ',
      );
      const kind = kindFor(node, p);
      const args = arrangementExpr(p, kind);
      let out = pad + kind + '(\n';
      out += pad + '    modifier = ' + gm + chain + (args ? ',\n' + pad + '        ' + args : '') + ',\n';
      out += pad + ') {\n' + childrenBody(node, depth + 1, kind) + '\n' + pad + '}';
      return out;
    }
    case 'text': {
      // 文本表达式（M2/M4b 动态：bindParts 混合段 / bindExpr 三元 / dynField 循环字段 / bind state / ref 组件参数 / 静态 text）
      let textExpr: string;
      if (p.bindParts) {
        const segs = p.bindParts
          .map((seg): string => {
            if ('text' in seg) return String(seg.text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '${\'$\'}').replace(/\n/g, '\\n');
            if ('bind' in seg) return '${' + loopField(seg.bind, loop) + '}';
            if ('fieldOf' in seg)
              return (
                '${vrnField(' +
                seg.fieldOf.obj +
                ', "' +
                seg.fieldOf.field +
                '"' +
                (seg.fieldOf.fallback !== undefined ? ', "' + seg.fieldOf.fallback.replace(/"/g, '\\"') + '"' : '') +
                ')}'
              );
            return '${' + loopField(seg.dynField.var, loop) + '["' + seg.dynField.field + '"] ?: ""}';
          })
          .join('');
        textExpr = '"' + segs + '"';
      } else if (p.fieldOf) {
        textExpr =
          '"${vrnField(' +
          p.fieldOf.obj +
          ', "' +
          p.fieldOf.field +
          '"' +
          (p.fieldOf.fallback !== undefined ? ', "' + p.fieldOf.fallback.replace(/"/g, '\\"') + '"' : '') +
          ')}"';
      } else if (p.dynField) {
        textExpr = '"${' + loopField(p.dynField.var, loop) + '["' + p.dynField.field + '"] ?: ""}"';
      } else if (p.bindExpr !== undefined) {
        textExpr = kotlinStringExpr(p.bindExpr);
      } else if (p.bind !== undefined) {
        textExpr = '"${' + loopField(p.bind, loop) + '}"';
      } else if (p.ref !== undefined) {
        textExpr = '"${' + loopField(p.ref, loop) + '}"';
      } else {
        textExpr = kotlinStr(String(p.text ?? ''));
      }
      // R-TEXTCLICK：@click 挂在 text 上（<span @click>）→ clickable（此前静默丢失交互）
      const click = kotlinClickAction(p, ctx, loop);
      const chain = modChain(
        [...stretchModifiers(parentStretch, node), ...sizeModifiers(p), flexModifier(p), ...paddingModifiers(p), ...alphaArr, ...transformModifiers(p)].concat(click ? ['Modifier.clickable { ' + click + ' }'] : []),
        pad + '            ',
      );
      const style: string[] = [];
      if (p.fontSize !== undefined) style.push('fontSize = ' + sp(p.fontSize));
      else if (p.fontSizeDynamic !== undefined) style.push('fontSize = ' + p.fontSizeDynamic + '.sp');
      if (p.fontWeight !== undefined) style.push('fontWeight = FontWeight.' + (p.fontWeight === 'bold' ? 'Bold' : p.fontWeight === 'medium' ? 'Medium' : 'Normal'));
      if (p.lineHeight !== undefined) style.push('lineHeight = ' + sp(p.lineHeight));
      if (p.colorActive) {
        style.push('color = if (' + kotlinCondExpr(p.colorActive.when) + ') ' + colorExpr(p.colorActive.color) + ' else ' + colorExpr(p.color ?? '#ffffff'));
      } else if (p.colorDynamic !== undefined) {
        style.push('color = dynamicColor(' + p.colorDynamic + ')');
      } else if (p.color !== undefined) {
        style.push('color = ' + colorExpr(p.color));
      }
      if (p.textAlign !== undefined) style.push('textAlign = TextAlign.' + (p.textAlign === 'center' ? 'Center' : p.textAlign === 'right' ? 'Right' : 'Start'));
      let out = pad + 'Text(\n';
      out += pad + '    text = ' + textExpr + ',\n';
      if (style.length > 0) out += pad + '    ' + style.join(',\n' + pad + '    ') + ',\n';
      if (chain) out += pad + '    modifier = Modifier' + chain + ',\n';
      out += pad + ')';
      return out;
    }
    case 'button': {
      const chain = modChain([...stretchModifiers(parentStretch, node), ...sizeModifiers(p), ...absModifiers(p), ...clipModifiers(p), ...visualModifiers(p), ...borderModifiers(p), ...paddingModifiers(p), ...alphaArr, ...transformModifiers(p)], pad + '            ');
      // R108：动态按钮文案（props.bind）优先；Kotlin 里用字符串模板插值
      const label = p.bind !== undefined ? '"${' + String(p.bind) + '}"' : (p.label ?? '');
      const click = kotlinClickAction(p, ctx, loop);
      const labelStyle: string[] = [];
      if (p.fontSize !== undefined) labelStyle.push('fontSize = ' + sp(p.fontSize));
      else if (p.fontSizeDynamic !== undefined) labelStyle.push('fontSize = ' + p.fontSizeDynamic + '.sp');
      if (p.color !== undefined) labelStyle.push('color = ' + colorExpr(p.color));
      else if (p.colorDynamic !== undefined) labelStyle.push('color = dynamicColor(' + p.colorDynamic + ')');
      let out = pad + 'Button(\n';
      out += pad + '    onClick = { ' + click + ' },\n';
      if (p.disabled === true) out += pad + '    enabled = false,\n';
      if (chain) out += pad + '    modifier = Modifier' + chain + ',\n';
      out += pad + ') {\n' + pad + '    Text(' + kotlinStr(label) + (labelStyle.length ? ', ' + labelStyle.join(', ') : '') + ')\n' + pad + '}';
      return out;
    }
    case 'input': {
      // M1 v-model（页面级 string 状态双向绑定；组件内或非 string 状态不支持 → 显式降级注释）
      const st = p.value ?? p.model;
      const known = st !== undefined && (ctx.states ?? []).some((s) => s.name === st && s.type === 'string');
      if (!known) {
        ctx.warnings.push('input: v-model「' + String(st) + '」非页面级 string 状态（Android 暂只支持该形态），已生成占位注释');
        return pad + '// input: v-model ' + kotlinStr(String(st)) + ' 未支持（Android 仅页面级 string state）';
      }
      const chain = modChain([...stretchModifiers(parentStretch, node), ...sizeModifiers(p), ...absModifiers(p), ...paddingModifiers(p), ...alphaArr, ...transformModifiers(p)], pad + '            ');
      const ts: string[] = [];
      if (p.fontSize !== undefined) ts.push('fontSize = ' + sp(p.fontSize));
      if (p.color !== undefined) ts.push('color = ' + colorExpr(p.color));
      let out = pad + 'OutlinedTextField(\n';
      out += pad + '    value = ' + st + ',\n';
      out += pad + '    onValueChange = { ' + st + ' = it },\n';
      if (p.placeholder !== undefined) out += pad + '    placeholder = { Text(' + kotlinStr(p.placeholder) + ') },\n';
      if (ts.length > 0) out += pad + '    textStyle = LocalTextStyle.current.copy(' + ts.join(', ') + '),\n';
      if (chain) out += pad + '    modifier = Modifier' + chain + ',\n';
      out += pad + ')';
      return out;
    }
    case 'image': {
      const chain = modChain([...stretchModifiers(parentStretch, node), ...sizeModifiers(p), ...absModifiers(p), ...clipModifiers(p), ...visualModifiers(p), ...paddingModifiers(p), ...alphaArr, ...transformModifiers(p)], pad + '            ');
      if (p.src) ctx.warnings.push('image src="' + p.src + '" 资源桥未实现（A5 TODO），生成占位 Box');
      let out = pad + '// image src=' + (p.src ?? '') + '（A5 资源桥 TODO）\n';
      out += pad + 'Box(\n' + pad + '    modifier = Modifier' + chain + ',\n' + pad + ') {}';
      return out;
    }
    case 'spacer': {
      const chain = modChain([flexModifier(p), ...sizeModifiers(p)], pad + '            ');
      return pad + 'Spacer(\n' + pad + '    modifier = Modifier' + chain + ',\n' + pad + ')';
    }
    case 'divider': {
      const chain = modChain([...sizeModifiers(p), ...visualModifiers(p), ...paddingModifiers(p)], pad + '            ');
      return pad + 'HorizontalDivider(\n' + pad + '    modifier = Modifier' + chain + ',\n' + pad + ')';
    }
    case 'scroll': {
      const chain = modChain([...sizeModifiers(p), ...paddingModifiers(p)], pad + '            ');
      return pad + 'Column(\n' + pad + '    modifier = Modifier' + chain + '.verticalScroll(rememberScrollState()),\n' + pad + ') {\n' + childrenBody(node, depth + 1, 'Column') + '\n' + pad + '}';
    }
    case 'for': {
      // M2 v-for 常量数组（对位 iOS：数据声明 + forEach 循环，item 字段引用展开）
      const vf = node.vfor;
      if (!vf || !node.children || node.children.length === 0) {
        return pad + '// for: 缺 vfor 或项模板';
      }
      if (vf.listState) {
        ctx.warnings.push('v-for 动态列表 ' + vf.listState + ' 未实现（需数据桥，A5 TODO）——该列表不生成');
        return pad + '// for: 动态列表 ' + vf.listState + ' TODO（A5 后需数据桥）';
      }
      const list = vf.list ?? [];
      if (list.length === 0) return pad + '// for: 空列表';
      const isObjArr = list.every((v) => typeof v === 'object' && v !== null);
      const propName = vf.srcName && /^[A-Za-z_]\w*$/.test(vf.srcName) ? vf.srcName : 'vforList';
      const emitLoop = (d: number): string => {
        const pd = '  '.repeat(d);
        let decl: string;
        if (isObjArr) {
          // keys 取全部元素并集（首元素可能缺字段，缺省补 ""）
          const keys = [...new Set(list.flatMap((v) => Object.keys(v as Record<string, unknown>)))];
          decl = pd + 'val ' + propName + ' = listOf(\n' +
            list
              .map((v) => pd + '        ' + 'mapOf(' + keys.map((k) => kotlinStr(k) + ' to ' + kotlinStr(String((v as Record<string, unknown>)[k] ?? ''))).join(', ') + ')')
              .join(',\n') +
            '\n' + pd + '    )';
        } else {
          decl = pd + 'val ' + propName + ' = listOf(' + list.map((v) => (typeof v === 'number' ? String(v) : kotlinStr(String(v)))).join(', ') + ')';
        }
        const loopCtx = { itemKey: vf.itemKey, indexKey: vf.indexKey };
        const items = node.children!.map((c) => emitNode(c, ctx, d + 1, loopCtx)).join('\n');
        let out = decl + '\n';
        out += pd + (vf.indexKey ? propName + '.forEachIndexed { ' + vf.indexKey + ', ' + vf.itemKey + ' ->' : propName + '.forEach { ' + vf.itemKey + ' ->') + '\n';
        out += items + '\n';
        out += pd + '}';
        return out;
      };
      // for 自身布局 props（schema 允许 flexDirection/gap/padding/background）→ 包一层容器承载
      const hasLayout = p.flexDirection !== undefined || p.gap !== undefined || p.padding !== undefined || p.background !== undefined;
      if (!hasLayout) return emitLoop(depth);
      const kind = containerKind(p);
      const args = arrangementExpr(p, kind);
      const chain = modChain([...clipModifiers(p), ...visualModifiers(p), ...paddingModifiers(p)], pad + '            ');
      let out = pad + kind + '(\n';
      out += pad + '    modifier = Modifier' + chain + (args ? ',\n' + pad + '        ' + args : '') + ',\n';
      out += pad + ') {\n' + emitLoop(depth + 1) + '\n' + pad + '}';
      return out;
    }
    case 'component': {
      const name = compKotlinName(p.name ?? 'Unknown');
      const attrEntries = Object.entries(p.attrs ?? {}).map(([k, v]) => {
        const vs = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v === true ? 'true' : v === false ? 'false' : String((v as { expr: string }).expr);
        const lf = loopField(vs, loop);
        return k + ' = ' + (lf !== vs ? lf : kotlinStr(vs));
      });
      const click = kotlinClickAction(p, ctx, loop);
      // 布局 props（vue2ir 将组件根的 flex/width/height/marginTop 剥离到使用点）→ modifier 参数
      const mods = [
        ...stretchModifiers(parentStretch, node),
        ...sizeModifiers(p),
        flexModifier(p),
        ...absModifiers(p),
        ...alphaArr,
        ...transformModifiers(p),
      ].concat(click ? ['Modifier.clickable { ' + click + ' }'] : []);
      // R-MODCHAIN：过滤空串（flexModifier 无 flex 返回 '' 等）+ 补 Modifier 前缀——
      // 裸 join 会让首项丢前缀（modifier = .clickable {...}）产生非法 Kotlin（真机 Gradle 编译暴露）
      const args = [...attrEntries];
      const modSteps = mods.filter((m) => m.length > 0).map((m) => m.replace(/^Modifier\./, ''));
      if (modSteps.length > 0) {
        args.push('modifier = Modifier.' + modSteps.join('.'));
      }
      return pad + name + '(' + args.join(', ') + ')';
    }
    default:
      ctx.warnings.push('node type ' + node.type + ' 未映射（首版静态子集）');
      return pad + '// TODO: ' + node.type;
  }
}

/* ================= Router 解析（对位 gen-ios.ts parseRouter） ================= */

/** R40 组件表：页面同目录 + 向上逐级查找 components/*.vue（对位 gen-ios loadComponents，支持样例根共享组件）
 *  优先级：页面本地 components/ 覆盖祖先目录同名组件（先收集祖先、最后收集本地） */
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

function loadComponents(pageFile: string): Record<string, string> {
  const dirs: string[] = [];
  let up = dirname(pageFile);
  for (let i = 0; i < 6 && up !== dirname(up); i++) {
    const cand = join(up, 'components');
    if (existsSync(cand) && readdirSync(cand).some((f) => f.endsWith('.vue'))) dirs.push(cand);
    up = dirname(up);
  }
  const local = join(dirname(pageFile), 'components');
  if (existsSync(local)) dirs.push(local);
  const table: Record<string, string> = {};
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.vue')) continue;
      const name = f.slice(0, -4);
      table[toPascal(name)] = readFileSync(join(dir, f), 'utf-8');
    }
  }
  return table;
}

/** 收集组件 IR 中的 ref 参数名（text props.ref → 组件函数参数） */
function collectRefs(node: IrNode, acc: Set<string> = new Set()): Set<string> {
  const p = node.props as IrProps;
  if (p.ref) acc.add(p.ref);
  for (const c of node.children ?? []) collectRefs(c, acc);
  return acc;
}

/** 组件 → 独立 Composable 文件（对位 iOS 组件独立 Swift 文件） */
function emitComponentFile(name: string, ui: IrNode, bundleId: string): string {
  const refs = [...collectRefs(ui)];
  const params = refs.map((r) => `${r}: String`).join(',\n    ');
  const ctx: ComposeCtx = { warnings: [], pageId: 'comp' };
  const body = emitNode(ui, ctx, 1, undefined, true);
  const imports = IMPORTS_KT;
  return `package ${bundleId}\n\n${imports}\n@Composable\nfun ${compKotlinName(name)}(\n    ${params}${refs.length ? ',' : ''}\n    modifier: Modifier = Modifier,\n) {\n${body}\n}\n`;
}

const IMPORTS_KT = `import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.foundation.border
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
`;

const TAB_ICONS = ['home.fill', 'book.fill', 'square.grid.2x2.fill', 'bell.fill', 'gearshape.fill', 'explore', 'work'];

/** tab 文案拆 2 字一行（对位 iOS 窄 tab 自动换行视觉） */
function tabLabel(title: string): string {
  const t = title.replace(/\s+/g, '');
  return t.length > 2 ? t.match(/.{1,2}/g)!.join('\\n') : t;
}

/**
 * 工程根推导（R75）：路由文件可能在 src/router/index.ts，`@/` 别名需要相对「工程根」解析。
 * 自 startDir 向上找 含 package.json 或 src/ 的目录（最多 6 层）。
 */
export function findProjectRoot(startDir: string): string {
  let d = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(d, 'package.json')) || existsSync(join(d, 'src'))) return d;
    const parent = dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return startDir;
}

/**
 * R75 router 解析器 v2：支持真实 Vue 工程的路由写法
 *  - 静态 import X from 'p' 与 动态 component: () => import('p')
 *  - `@/` 别名（映射到 <appDir>/src/）与相对路径
 *  - 多行路由对象（按 {} 配平扫描，不再依赖整行正则）
 *  - 路径参数（/detail/:id）→ 原生侧降级为无参路径 + 警告（R15）
 * 返回 tabs/details + warnings（由调用方打印）
 */
function parseRouter(
  src: string,
  dir: string,
  routerFile?: string,
): {
  tabs: { id: string; title: string; file: string; icon: string; path: string }[];
  details: { id: string; title: string; file: string; path: string }[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const imports: Record<string, string> = {};
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g)) imports[m[1]] = m[2];

  /** 别名/相对路径 → 磁盘路径（先找 @/ → src，再退回 appDir 根） */
  const baseDir = routerFile ? dirname(routerFile) : dir;
  const resolveFile = (spec: string): string => {
    const cands: string[] = [];
    if (spec.startsWith('@/')) {
      const rel = spec.slice(2);
      cands.push(join(dir, 'src', rel), join(dir, rel));
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      // 相对路径以「路由文件所在目录」为基准
      cands.push(join(baseDir, spec), join(dir, spec));
    } else {
      cands.push(join(dir, spec), join(dir, 'src', spec));
    }
    return cands.find((c) => existsSync(c)) ?? cands[0];
  };

  // 配平扫描所有「含 path:」的对象块
  const blocks: string[] = [];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] !== '{') continue;
    let depth = 0;
    let quote = '';
    let j = i;
    for (; j < src.length; j += 1) {
      const ch = src[j];
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const block = src.slice(i, j + 1);
    if (/\bpath\s*:/.test(block)) blocks.push(block);
    i = j;
  }

  const routes: { path: string; name: string; component: string; file: string; meta: Record<string, string> }[] = [];
  for (const block of blocks) {
    const pm = block.match(/\bpath\s*:\s*['"]([^'"]*)['"]/);
    if (!pm) continue;
    const rawPath = pm[1];
    const nm = block.match(/\bname\s*:\s*['"]([^'"]*)['"]/);
    const cm = block.match(/\bcomponent\s*:\s*(?:\(\s*\)\s*=>\s*)?import\(\s*['"]([^'"]+)['"]\s*\)|\bcomponent\s*:\s*([A-Za-z_$][\w$]*)/);
    const compSpec = cm?.[1];
    const compIdent = cm?.[2];
    const file = compSpec ? resolveFile(compSpec) : compIdent ? resolveFile(imports[compIdent] ?? '') : '';
    // meta 解析（允许单行/多行）
    const meta: Record<string, string> = {};
    const mm = block.match(/\bmeta\s*:\s*\{([\s\S]*?)\}/);
    if (mm) {
      for (const kv of mm[1].split(',')) {
        const r = kv.match(/^\s*(\w+)\s*:\s*(true|false|'([^']*)'|"([^"]*)"|\w+)\s*$/);
        if (!r) continue;
        meta[r[1]] = r[2] === 'true' ? 'true' : r[2] === 'false' ? 'false' : r[3] ?? r[4] ?? r[2];
      }
    }
    const path = rawPath.replace(/\/:\w+\??/g, '');
    if (path !== rawPath) warnings.push(`路由「${rawPath}」含路径参数，原生侧降级为无参路径「${path || '/'}」（R15）`);
    routes.push({
      path: path === '' ? '/' : path,
      name: nm?.[1] ?? (path.replace(/\//g, '-').replace(/^-|-$/g, '') || 'home'),
      component: compIdent ?? '',
      file,
      meta,
    });
  }

  const hasText = (file: string): boolean => {
    if (!file || !existsSync(file)) return true;
    const tpl = readFileSync(file, 'utf-8').match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '';
    return tpl.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length > 0;
  };

  const tabs = routes
    .filter((r) => r.meta.tab === 'true' && hasText(r.file))
    .map((r, i) => ({
      id: r.name,
      title: r.meta.title ?? r.name,
      file: r.file,
      icon: r.meta.icon ?? TAB_ICONS[i % TAB_ICONS.length],
      path: r.path,
    }));
  const details = routes
    .filter((r) => r.meta.tab !== 'true')
    .map((r) => ({ id: r.name, title: r.meta.title ?? r.name, file: r.file, path: r.path }));

  if (tabs.length === 0) {
    warnings.push('router 未解析到任何 tab 路由（routes 需含 meta: { tab: true }）');
  }
  return { tabs, details, warnings };
}

/* ================= 工程生成（对位 runTabs） ================= */

/** Material Icons 映射（router meta.icon：iOS SF Symbols / 简写 → compose material icon） */
const ICON_MAP: Record<string, string> = {
  // SF Symbols（router.ts meta.icon 直接复用 iOS 侧）
  'book.fill': 'Icons.AutoMirrored.Filled.MenuBook',
  'square.grid.2x2.fill': 'Icons.Filled.GridView',
  'textformat.abc': 'Icons.Filled.TextFields',
  'bell.fill': 'Icons.Filled.Notifications',
  'photo.fill': 'Icons.Filled.Photo',
  'arrow.triangle.branch': 'Icons.AutoMirrored.Filled.AltRoute',
  'bag.fill': 'Icons.Filled.ShoppingBag',
  'gearshape.fill': 'Icons.Filled.Settings',
  'home.fill': 'Icons.Filled.Home',
  'person.fill': 'Icons.Filled.Person',
  'cart.fill': 'Icons.Filled.ShoppingCart',
  'star.fill': 'Icons.Filled.Star',
  // 简写兜底
  home: 'Icons.Filled.Home', menu: 'Icons.Filled.Menu', book: 'Icons.AutoMirrored.Filled.MenuBook',
  grid: 'Icons.Filled.GridView', chat: 'Icons.Filled.Email', user: 'Icons.Filled.Person',
  explore: 'Icons.Filled.Explore', work: 'Icons.Filled.Work', settings: 'Icons.Filled.Settings',
};

export interface RunTabsOptions {
  /** 产物根（默认 <repo>/compiler/generated/android 或 VRN_OUT_DIR） */
  outDirRoot?: string;
  /** 工程名（默认入口目录名 PascalCase） */
  projectName?: string;
  /** bundle id（默认 com.vrn.<projectname 小写>） */
  bundleId?: string;
  /** 显式路由文件（支持 src/router/index.ts 等非标准命名；默认 <appDir>/router.ts） */
  routerFile?: string;
  /** P2：工程骨架模板由 @dongmingzhixiu/vuexir-templates 提供、CLI 注入（避免 compiler → templates 的依赖倒挂）
   *  回调式：runTabs 计算完 projectName/bundleId 后再渲染模板，避免调用方拿不到最终值 */
  renderGradle?: (projectName: string, bundleId: string) => string;
  templateVersion?: string;
}

function runTabs(appDir: string, opts: RunTabsOptions = {}): string {
  const routerSrc = readFileSync(opts.routerFile ?? join(appDir, 'router.ts'), 'utf-8');
  const { tabs, details, warnings: routerWarnings } = parseRouter(routerSrc, findProjectRoot(appDir), opts.routerFile ?? join(appDir, 'router.ts'));
  for (const w of routerWarnings) console.log(`[gen-android] 路由提示: ${w}`);
  console.log(`[gen-android] 多页模式: router.ts → ${tabs.length} 个 tab 页面` + (details.length ? ` + ${details.length} 个 push 页面` : ''));

  const projectName = opts.projectName ? toPascal(opts.projectName) : toPascal(basename(appDir));
  const bundleId = opts.bundleId ?? `com.vrn.${projectName.toLowerCase()}`;
  const outDir = join(opts.outDirRoot ?? OUT_ROOT, projectName);
  // R18：全量重生成前清空工程目录，防改名/删除页面的陈旧产物参与 Gradle 构建
  rmSync(outDir, { recursive: true, force: true });
  const pkgDir = join(outDir, 'app/src/main/java', ...bundleId.split('.'));
  mkdirSync(pkgDir, { recursive: true });

  // 1) Gradle 工程骨架
  writeFileSync(join(outDir, 'settings.gradle.kts'), SETTINGS_GRADLE(projectName));
  writeFileSync(join(outDir, 'build.gradle.kts'), ROOT_BUILD_GRADLE);
  writeFileSync(join(outDir, 'gradle.properties'), GRADLE_PROPERTIES);
  mkdirSync(join(outDir, 'app'), { recursive: true });
  writeFileSync(join(outDir, 'app/build.gradle.kts'), (opts.renderGradle ?? (() => ''))(projectName, bundleId));
  mkdirSync(join(outDir, 'app/src/main'), { recursive: true });
  writeFileSync(join(outDir, 'app/src/main/AndroidManifest.xml'), MANIFEST(projectName));
  const resDir = join(outDir, 'app/src/main/res/values');
  mkdirSync(resDir, { recursive: true });
  writeFileSync(join(resDir, 'styles.xml'), STYLES_XML);
  writeFileSync(join(pkgDir, 'Theme.kt'), THEME_KT(bundleId));
  writeFileSync(join(pkgDir, 'MainActivity.kt'), MAIN_ACTIVITY(bundleId));
  writeFileSync(join(pkgDir, 'Runtime.kt'), RUNTIME_KT(bundleId));
  // NavTest 断言绑定 vuexir-demo 文案：仅对参考样例生成，其他样例跳过（防无意义失败用例）
  if (projectName.toLowerCase() === 'vuexirdemo') {
    const navTestPath = join(outDir, 'app/src/androidTest/java', ...bundleId.split('.'), 'NavTest.kt');
    mkdirSync(dirname(navTestPath), { recursive: true });
    writeFileSync(navTestPath, NAV_TEST_KT(bundleId));
  }

  // 2) 页面生成（tab + detail → <Id>View.kt / <Id>DetailView.kt）；组件按名去重（首见为准，对位 iOS compSeen）
  const pagesDir = join(pkgDir, 'pages');
  const compDir = join(pkgDir, 'components');
  mkdirSync(pagesDir, { recursive: true });
  mkdirSync(compDir, { recursive: true });
  const compSeen = new Set<string>();
  const writeComponents = (comps: { name: string; ui: IrNode }[] | undefined): void => {
    for (const c of comps ?? []) {
      if (compSeen.has(c.name)) continue;
      compSeen.add(c.name);
      writeFileSync(join(compDir, `${compKotlinName(c.name)}.kt`), emitComponentFile(c.name, c.ui, bundleId));
    }
  };
  const viewFiles: { id: string; title: string; icon: string; file: string }[] = [];
  const detailViews: { id: string; title: string; path: string; bg?: string; backText?: string; mode?: string }[] = [];
  for (const tab of tabs) {
    if (ICON_MAP[tab.icon] === undefined) {
      console.log(`[gen-android] ⚠ icon「${tab.icon}」（tab ${tab.id}）不在映射表，回退 Home 图标`);
    }
    const src = readFileSync(tab.file, 'utf-8');
    const pageId = toPascal(tab.id);
    const r = vueToIr(src, {
      screenId: tab.id,
      title: tab.title,
      components: loadComponents(tab.file),
      storeSources: loadStoreSources(tab.file),
    });
    if (r.warnings.length > 0) {
      console.log(`[gen-android] 编译提示（${tab.id}，${r.warnings.length} 条）:`);
      for (const w of r.warnings) console.log(`  - ${w}`);
    }
    const v = validateIr(r.screen);
    if (!v.ok) {
      console.error(`[gen-android] IR 校验失败（${tab.id}）:`);
      for (const i of v.issues) console.error(`  ${i.path}: ${i.message}`);
      process.exit(1);
    }
    writeComponents(r.components);
    const ctx: ComposeCtx = {
      warnings: [],
      pageId: tab.id,
      states: (r.screen.state ?? []).map((st) => ({ name: st.name, type: typeof st.init === 'string' ? 'string' : typeof st.init === 'boolean' ? 'boolean' : 'number', init: st.init })),
      handlers: r.screen.handlers,
      onMountedBody: r.screen.onMounted,
      onMountedAsync: r.screen.onMountedAsync === true,
    };
    const body = emitNode(r.screen.ui, ctx, 1);
    for (const w of ctx.warnings) console.log(`[gen-android] 生成提示（${tab.id}）: ${w}`);
    const kt = `package ${bundleId}\n\n${IMPORTS_KT}\n${body}\n`;
    writeFileSync(join(pagesDir, `${pageId}View.kt`), kt);
    viewFiles.push({ id: tab.id, title: tab.title, icon: tab.icon, file: `${pageId}View.kt` });
    console.log(`[gen-android]   - ${pageId}View.kt · tab「${tab.title}」`);
  }

  for (const d of details) {
    const src = readFileSync(d.file, 'utf-8');
    const pageId = toPascal(d.id);
    const r = vueToIr(src, {
      screenId: d.id,
      title: d.title,
      components: loadComponents(d.file),
      storeSources: loadStoreSources(d.file),
    });
    if (r.warnings.length > 0) {
      console.log(`[gen-android] 编译提示（${d.id}，${r.warnings.length} 条）:`);
      for (const w of r.warnings) console.log(`  - ${w}`);
    }
    const v = validateIr(r.screen);
    if (!v.ok) {
      console.error(`[gen-android] IR 校验失败（${d.id}）:`);
      for (const i of v.issues) console.error(`  ${i.path}: ${i.message}`);
      process.exit(1);
    }
    writeComponents(r.components);
    const ctx: ComposeCtx = {
      warnings: [],
      pageId: `${d.id}Detail`,
      states: (r.screen.state ?? []).map((st) => ({ name: st.name, type: typeof st.init === 'string' ? 'string' : typeof st.init === 'boolean' ? 'boolean' : 'number', init: st.init })),
      handlers: r.screen.handlers,
      onMountedBody: r.screen.onMounted,
      onMountedAsync: r.screen.onMountedAsync === true,
    };
    const body = emitNode(r.screen.ui, ctx, 1);
    for (const w of ctx.warnings) console.log(`[gen-android] 生成提示（${d.id}）: ${w}`);
    const kt = `package ${bundleId}\n\n${IMPORTS_KT}\n${body}\n`;
    writeFileSync(join(pagesDir, `${pageId}DetailView.kt`), kt);
    // M7 对位 iOS：详情页导航栏参数（IR navBar 优先，router title 兜底；R66 子集 title/bg/backText/mode）
    const nav = r.screen.navBar;
    detailViews.push({ id: d.id, title: nav?.title ?? d.title, path: d.path, bg: nav?.bg, backText: nav?.backText, mode: nav?.mode });
    console.log(`[gen-android]   - ${pageId}DetailView.kt · push「${d.title}」`);
  }

  // 3) AppNavHost.kt（router.ts → NavHost + NavigationBar）
  const navHost = buildNavHost(bundleId, tabs, detailViews);
  writeFileSync(join(pkgDir, 'AppNavHost.kt'), navHost);

  // P2：写 .vrn/manifest.json（工具链/模板版本 + 文件清单），供 vrn doctor 校验与增量重生成
  const metaDir = join(outDir, '.vrn');
  mkdirSync(metaDir, { recursive: true });
  const rootFiles = ['settings.gradle.kts', 'build.gradle.kts', 'gradle.properties', 'app/build.gradle.kts', 'app/src/main/AndroidManifest.xml'];
  writeFileSync(
    join(metaDir, 'manifest.json'),
    JSON.stringify(
      {
        toolchain: '0.1.0',
        templateVersion: opts.templateVersion ?? '0.0.0',
        platform: 'android',
        projectName,
        bundleId,
        generatedAt: new Date().toISOString(),
        templates: ['settings.gradle.kts', 'build.gradle.kts', 'app/build.gradle.kts', 'gradle.properties'],
        files: [...viewFiles.map((v) => `app/src/main/java/${bundleId.replace(/\./g, '/')}/pages/${v.file}`), ...detailViews.map((d) => `app/src/main/java/${bundleId.replace(/\./g, '/')}/pages/${toPascal(d.id)}DetailView.kt`), ...rootFiles].sort(),
      },
      null,
      2,
    ),
  );
  console.log(`[gen-android] 完成: ${outDir}（${viewFiles.length} tab + ${detailViews.length} detail）`);
  return outDir;
}

function buildNavHost(
  bundleId: string,
  tabs: { id: string; title: string; icon: string; path: string }[],
  details: { id: string; title: string; path: string; bg?: string; backText?: string; mode?: string }[],
): string {
  // R-CHROME：tab 顶/底栏由 tab 路由自己的 TabScaffold 承载（而非容器层按 currentRoute 开关）。
  // 容器层开关的缺陷：导航瞬间 currentRoute 已变 detail，退出动画中的 tab 页仍在绘制，
  // 其顶/底栏立即消失、innerPadding 塌缩 → 内容瞬时顶到系统栏，随后详情页才滑入（视觉跳变）。
  const tabRoutes = tabs
    .map(
      (t) => `composable("${t.id}") { TabScaffold("${t.id}", onSelectTab) { p -> ${toPascal(t.id)}Content(modifier = Modifier.padding(p)) } }
        composable("${t.path}") { TabScaffold("${t.id}", onSelectTab) { p -> ${toPascal(t.id)}Content(modifier = Modifier.padding(p)) } }`,
    )
    .join('\n        ');
  // M7 对位 iOS NavigationStack：详情页内层 Scaffold + TopAppBar（标题 + 返回箭头/backText、mode=transparent 透明背景）
  const detailRoutes = details
    .map((d) => {
      const navIcon = d.backText
        ? `IconButton(onClick = { navController.popBackStack() }) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                                    Text(" ${d.backText}")
                                }
                            }`
        : `IconButton(onClick = { navController.popBackStack() }) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                            }`;
      const barColor = d.mode === 'transparent' ? 'Color.Transparent' : d.bg ? colorExpr(d.bg) : 'InkBar';
      return `composable("${d.path}") {
            Scaffold(
                containerColor = InkBg,
                topBar = {
                    TopAppBar(
                        title = { Text(${kotlinStr(d.title)}, fontSize = 17.sp, fontWeight = FontWeight.Medium) },
                        navigationIcon = {
                            ${navIcon}
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = ${barColor},
                            navigationIconContentColor = Gold,
                            titleContentColor = Gold,
                        ),
                    )
                },
            ) { innerPadding ->
                ${toPascal(d.id)}DetailContent(modifier = Modifier.padding(innerPadding))
            }
        }`;
    })
    .join('\n            ');
  const barItems = tabs
    .map(
      (t) => `NavigationBarItem(
                selected = currentTab == "${t.id}",
                onClick = { onSelectTab("${t.id}") },
                icon = { Icon(${ICON_MAP[t.icon] ?? 'Icons.Default.Home'}, contentDescription = "${t.title}") },
                label = { Text("${tabLabel(t.title)}", fontSize = 10.sp, textAlign = TextAlign.Center) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Gold,
                    selectedTextColor = Gold,
                    unselectedIconColor = SubText,
                    unselectedTextColor = SubText,
                    indicatorColor = Gold.copy(alpha = 0.14f),
                )
            )`,
    )
    .join('\n                ');
  const tabTitleExpr = `when (currentTab) {\n${tabs.map((t) => `        "${t.id}" -> ${kotlinStr(t.title)}`).join('\n')}\n        else -> ""\n    }`;

  return `package ${bundleId}

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.*

/**
 * R-CHROME：tab 页外壳（顶栏动态标题 + 底部导航栏）。
 * 栏归路由自身所有——push 详情页时随该 tab 页一起退出，内容内边距不塌缩，杜绝「先顶到系统栏再跳转」。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TabScaffold(currentTab: String, onSelectTab: (String) -> Unit, content: @Composable (PaddingValues) -> Unit) {
    Scaffold(
        containerColor = InkBg,
        topBar = {
            TopAppBar(
                title = { Text(${tabTitleExpr}, fontSize = 17.sp, fontWeight = FontWeight.Medium) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = InkBar,
                    titleContentColor = Gold,
                ),
            )
        },
        bottomBar = {
            NavigationBar(containerColor = InkBar) {
                ${barItems}
            }
        },
    ) { innerPadding ->
        content(innerPadding)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    // A5 路由桥：Runtime.push(route) → NavHost navigate
    LaunchedEffect(Unit) {
        Runtime.pushHandler = { route -> navController.navigate(route) }
    }
    // tab 切换：popUpTo 首 tab 保留栈底 + saveState/restoreState 保留各页状态（对位 iOS 常驻页面实例）
    val onSelectTab: (String) -> Unit = { tabId ->
        navController.navigate(tabId) {
            popUpTo("${tabs[0]?.id}") { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
    NavHost(
        navController = navController,
        startDestination = "${tabs[0]?.id}",
    ) {
        ${tabRoutes}
        ${detailRoutes}
    }
}
`;
}

/* ================= 入口 ================= */

/**
 * 输入解析（R-PKG）：CLI 通过 VRN_SAMPLES_ROOT 注入样例根（默认 <repo>/examples）。
 * 依次尝试：样例名 → 目录 → 直接路径；都不存在时原样返回由调用方报错。
 */
function resolveInput(arg: string | undefined): string {
  if (!arg || arg === 'all') return DEFAULT_INPUT;
  const byName = join(SAMPLES_DIR, arg);
  if (existsSync(byName)) return byName;
  return existsSync(arg) ? arg : arg;
}

export {
  runTabs,
  emitNode,
  emitComponentFile,
  loadComponents,
  parseRouter,
  buildNavHost,
  resolveInput,
  RUNTIME_KT,
  THEME_KT,
  NAV_TEST_KT,
  MAIN_ACTIVITY,
  MANIFEST,
  STYLES_XML,
};
