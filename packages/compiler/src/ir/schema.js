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
];
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*[\d.]+)?\s*\)$/;
function isColor(v) {
    return typeof v === 'string' && (HEX_COLOR.test(v) || RGB_COLOR.test(v));
}
function isSize(v) {
    return v === 'fill' || v === 'auto' || (typeof v === 'number' && v >= 0 && Number.isFinite(v));
}
const PROPS_VALIDATORS = {
    width: isSize,
    height: isSize,
    padding: (v) => typeof v === 'number' && v >= 0 || (typeof v === 'object' && v !== null),
    gap: (v) => typeof v === 'number' && v >= 0,
    flex: (v) => typeof v === 'number' && v >= 0,
    marginTopAuto: (v) => typeof v === 'boolean',
    marginTop: (v) => typeof v === 'number' && v >= 0,
    marginLeftAuto: (v) => typeof v === 'boolean',
    onSet: (v) => typeof v === 'object' &&
        v !== null &&
        typeof v.var === 'string' &&
        (typeof v.value === 'number' || typeof v.value === 'string') &&
        (v.kind === undefined || v.kind === 'literal' || v.kind === 'expr'),
    colorActive: (v) => typeof v === 'object' &&
        v !== null &&
        typeof v.when === 'string' &&
        isColor(v.color),
    flexDirection: (v) => v === 'row' || v === 'column',
    justifyContent: (v) => ['start', 'center', 'end', 'spaceBetween', 'spaceAround'].includes(v),
    alignItems: (v) => ['start', 'center', 'end', 'stretch'].includes(v),
    background: isColor,
    radius: (v) => typeof v === 'number' && v >= 0,
    borderWidth: (v) => typeof v === 'number' && v >= 0,
    borderColor: isColor,
    // R70 单边边框：每边 { width≥0, color? 合法颜色 }
    borderSides: (v) => typeof v === 'object' &&
        v !== null &&
        ['top', 'right', 'bottom', 'left'].every((side) => {
            const sv = v[side];
            if (sv === undefined)
                return true;
            return (typeof sv === 'object' &&
                sv !== null &&
                typeof sv.width === 'number' &&
                sv.width >= 0 &&
                (sv.color === undefined || isColor(sv.color)));
        }),
    clip: (v) => typeof v === 'boolean',
    marginBottom: (v) => typeof v === 'number' && v >= 0,
    marginRight: (v) => typeof v === 'number' && v >= 0,
    marginLeft: (v) => typeof v === 'number' && v >= 0,
    text: (v) => typeof v === 'string',
    fontSize: (v) => typeof v === 'number' && v > 0,
    fontWeight: (v) => ['normal', 'medium', 'bold'].includes(v),
    textAlign: (v) => ['left', 'center', 'right'].includes(v),
    lineHeight: (v) => typeof v === 'number' && v > 0,
    color: isColor,
    src: (v) => typeof v === 'string',
    objectFit: (v) => v === 'cover' || v === 'contain',
    label: (v) => typeof v === 'string',
    onClick: (v) => typeof v === 'string',
    showsIndicators: (v) => typeof v === 'boolean',
    name: (v) => typeof v === 'string',
    attrs: (v) => typeof v === 'object' &&
        v !== null &&
        Object.values(v).every((x) => typeof x === 'string' ||
            typeof x === 'number' ||
            typeof x === 'boolean' ||
            (typeof x === 'object' && x !== null && typeof x.expr === 'string')),
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
    transform: (v) => typeof v === 'object' &&
        v !== null &&
        ['scale', 'rotate', 'translateX', 'translateY'].every((k) => v[k] === undefined || typeof v[k] === 'number'),
    show: (v) => typeof v === 'string',
    opacity: (v) => typeof v === 'number' && v >= 0 && v <= 1,
    placeholder: (v) => typeof v === 'string',
};
/** 各节点允许的 props 键（P0 最小集，防 Taro 化：未知 prop 即报错） */
const NODE_ALLOWED_PROPS = {
    root: ['width', 'height', 'background'],
    group: ['width', 'height', 'padding', 'gap', 'flex', 'flexDirection', 'justifyContent', 'alignItems', 'background', 'radius', 'borderWidth', 'borderColor', 'marginTopAuto', 'marginTop', 'marginLeftAuto', 'marginBottom', 'marginRight', 'marginLeft', 'borderSides', 'clip', 'onClick', 'onSet', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show', 'opacity'],
    text: ['width', 'text', 'ref', 'bind', 'bindExpr', 'dynField', 'bindParts', 'fontSize', 'fontWeight', 'textAlign', 'lineHeight', 'color', 'padding', 'colorActive', 'marginLeftAuto', 'marginTop', 'colorDynamic', 'fontSizeDynamic', 'position', 'absTop', 'absLeft', 'absRight', 'absBottom', 'transform', 'show', 'flex', 'opacity', 'onClick', 'onSet'],
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
const CONTAINER_TYPES = ['root', 'group', 'scroll', 'for'];
/** 必须是叶子且带 children 校验为空的节点 */
const LEAF_TYPES = ['text', 'image', 'button', 'input', 'spacer', 'divider', 'component'];
export function validateIr(screen) {
    const issues = [];
    const seenKeys = new Set();
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
        const names = new Set();
        screen.state.forEach((s, i) => {
            const p = `state[${i}]`;
            if (!s.name || typeof s.name !== 'string') {
                issues.push({ path: p, message: 'state.name 必填且为字符串' });
            }
            else if (!/^[A-Za-z_]\w*$/.test(s.name)) {
                issues.push({ path: `${p}.name`, message: `state.name 非法标识符：${s.name}` });
            }
            else if (names.has(s.name)) {
                issues.push({ path: `${p}.name`, message: `state.name 重复：${s.name}（原生端将重名声明，编译失败）` });
            }
            else {
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
        }
        else {
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
    }
    else {
        validateNode(screen.ui, 'ui', issues, seenKeys, stateNames);
    }
    return { ok: issues.length === 0, issues };
}
function validateNode(node, path, issues, seenKeys, stateNames = new Set(), inLoop = false) {
    // 类型
    if (!NODE_TYPES.includes(node.type)) {
        issues.push({ path, message: `未知节点类型：${String(node.type)}` });
        return;
    }
    // key 唯一性
    if (node.key !== undefined) {
        if (seenKeys.has(node.key))
            issues.push({ path: `${path}.key`, message: `key 重复：${node.key}` });
        else
            seenKeys.add(node.key);
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
    if (node.type === 'text' && !node.bind && (!node.props || (node.props.text === undefined && node.props.ref === undefined && node.props.bind === undefined && node.props.bindExpr === undefined && node.props.dynField === undefined && node.props.bindParts === undefined))) {
        issues.push({ path, message: 'text 节点必须有 props.text / props.ref / props.bind / props.bindExpr 或 bind' });
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
            }
            else if (!vf.list.every((v) => typeof v === 'number' || typeof v === 'string' || (typeof v === 'object' && v !== null))) {
                issues.push({ path: `${path}.vfor.list`, message: 'vfor.list 元素必须为 number / string / 对象字面量' });
            }
        }
        else if (!vf.listState || !/^[A-Za-z_]\w*$/.test(vf.listState)) {
            issues.push({ path: `${path}.vfor.listState`, message: 'vfor.listState 必填且为合法标识符（M4b 动态列表）' });
        }
        else if (stateNames.size > 0 && !stateNames.has(vf.listState)) {
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
export function parseAndValidateIr(json) {
    try {
        const screen = JSON.parse(json);
        const r = validateIr(screen);
        return { ok: r.ok, issues: r.issues, screen };
    }
    catch (e) {
        return { ok: false, issues: [{ path: '(json)', message: `JSON 解析失败：${e.message}` }] };
    }
}
