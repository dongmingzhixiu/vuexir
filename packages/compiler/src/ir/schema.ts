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

export const NODE_TYPES = [
  'root',
  'group',
  'for',
  'text',
  'image',
  'button',
  'input',
  'scroll',
  'spacer',
  'divider',
  'component',
] as const;

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
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
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
  onSet?: { var: string; value: number | string; kind?: 'literal' | 'expr' };
  /** text 动态色（:class 选中态 → 由祖先 active 注入：when 成立用 activeColor，否则用原 color） */
  colorActive?: { when: string; color: string };
  /** M2 :style 动态：color 从 state（hex 字符串）运行时解析（Color(hex: <state>)） */
  colorDynamic?: string;
  /** M2 :style 动态：fontSize 从 state（number）运行时读取（.font(.system(size: <state>))） */
  fontSizeDynamic?: string;
  /** M2 模板内三元表达式（{{ cond ? 'a' : 'b' }} → Swift 三元字符串表达式，Text(expr)） */
  bindExpr?: string;
  /** M4b 动态列表项属性：{{ item.field }} → Swift [String: Any] 字段取值 */
  dynField?: { var: string; field: string };
  /** R78 对象字段插值：{{ obj.field }}（obj 为 JSON 字符串状态；非状态对象编译期警告） */
  /** R92 对象字段取值；fallback 为缺失时的兜底文案（对应 `{{ a.b ?? '兜底' }}`） */
  fieldOf?: { obj: string; field: string; fallback?: string };
  /** M4b 混合文本：静态段 + 插值/动态字段段 → Text("\(bind)静态\(dyn)") */
  bindParts?: ({ text: string } | { bind: string } | { dynField: { var: string; field: string } } | { fieldOf: { obj: string; field: string; fallback?: string } })[];
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
    top?: { width: number; color?: string };
    right?: { width: number; color?: string };
    bottom?: { width: number; color?: string };
    left?: { width: number; color?: string };
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
  transform?: { scale?: number; rotate?: number; translateX?: number; translateY?: number };
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
  attrs?: Record<string, string | number | boolean | { expr: string }>;
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
  items?: { label: string; icon: string }[];
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
  active?: { when: string; props: Record<string, unknown> };
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
  /** 页面状态；obj=true 表示对象态（init 为 JSON 字符串，供 vrnField 点路径读取，R85） */
  state?: {
    name: string;
    init: number | string | boolean;
    list?: boolean;
    obj?: boolean;
    /** R96 computed 表达式（JS 运行时求值后写回该状态） */
    computed?: string;
  }[];
  /** M3 <script setup> 提取的 handler 函数（@click="fn()" 引用；body 已做 .value → stateStore 重写）
   *  R72：async:true 表示 `async function`（JS 侧保留 async 关键字；Android 侧按协程形状生成） */
  handlers?: { name: string; params: string; body: string; async?: boolean }[];
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

/* ============ 校验器 ============ */

export interface IrValidationIssue {
  /** 节点路径，如 "ui.children[1].props.width" */
  path: string;
  message: string;
}

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)$/;

function isColor(v: unknown): boolean {
  return typeof v === 'string' && (HEX_COLOR.test(v) || RGB_COLOR.test(v));
}

function isSize(v: unknown): v is Size {
  return v === 'fill' || v === 'auto' || (typeof v === 'number' && v >= 0 && Number.isFinite(v));
}

