/**
 * IR Schema v0 —— 最小节点集（P0.2）
 *
 * 遵循 RULES.md 约束：
 * - R16：布局语义以 fill/flex/gap 为主，禁止宽度写死绝对像素（固定物除外）
 * - R17：节点子集封闭（P0 共 8 个），新节点必须两端 1:1 可映射
 * - R26：视觉 token 保持既有品牌色
 *
 * 预留（本阶段不实现，仅类型占位）：bind / repeat / condition / events.action
 */
export declare const NODE_TYPES: readonly ["root", "group", "for", "text", "image", "button", "input", "scroll", "spacer", "divider", "component"];
export type NodeType = (typeof NODE_TYPES)[number];
/** 尺寸：fill=填满父容器主轴，auto=由内容决定，number=固定像素（仅限固定物） */
export type Size = number | 'fill' | 'auto';
export type FlexDirection = 'row' | 'column';
export type Justify = 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
export type Align = 'start' | 'center' | 'end' | 'stretch';
export type FontWeight = 'normal' | 'medium' | 'bold';
export type TextAlign = 'left' | 'center' | 'right';
export type ObjectFit = 'cover' | 'contain';
export interface IrProps {
    /** 尺寸 */
    width?: Size;
    height?: Size;
    /** 内边距：数字=四边相等；对象=指定边 */
    padding?: number | {
        top?: number;
        right?: number;
        bottom?: number;
        left?: number;
    };
    /** 子元素间距 */
    gap?: number;
    /** 弹性占比（同 flex-grow，用于 row/column 内分配剩余空间） */
    flex?: number;
    /** CSS margin-top:auto → 推到底部（自身尺寸不变，由前置 Spacer 实现；与 flex 占满语义区分） */
    marginTopAuto?: boolean;
    /** CSS margin-top:<px> → 前置固定高度空隙（margin 语义，不影响子项自身尺寸） */
    marginTop?: number;
    /** CSS margin-left:auto → 推到行尾（row 容器内由前置 Spacer 实现；用于「>」等行尾元素） */
    marginLeftAuto?: boolean;
    /** R70 其余单边外边距（后置 Spacer/间隔实现，对位 Web margin 语义） */
    marginBottom?: number;
    marginRight?: number;
    marginLeft?: number;
    /** 点击直接写状态（@click="setter(0)" 内联为 var=value；替代 onClick 走 JS 的链路）。
     *  kind: 'literal' 字面量（字符串加引号/数字原样）；'expr' 为 Swift 兼容表达式（原样嵌入，如 count + 1，M1） */
    onSet?: {
        var: string;
        value: number | string;
        kind?: 'literal' | 'expr';
    };
    /** text 动态色（:class 选中态 → 由祖先 active 注入：when 成立用 activeColor，否则用原 color） */
    colorActive?: {
        when: string;
        color: string;
    };
    /** M2 :style 动态：color 从 state（hex 字符串）运行时解析（Color(hex: <state>)） */
    colorDynamic?: string;
    /** M2 :style 动态：fontSize 从 state（number）运行时读取（.font(.system(size: <state>))） */
    fontSizeDynamic?: string;
    /** M2 模板内三元表达式（{{ cond ? 'a' : 'b' }} → Swift 三元字符串表达式，Text(expr)） */
    bindExpr?: string;
    /** M4b 动态列表项属性：{{ item.field }} → Swift [String: Any] 字段取值 */
    dynField?: {
        var: string;
        field: string;
    };
    /** M4b 混合文本：静态段 + 插值/动态字段段 → Text("\(bind)静态\(dyn)") */
    bindParts?: ({
        text: string;
    } | {
        bind: string;
    } | {
        dynField: {
            var: string;
            field: string;
        };
    })[];
    /** group 专属 */
    flexDirection?: FlexDirection;
    justifyContent?: Justify;
    alignItems?: Align;
    /** 视觉 */
    background?: string;
    radius?: number;
    borderWidth?: number;
    borderColor?: string;
    /** R70 单边发丝边框：border-{top,right,bottom,left} / border-{side}-{width,color} → 每边独立描边
     *  （Web 里分隔线常用 0.5px 单边，全边 borderWidth 表达不了） */
    borderSides?: {
        top?: {
            width: number;
            color?: string;
        };
        right?: {
            width: number;
            color?: string;
        };
        bottom?: {
            width: number;
            color?: string;
        };
        left?: {
            width: number;
            color?: string;
        };
    };
    /** R71 overflow:hidden → 裁剪超出容器的内容（对位 Web overflow 语义） */
    clip?: boolean;
    /** text 专属 */
    text?: string;
    fontSize?: number;
    fontWeight?: FontWeight;
    textAlign?: TextAlign;
    lineHeight?: number;
    color?: string;
    /** image 专属 */
    src?: string;
    objectFit?: ObjectFit;
    /** button 专属 */
    label?: string;
    /** button 点击事件（@click 绑定的处理函数名，运行时由 JS 引擎执行） */
    onClick?: string;
    /** M5 定位：position:absolute → 脱离文档流（父容器 ZStack + offset） */
    position?: 'absolute';
    absTop?: number;
    absLeft?: number;
    absRight?: number;
    absBottom?: number;
    /** M5 变换：scale / rotate(deg) / translate(x,y) → scaleEffect / rotationEffect / offset */
    transform?: {
        scale?: number;
        rotate?: number;
        translateX?: number;
        translateY?: number;
    };
    /** M5 动画：v-show 绑定状态名 → 原生 withAnimation 过渡 */
    show?: string;
    /** CSS opacity（0~1 静态透明度；与 v-show 条件透明叠加） */
    opacity?: number;
    pressBg?: string | number;
    /** scroll 专属 */
    showsIndicators?: boolean;
    /** component 专属：组件名（PascalCase，对应 <Name>View.swift 中的 struct NameView） */
    name?: string;
    /** component 专属：传入 props（字面量：字符串/数字/布尔 → Swift 初始化参数；
     *  R-VFOBJ：循环字段表达式 { expr: "item.name" } → item["name"] ?? ""） */
    attrs?: Record<string, string | number | boolean | {
        expr: string;
    }>;
    /** text 专属：文本值来自组件 prop（组件 View 内 Text(ref)，替代 props.text） */
    ref?: string;
    /** text 专属（M1）：页面级 {{ state }} → @State 引用（替代 props.text；需 screen.state 已声明） */
    bind?: string;
    /** input 专属（M1）：v-model 绑定的 string 状态名（原生 @State 直接绑定 $x） */
    value?: string;
    /** input 专属：占位符 */
    placeholder?: string;
    /** M6 van-cell：标题 / 说明 / 右侧值 / 是否展示箭头 */
    title?: string;
    isLink?: boolean;
    /** M6 van-button：type（primary/default）/ plain / disabled */
    type?: string;
    plain?: boolean;
    disabled?: boolean;
    /** M6 van-tabbar：items（label/icon）+ active 下标 */
    items?: {
        label: string;
        icon: string;
    }[];
    active?: number;
    /** M6 van-toast：提示文本 */
    message?: string;
    /** M6 van-field/van-switch：v-model 绑定的状态名 */
    model?: string;
}
/** 事件动作（P0 仅占位，运行时阶段实现） */
export interface IrAction {
    kind: 'update' | 'navigate' | 'api' | 'js';
    /** update: 要更新的数据路径，如 "$data.sel" */
    path?: string;
    /** update: 值（可为字符串模板表达式） */
    value?: unknown;
    /** js: 调用 logics 中函数名 */
    fn?: string;
    args?: unknown[];
}
export interface IrEvent {
    on: string;
    action: IrAction;
}
/** 数据绑定占位（P0 校验存在性，不执行） */
export interface IrBind {
    key: string;
}
/** v-for 占位 */
export interface IrRepeat {
    from: string;
    as: string;
}
/** M2 v-for：静态数组字面量 → ForEach(0..<n)；item/index 注入项模板
 *  R-VFOBJ：元素可为对象字面量 {k:v,…}（组件列表渲染，Swift 侧转 [String: String] 字典） */
