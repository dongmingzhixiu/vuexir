/**
 * 预览器与宿主 dev server 的接口约定（前缀可被 window.__VRN_API_BASE__ 覆盖）。
 *
 *   GET  {base}/screens            → { mode, screens: [{ name, mode, hasMain }] }
 *   GET  {base}/router?name=<样例>  → router.ts 源码（多页样例）
 *   GET  {base}/page?name=&file=   → 302 → /@fs/<abs>（让 vite 正常 transform 页面 SFC）
 *   GET  {base}/asset?name=&file=  → 页面静态资源（bundle:// 协议桥）
 */
export const VRN_API_BASE: string =
  (typeof window !== 'undefined' && (window as unknown as { __VRN_API_BASE__?: string }).__VRN_API_BASE__) || '/__vrn';