const PROPS_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  width: isSize,
  height: isSize,
  padding: (v) => typeof v === 'number' && v >= 0 || (typeof v === 'object' && v !== null),
  gap: (v) => typeof v === 'number' && v >= 0,
  flex: (v) => typeof v === 'number' && v >= 0,
  marginTopAuto: (v) => typeof v === 'boolean',
  marginTop: (v) => typeof v === 'number' && v >= 0,
  marginLeftAuto: (v) => typeof v === 'boolean',
  onSet: (v) =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { var: string }).var === 'string' &&
    (typeof (v as { value: unknown }).value === 'number' || typeof (v as { value: unknown }).value === 'string') &&
    ((v as { kind?: string }).kind === undefined || (v as { kind?: string }).kind === 'literal' || (v as { kind?: string }).kind === 'expr'),
  colorActive: (v) =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { when: string }).when === 'string' &&
    isColor((v as { color: string }).color),
  flexDirection: (v) => v === 'row' || v === 'column',
  justifyContent: (v) => ['start', 'center', 'end', 'spaceBetween', 'spaceAround'].includes(v as string),
  alignItems: (v) => ['start', 'center', 'end', 'stretch'].includes(v as string),
  background: isColor,
  radius: (v) => typeof v === 'number' && v >= 0,
  borderWidth: (v) => typeof v === 'number' && v >= 0,
  borderColor: isColor,
  // R70 单边边框：每边 { width≥0, color? 合法颜色 }
  borderSides: (v) =>
    typeof v === 'object' &&
    v !== null &&
    ['top', 'right', 'bottom', 'left'].every((side) => {
      const sv = (v as Record<string, { width?: unknown; color?: unknown }>)[side];
      if (sv === undefined) return true;
      return (
        typeof sv === 'object' &&
        sv !== null &&
        typeof sv.width === 'number' &&
        sv.width >= 0 &&
        (sv.color === undefined || isColor(sv.color))
      );
    }),
  clip: (v) => typeof v === 'boolean',
  marginBottom: (v) => typeof v === 'number' && v >= 0,
  marginRight: (v) => typeof v === 'number' && v >= 0,
  marginLeft: (v) => typeof v === 'number' && v >= 0,
  text: (v) => typeof v === 'string',
  fontSize: (v) => typeof v === 'number' && v > 0,
  fontWeight: (v) => ['normal', 'medium', 'bold'].includes(v as string),
  textAlign: (v) => ['left', 'center', 'right'].includes(v as string),
  lineHeight: (v) => typeof v === 'number' && v > 0,
  color: isColor,
  src: (v) => typeof v === 'string',
  objectFit: (v) => v === 'cover' || v === 'contain',
  label: (v) => typeof v === 'string',
  onClick: (v) => typeof v === 'string',
  showsIndicators: (v) => typeof v === 'boolean',
  name: (v) => typeof v === 'string',
  attrs: (v) =>
    typeof v === 'object' &&
    v !== null &&
    Object.values(v as Record<string, unknown>).every(
      (x) =>
        typeof x === 'string' ||
        typeof x === 'number' ||
        typeof x === 'boolean' ||
        (typeof x === 'object' && x !== null && typeof (x as { expr?: unknown }).expr === 'string'),
    ),
  ref: (v) => typeof v === 'string',
  position: (v) => v === 'absolute',
  absTop: (v) => typeof v === 'number' && v >= 0,
  pressBg: (v) => typeof v === 'string' || typeof v === 'number',
  van: (v) => typeof v === 'string',
  isLink: (v) => typeof v === 'boolean',
  plain: (v) => typeof v === 'boolean',
  disabled: (v) => typeof v === 'boolean',
  items: (v) => Array.isArray(v),
  active: (v) => typeof v === 'number',
  message: (v) => typeof v === 'string',
  model: (v) => typeof v === 'string',
  absLeft: (v) => typeof v === 'number' && v >= 0,
  absRight: (v) => typeof v === 'number' && v >= 0,
  absBottom: (v) => typeof v === 'number' && v >= 0,
  transform: (v) =>
    typeof v === 'object' &&
    v !== null &&
    ['scale', 'rotate', 'translateX', 'translateY'].every(
      (k) => (v as Record<string, unknown>)[k] === undefined || typeof (v as Record<string, unknown>)[k] === 'number',
    ),
  show: (v) => typeof v === 'string',
  fieldOf: (v) =>
    typeof v === 'object' && v !== null && typeof (v as { obj: string }).obj === 'string' && typeof (v as { field: string }).field === 'string',
  opacity: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  placeholder: (v) => typeof v === 'string',
};

