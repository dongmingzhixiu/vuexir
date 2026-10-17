/**
 * @dongmingzhixiu/vuexir-templates —— 原生工程模板与版本契约（P2）
 *
 * 版本约定：TEMPLATE_VERSION 变化意味着生成产物结构可能变化（新增/删除文件或改动工程骨架），
 * `vrn doctor` 会对比工程内 `.vrn/manifest.json` 记录的版本并提示重生成。
 */
export declare const TEMPLATE_VERSION = "0.1.0";
/** iOS 工程骨架（xcodegen project.yml） */
export declare const projectYml: (projectName: string, bundleId: string) => string;
/** Android 工程骨架（app/build.gradle.kts） */
export declare const buildGradle: (bundleId: string) => string;
/** 模板清单：生成产物需要落盘的工程级文件（相对工程目录） */
export declare function templateFiles(platform: 'ios' | 'android'): string[];
