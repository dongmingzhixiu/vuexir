import type { IrNode } from '../ir/schema.js';
declare const MANIFEST: (label: string) => string;
declare const STYLES_XML = "<resources>\n    <!-- R-SYSTEMBAR\uFF1A\u56FA\u5B9A\u6DF1\u8272\u4E3B\u9898 \u2192 \u7CFB\u7EDF\u680F\u56FE\u6807\u56FA\u5B9A\u6D45\u8272\uFF08windowLightStatusBar=false\uFF09\uFF0C\u4E0D\u8DDF\u968F\u7CFB\u7EDF\u660E\u6697 -->\n    <style name=\"Theme.Vuexir\" parent=\"android:Theme.Material.NoActionBar\">\n        <item name=\"android:windowBackground\">#0A0F1E</item>\n        <item name=\"android:statusBarColor\">#0A0F1E</item>\n        <item name=\"android:navigationBarColor\">#0A0F1E</item>\n        <item name=\"android:windowLightStatusBar\">false</item>\n    </style>\n</resources>\n";
declare const MAIN_ACTIVITY: (projectName: string) => string;
declare const THEME_KT: (bundleId: string) => string;
declare const RUNTIME_KT: (bundleId: string) => string;
declare const NAV_TEST_KT: (bundleId: string) => string;
interface ComposeCtx {
    warnings: string[];
    pageId: string;
    /** R72 异步：本页是否需要协程作用域（async handler / async onMounted）→ 页面 composable 声明 vrnScope */
    needsScope?: boolean;
    /** 常量数组（v-for 数据，首版生成 Kotlin 内联列表） */
    lists?: Record<string, string[]>;
    /** 页面状态（script setup ref → remember mutableStateOf） */
    states?: {
        name: string;
        type: 'string' | 'number' | 'boolean';
        init: string | number | boolean;
    }[];
    /** M3 handler 函数（@click="fn()" 引用；body 已做 .value → stateStore 重写，Kotlin 侧反向内联）
     *  R72：async:true → 走协程形状翻译（fetch/setTimeout/await 子集），形状外回退 TODO 注释 + warning */
    handlers?: {
        name: string;
        params: string;
        body: string;
        async?: boolean;
    }[];
    /** v-for 循环上下文（item 字段引用展开） */
    loop?: {
        itemKey: string;
        indexKey?: string;
    };
    /** R72：onMounted 回调体与其 async 标记（生成 LaunchedEffect + 协程） */
    onMountedBody?: string;
    onMountedAsync?: boolean;
}
/** 纯字符串拼接生成节点（避免嵌套模板转译问题）；v-if（node.condition）在此统一包裹 */
declare function emitNode(node: IrNode, ctx: ComposeCtx, depth: number, loop?: {
    itemKey: string;
    indexKey?: string;
}, useParamModifier?: boolean, parentStretch?: boolean): string;
/** R40 组件表：页面同目录 + 向上逐级查找 components/*.vue（对位 gen-ios loadComponents，支持样例根共享组件）
 *  优先级：页面本地 components/ 覆盖祖先目录同名组件（先收集祖先、最后收集本地） */
declare function loadComponents(pageFile: string): Record<string, string>;
/** 组件 → 独立 Composable 文件（对位 iOS 组件独立 Swift 文件） */
declare function emitComponentFile(name: string, ui: IrNode, bundleId: string): string;
declare function parseRouter(src: string, dir: string): {
    tabs: {
        id: string;
        title: string;
        file: string;
        icon: string;
        path: string;
    }[];
    details: {
        id: string;
        title: string;
        file: string;
        path: string;
    }[];
};
export interface RunTabsOptions {
    /** 产物根（默认 <repo>/compiler/generated/android 或 VRN_OUT_DIR） */
    outDirRoot?: string;
    /** 工程名（默认入口目录名 PascalCase） */
    projectName?: string;
    /** bundle id（默认 com.vrn.<projectname 小写>） */
    bundleId?: string;
    /** P2：工程骨架模板由 @dongmingzhixiu/vuexir-templates 提供、CLI 注入（避免 compiler → templates 的依赖倒挂）
     *  回调式：runTabs 计算完 projectName/bundleId 后再渲染模板，避免调用方拿不到最终值 */
    renderGradle?: (projectName: string, bundleId: string) => string;
    templateVersion?: string;
}
declare function runTabs(appDir: string, opts?: RunTabsOptions): string;
declare function buildNavHost(bundleId: string, tabs: {
    id: string;
    title: string;
    icon: string;
    path: string;
}[], details: {
    id: string;
    title: string;
    path: string;
    bg?: string;
    backText?: string;
    mode?: string;
}[]): string;
/**
 * 输入解析（R-PKG）：CLI 通过 VRN_SAMPLES_ROOT 注入样例根（默认 <repo>/examples）。
 * 依次尝试：样例名 → 目录 → 直接路径；都不存在时原样返回由调用方报错。
 */
declare function resolveInput(arg: string | undefined): string;
export { runTabs, emitNode, emitComponentFile, loadComponents, parseRouter, buildNavHost, resolveInput, RUNTIME_KT, THEME_KT, NAV_TEST_KT, MAIN_ACTIVITY, MANIFEST, STYLES_XML, };
