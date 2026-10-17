/**
 * SwiftUI 生成器 v0（P0.3）
 *
 * 职责：IR 节点树 → 自包含 SwiftUI 源码字符串（可直接 swiftc -parse / 进 Xcode 工程）
 *
 * 遵循 RULES.md：
 * - R14：生成器产出必须可直接过 swiftc 编译
 * - R16：fill → .frame(maxWidth/maxHeight:.infinity)；禁绝对像素（固定物除外）
 * - R26：颜色直接生成 Color(red:green:blue:opacity:) 数值表达式
 *
 * 映射表（R25 薄抽象层）：
 *   root        → ZStack + 全屏 frame + 背景
 *   group       → VStack / HStack（flexDirection）+ spacing(gap) + padding + 背景/圆角/描边
 *   text        → Text + font/foregroundColor/multilineTextAlignment/lineSpacing
 *   button      → Button(label:) + 尺寸/背景/圆角
 *   scroll      → ScrollView(.vertical) + VStack（flex:1 → maxHeight:.infinity）
 *   spacer      → Spacer(minLength: 0)
 *   divider     → Rectangle().fill().frame(height:)
 *   image       → 占位 RoundedRectangle（P0 无真实图片链路）
 *
 * P0 简化声明：justifyContent 仅 start/center/spaceBetween；breakpoints 未实现；
 * flex 仅支持容器主轴方向的 maxHeight/maxWidth:.infinity。
 */
import type { IrAction, IrNode, IrScreen } from '../ir/schema.js';
/** R42 收集 IR 树中的颜色与字体组合（生成 Theme.swift 的输入） */
export declare function collectTheme(...nodes: (IrNode | undefined)[]): {
    colors: Set<string>;
    fonts: Set<string>;
};
/** R42 构建色板：hex/fontKey → Theme 名（确定性：语义色表 + c<hex> / fs<size><w>） */
export declare function buildTheme(tokens: {
    colors: Set<string>;
    fonts: Set<string>;
}): {
    colorNames: Map<string, string>;
    fontNames: Map<string, string>;
};
/** R42 生成 Theme.swift（颜色/字体去重常量） */
export declare function generateThemeSource(palette: {
    colorNames: Map<string, string>;
    fontNames: Map<string, string>;
}): string;
/** R43/R44 View 扩展源码（Theme.swift 内；theme 模式引用） */
export declare function generateViewExtensions(): string;
export declare function generateScreenSource(screen: IrScreen, opts?: {
    warnings?: string[];
    theme?: {
        colorNames: Map<string, string>;
        fontNames: Map<string, string>;
    };
    /** M4a 多页：页面运行时引用（默认 Runtime.shared 单例；多页传 Runtime.forPage("<id>") 隔离 JS 上下文） */
    runtime?: string;
    /** M4b Tabs：状态提升到容器（页面用 @Binding、不生成 onAppear；绑定+onMounted 由容器统一驱动） */
    bindingMode?: 'external';
}): string;
/** 事件动作占位注释（P0 运行时阶段实现，这里仅生成可读注释便于对拍） */
export declare function actionComment(action: IrAction): string;
/**
 * R41 组件 → 独立 Swift 文件源码：
 *   struct StatCellView: View { let value: String; let label: String; var body: some View { … } }
 * - body = 组件 IR 树（组件样式独立作用域；组件根布局 props 已剥离，View 大小由内容决定）
 * - {{ prop }} → Text(prop)
 */
export declare function generateComponentSource(name: string, ui: IrNode, opts?: {
    warnings?: string[];
    theme?: {
        colorNames: Map<string, string>;
        fontNames: Map<string, string>;
    };
}): string;
