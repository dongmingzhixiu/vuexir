export interface CssParseResult {
    /** className（去点）→ IR props */
    classProps: Map<string, Record<string, unknown>>;
    /** 组合选择器规则（如 .a.b）：元素同时具备全部类时生效，优先级最高 */
    comboRules: {
        classes: string[];
        props: Record<string, unknown>;
    }[];
    /** M5 后代/子选择器（.a .b / .a > .b）：目标类 + 祖先类链 */
    scopedRules: {
        target: string;
        ancestors: string[];
        direct: boolean;
        props: Record<string, unknown>;
    }[];
    /** M5 伪类（.btn:active / :hover）：按压态样式（仅 background 生效） */
    pseudoRules: {
        cls: string;
        pseudo: 'active' | 'hover';
        props: Record<string, unknown>;
    }[];
    warnings: string[];
}
/** CSS <style> 块语法错误（postcss parse 抛出）→ 显式类型，vue2ir 转为 VueCompileError（R15：不静默吞掉） */
export declare class CssParseError extends Error {
}
/**
 * R70 结构化 prop 合并：padding / borderSides 需要按边深合并——
 * 单边声明（padding-top / border-bottom-width / border-bottom-color）是独立 decl，
 * 直接覆盖会让同一 class 内的多条声明互相清空。
 */
export declare function mergeIrProps<T extends object>(target: T, src: object): T;
/** 解析 `<style>` 内容 → 类规则表 */
export declare function parseCss(source: string, warnings: string[]): CssParseResult;
/** 解析内联 style="..."（分号分隔声明） */
export declare function parseInlineStyle(styleText: string, warnings: string[]): Record<string, unknown>;
