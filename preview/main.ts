/**
 * preview/main.ts —— 本仓库自用的预览入口（薄壳）
 *
 * 预览器本体已随 `@dongmingzhixiu/vuexir-vite-plugin` 发布（packages/vite-plugin/preview/），
 * 这里只做挂载 + 本仓库的样例接口适配（见 vite.config.ts 的 /__vrn/* 中间件）。
 */
import { mountPreview } from '../packages/vite-plugin/preview/preview-main';

void mountPreview('#vuexir-preview');
