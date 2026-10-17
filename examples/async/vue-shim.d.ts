// 样例 router.ts 的 .vue 导入声明（仅类型检查用；编译器用正则解析 router.ts，不实际执行）
declare module '*.vue' {
  const component: unknown;
  export default component;
}