/** 各节点允许的 props 键（P0 最小集，防 Taro 化：未知 prop 即报错） */
const NODE_ALLOWED_PROPS: Record<NodeType, string[]> = {
  root: ['width', 'height', 'background'],
  group: ['width', 'height', 'padding', 'gap', 'flex', 'flexDirection', 'justifyContent', 'alignItems', 'background', 'radius', 'borderWidth', 'borderColor', 'marginTopAuto', 'marginTop', 'marginLeftAuto', 'marginBottom', 'marginRight', 'marginLeft', 'borderSides', 'clip', 'onClick', 'onSet', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show', 'opacity'],
  text: ['width', 'text', 'ref', 'bind', 'bindExpr', 'dynField', 'bindParts', 'fontSize', 'fontWeight', 'textAlign', 'lineHeight', 'color', 'padding', 'colorActive', 'marginLeftAuto', 'marginTop', 'colorDynamic', 'fontSizeDynamic', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show', 'flex', 'opacity', 'onClick', 'onSet', 'fieldOf'],
  image: ['width', 'height', 'src', 'objectFit', 'radius', 'borderSides', 'borderWidth', 'borderColor', 'clip', 'flex', 'marginTop', 'marginBottom', 'marginRight', 'marginLeft', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show', 'opacity'],
  button: ['width', 'height', 'label', 'background', 'radius', 'borderWidth', 'borderColor', 'fontSize', 'fontWeight', 'color', 'flex', 'padding', 'marginTopAuto', 'marginTop', 'marginBottom', 'marginRight', 'marginLeft', 'borderSides', 'clip', 'onClick', 'onSet', 'colorDynamic', 'fontSizeDynamic', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show', 'pressBg', 'opacity'],
  input: ['width', 'height', 'value', 'placeholder', 'fontSize', 'color', 'background', 'padding', 'radius', 'borderWidth', 'borderColor', 'borderSides', 'clip', 'flex', 'marginTop', 'marginTopAuto', 'marginBottom', 'marginRight', 'marginLeft', 'onSet', 'colorDynamic', 'fontSizeDynamic', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show'],
  scroll: ['width', 'height', 'padding', 'gap', 'flexDirection', 'background', 'showsIndicators', 'flex'],
  spacer: ['width', 'height', 'flex'],
  divider: ['width', 'height', 'background', 'borderWidth', 'borderColor', 'marginTop'],
  component: ['name', 'attrs', 'flex', 'width', 'height', 'marginTop', 'marginTopAuto', 'marginLeftAuto', 'onClick'],
  for: ['flexDirection', 'gap', 'padding', 'background', 'flex', 'width', 'height', 'showsIndicators', 'borderSides', 'clip', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show'],
};

/** 必须有 children 的节点 */
const CONTAINER_TYPES: NodeType[] = ['root', 'group', 'scroll', 'for'];
/** 必须是叶子且带 children 校验为空的节点 */
const LEAF_TYPES: NodeType[] = ['text', 'image', 'button', 'input', 'spacer', 'divider', 'component'];

export function validateIr(screen: IrScreen): { ok: boolean; issues: IrValidationIssue[] } {
  const issues: IrValidationIssue[] = [];
  const seenKeys = new Set<string>();

  // 屏级检查
  if (!screen.id || typeof screen.id !== 'string') {
    issues.push({ path: 'id', message: 'id 必填且为字符串' });
  }
  if (screen.runtime !== 'native' && screen.runtime !== 'hybrid' && screen.runtime !== 'js') {
    issues.push({ path: 'runtime', message: `runtime 非法：${String(screen.runtime)}` });
  }
  if (screen.width !== undefined && (typeof screen.width !== 'number' || screen.width <= 0)) {
    issues.push({ path: 'width', message: 'width 必须为正数' });
  }
  if (screen.height !== undefined && (typeof screen.height !== 'number' || screen.height <= 0)) {
    issues.push({ path: 'height', message: 'height 必须为正数' });
  }
  if (!screen.title || typeof screen.title !== 'string') {
    issues.push({ path: 'title', message: 'title 必填且为字符串' });
  }
  // M7 navBar（R66）：mode 枚举 / bg 颜色 / backText 与 immersive 类型
  if (screen.navBar !== undefined) {
    const nav = screen.navBar;
    const p = 'navBar';
    if (nav.mode !== undefined && !['fixed', 'transparent', 'scroll'].includes(nav.mode)) {
      issues.push({ path: `${p}.mode`, message: `mode 非法（fixed/transparent/scroll）：${String(nav.mode)}` });
    }
    if (nav.bg !== undefined && !/^#[0-9a-fA-F]{6}$/.test(nav.bg)) {
      issues.push({ path: `${p}.bg`, message: `bg 须为 #rrggbb：${String(nav.bg)}` });
    }
    if (nav.backText !== undefined && typeof nav.backText !== 'string') {
      issues.push({ path: `${p}.backText`, message: 'backText 必须为字符串' });
    }
    if (nav.immersive !== undefined && typeof nav.immersive !== 'boolean') {
      issues.push({ path: `${p}.immersive`, message: 'immersive 必须为布尔' });
    }
  }
  if (screen.state) {
    const names = new Set<string>();
    screen.state.forEach((s, i) => {
      const p = `state[${i}]`;
      if (!s.name || typeof s.name !== 'string') {
        issues.push({ path: p, message: 'state.name 必填且为字符串' });
      } else if (!/^[A-Za-z_]\w*$/.test(s.name)) {
        issues.push({ path: `${p}.name`, message: `state.name 非法标识符：${s.name}` });
      } else if (names.has(s.name)) {
        issues.push({ path: `${p}.name`, message: `state.name 重复：${s.name}（原生端将重名声明，编译失败）` });
      } else {
        names.add(s.name);
      }
      if (typeof s.init !== 'number' && typeof s.init !== 'string' && typeof s.init !== 'boolean') {
        issues.push({ path: `${p}.init`, message: 'state.init 必须为 number/string/boolean' });
      }
    });
  }
  // M3 运行时桥：handlers 结构 / onMounted 类型
  if (screen.handlers !== undefined) {
    if (!Array.isArray(screen.handlers)) {
      issues.push({ path: 'handlers', message: 'handlers 必须为数组' });
    } else {
      screen.handlers.forEach((h, i) => {
        const p = `handlers[${i}]`;
        if (typeof h.name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(h.name)) {
          issues.push({ path: `${p}.name`, message: `handler.name 必须为合法标识符：${JSON.stringify(h.name)}` });
        }
        if (h.params !== undefined && typeof h.params !== 'string') {
          issues.push({ path: `${p}.params`, message: 'handler.params 必须为字符串' });
        }
        if (h.async !== undefined && typeof h.async !== 'boolean') {
          issues.push({ path: `${p}.async`, message: 'handler.async 必须为布尔（R72）' });
        }
        if (typeof h.body !== 'string') {
          issues.push({ path: `${p}.body`, message: 'handler.body 必须为字符串' });
        }
      });
    }
  }
  if (screen.onMounted !== undefined && typeof screen.onMounted !== 'string') {
    issues.push({ path: 'onMounted', message: 'onMounted 必须为字符串（JS 源）' });
  }
  if (screen.onMountedAsync !== undefined && typeof screen.onMountedAsync !== 'boolean') {
    issues.push({ path: 'onMountedAsync', message: 'onMountedAsync 必须为布尔（R72）' });
  }
  const stateNames = new Set((screen.state ?? []).map((s) => s.name));
  if (!screen.ui || screen.ui.type !== 'root') {
    issues.push({ path: 'ui', message: 'ui 根节点必须为 root' });
  } else {
    validateNode(screen.ui, 'ui', issues, seenKeys, stateNames);
  }

  return { ok: issues.length === 0, issues };
}

function validateNode(node: IrNode, path: string, issues: IrValidationIssue[], seenKeys: Set<string>, stateNames: Set<string> = new Set(), inLoop = false): void {
  // 类型
  if (!NODE_TYPES.includes(node.type)) {
    issues.push({ path, message: `未知节点类型：${String(node.type)}` });
    return;
  }

  // key 唯一性
  if (node.key !== undefined) {
    if (seenKeys.has(node.key)) issues.push({ path: `${path}.key`, message: `key 重复：${node.key}` });
    else seenKeys.add(node.key);
  }

  // props 校验
  const allowed = NODE_ALLOWED_PROPS[node.type];
  if (node.props) {
    for (const [k, v] of Object.entries(node.props)) {
      const p = `${path}.props.${k}`;
      if (!allowed.includes(k)) {
        issues.push({ path: p, message: `prop "${k}" 不在 ${node.type} 允许集内（防 Taro 化：未知 prop 即拒绝）` });
        continue;
      }
      const validator = PROPS_VALIDATORS[k];
      if (validator && !validator(v)) {
        issues.push({ path: p, message: `prop "${k}" 值非法：${JSON.stringify(v)}` });
      }
      // state 交叉校验：bind/value/show 必须指向页面已声明状态（M1 契约，防原生端引用未声明变量）。
      // bind 例外：for 循环项内可绑定循环变量（item/i），进入 for 子树后跳过
      if (stateNames.size > 0 && (k === 'value' || k === 'show' || (k === 'bind' && !inLoop)) && typeof v === 'string') {
        if (!stateNames.has(v)) {
          issues.push({ path: p, message: `「${k}: ${v}」未在 screen.state 中声明（原生端将引用未定义变量）` });
        }
      }
    }
    // 尺寸约束（R16）：group/text/button 未声明 flex 时若 width 为 number 且 > 设计稿 360 的一半，提示
    if (node.type !== 'image' && node.type !== 'spacer' && node.props.width !== undefined
        && typeof node.props.width === 'number' && node.props.width > 200) {
      issues.push({ path: `${path}.props.width`, message: `width=${node.props.width} 为绝对像素且超过 200，违反 R16 相对布局优先（应使用 fill 或按比例 flex）` });
    }
  }

  // 容器/叶子约束
  if (CONTAINER_TYPES.includes(node.type) && (!node.children || node.children.length === 0)) {
    issues.push({ path, message: `${node.type} 必须至少一个 children` });
  }
  if (LEAF_TYPES.includes(node.type) && node.children !== undefined && node.children.length > 0) {
    issues.push({ path, message: `${node.type} 为叶子节点，不允许 children` });
  }

  // 文本内容：text 节点需 props.text / props.ref（组件 prop 引用）/ props.bind（页面 state，M1）或 bind
  if (node.type === 'text' && !node.bind && (!node.props || (node.props.text === undefined && node.props.ref === undefined && node.props.bind === undefined && node.props.bindExpr === undefined && node.props.dynField === undefined && node.props.bindParts === undefined && node.props.fieldOf === undefined))) {
    issues.push({ path, message: 'text 节点必须有 props.text / props.ref / props.bind / props.bindExpr / props.fieldOf 或 bind' });
  }
  if (node.type === 'button' && !node.bind && (!node.props || node.props.label === undefined)) {
    issues.push({ path, message: 'button 节点必须有 props.label 或 bind' });
  }

  // condition / active
  if (node.condition !== undefined && typeof node.condition !== 'string') {
    issues.push({ path: `${path}.condition`, message: 'condition 必须为字符串表达式' });
  }
  // M2 v-for：静态数组字面量 + 项模板；M4b 动态列表（listState）
  if (node.vfor !== undefined) {
    const vf = node.vfor;
    if (vf.list !== undefined) {
      if (!Array.isArray(vf.list) || vf.list.length === 0) {
        issues.push({ path: `${path}.vfor.list`, message: 'vfor.list 必填且为非空数组（M2 仅支持静态数组字面量）' });
      } else if (!vf.list.every((v) => typeof v === 'number' || typeof v === 'string' || (typeof v === 'object' && v !== null))) {
        issues.push({ path: `${path}.vfor.list`, message: 'vfor.list 元素必须为 number / string / 对象字面量' });
      }
    } else if (!vf.listState || !/^[A-Za-z_]\w*$/.test(vf.listState)) {
      issues.push({ path: `${path}.vfor.listState`, message: 'vfor.listState 必填且为合法标识符（M4b 动态列表）' });
    } else if (stateNames.size > 0 && !stateNames.has(vf.listState)) {
      issues.push({ path: `${path}.vfor.listState`, message: `listState「${vf.listState}」未在 screen.state 中声明（原生端将引用未定义变量）` });
    }
    if (!vf.itemKey || !/^[A-Za-z_]\w*$/.test(vf.itemKey)) {
      issues.push({ path: `${path}.vfor.itemKey`, message: 'vfor.itemKey 必填且为合法标识符' });
    }
    if (vf.indexKey !== undefined && !/^[A-Za-z_]\w*$/.test(vf.indexKey)) {
      issues.push({ path: `${path}.vfor.indexKey`, message: 'vfor.indexKey 必须为合法标识符' });
    }
  }
  if (node.sourceTag !== undefined && typeof node.sourceTag !== 'string') {
    issues.push({ path: `${path}.sourceTag`, message: 'sourceTag 必须为字符串（如 "template"）' });
  }
  if (node.active !== undefined) {
    if (!node.active.when || typeof node.active.when !== 'string') {
      issues.push({ path: `${path}.active.when`, message: 'active.when 必填且为字符串' });
    }
    if (node.active.props && typeof node.active.props !== 'object') {
      issues.push({ path: `${path}.active.props`, message: 'active.props 必须为对象' });
    }
  }

  // 事件
  if (node.events) {
    node.events.forEach((ev, i) => {
      if (!ev.on || !ev.action || !ev.action.kind) {
        issues.push({ path: `${path}.events[${i}]`, message: '事件必须含 on 与 action.kind' });
      }
    });
  }

  // 递归
  if (node.children) {
    node.children.forEach((c, i) => validateNode(c, `${path}.children[${i}]`, issues, seenKeys, stateNames, inLoop || node.type === 'for'));
  }
}

/** 便捷：解析并校验 JSON 字符串 */
export function parseAndValidateIr(json: string): { ok: boolean; issues: IrValidationIssue[]; screen?: IrScreen } {
  try {
    const screen = JSON.parse(json) as IrScreen;
    const r = validateIr(screen);
    return { ok: r.ok, issues: r.issues, screen };
  } catch (e) {
    return { ok: false, issues: [{ path: '(json)', message: `JSON 解析失败：${(e as Error).message}` }] };
  }
}