export interface IrVFor {
    /** 数组字面量元素（number | string | 对象 {k:v}）——M2 静态列表 */
    list?: (number | string | Record<string, string | number>)[];
    /** M4b 动态列表：state 名（stateStore 数组，Swift 侧 JSON 字符串解码） */
    listState?: string;
    /** 项变量名（v-for="item in …" 的 item） */
    itemKey: string;
    /** 下标变量名（(item, i) in … 的 i，可缺省） */
    indexKey?: string;
    /** R-VFOBJ-D：静态列表来源的 script 常量数组名（v-for="… in rows"），Swift 侧作 struct 属性名 */
    srcName?: string;
}
export interface IrNode {
    type: NodeType;
    /** 节点标识（对拍/调试用，可缺省） */
    key?: string;
    props?: IrProps;
    bind?: IrBind;
    events?: IrEvent[];
    repeat?: IrRepeat;
    /** M2 v-for：静态数组字面量 + 项模板 children[0]（列表渲染 → ForEach） */
    vfor?: IrVFor;
    /** v-if 条件表达式（Swift 兼容语法，如 `tabIndex == 0`）；成立才渲染该节点子树 */
    condition?: string;
    /** 源标签（R-G2 gap 透传判定）：'template' = 逻辑容器（CSS 透明，父 gap 可透传）；其余真实元素不透传 */
    sourceTag?: string;
    /** :class 动态绑定（如 `:class="{ 'label-active': tabIndex == 0 }"`）→ 命中条件时应用样式 */
    active?: {
        when: string;
        props: Record<string, unknown>;
    };
    children?: IrNode[];
}
export interface IrScreen {
    /** 屏唯一 id */
    id: string;
    title: string;
    /** 逻辑形态：native=纯动作；hybrid=动作+JS；js=JS 主导（P0 均为 native） */
    runtime: 'native' | 'hybrid' | 'js';
    /** 设计稿基准（默认 360x640，R16 适配矩阵据此推算） */
    width?: number;
    height?: number;
    /** 预留：静态数据表 */
    data?: Record<string, unknown>;
    /** 屏级状态（ref 提取）：name=变量名，init=初始值；生成 Swift @State */
    state?: {
        name: string;
        init: number | string | boolean;
    }[];
    /** M3 <script setup> 提取的 handler 函数（@click="fn()" 引用；body 已做 .value → stateStore 重写）
     *  R72：async:true 表示 `async function`（JS 侧保留 async 关键字；Android 侧按协程形状生成） */
    handlers?: {
        name: string;
        params: string;
        body: string;
        async?: boolean;
    }[];
    /** M3 onMounted 回调体（Swift onAppear → invoke("__onMounted")）
     *  R72：body 内直接使用 await（如 `await fetch(...)`）时视为 async（生成 async function __onMounted） */
    onMounted?: string;
    /** 页面级 onMounted 是否为 async（R72） */
    onMountedAsync?: boolean;
    /** M7 导航栏与沉浸式配置（页面级参数标准，见 RULES R66）：
     *  mode: fixed（固定）/ transparent（沉浸透明）/ scroll（大标题滚动折叠）；默认 fixed
     *  title: 导航标题（默认 screen.title）；bg: 导航栏背景色（hex）
     *  backText: 返回文案（默认 Back）；immersive: 背景顶到状态栏（edge-to-edge）
     */
    navBar?: {
        mode?: 'fixed' | 'transparent' | 'scroll';
        title?: string;
        bg?: string;
        backText?: string;
        immersive?: boolean;
    };
    /** 根节点（root） */
    ui: IrNode;
}
export interface IrValidationIssue {
    /** 节点路径，如 "ui.children[1].props.width" */
    path: string;
    message: string;
}
export declare function validateIr(screen: IrScreen): {
    ok: boolean;
    issues: IrValidationIssue[];
};
/** 便捷：解析并校验 JSON 字符串 */
export declare function parseAndValidateIr(json: string): {
    ok: boolean;
    issues: IrValidationIssue[];
    screen?: IrScreen;
};
