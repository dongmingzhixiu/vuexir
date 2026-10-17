import { describe, expect, it } from 'vitest';
import { PINIA_SHIM_SOURCE } from '../src/shims';

function loadPinia() {
  const cjs = PINIA_SHIM_SOURCE.replace(/export\s+(function|default|\{)/g, (_m, kind) => (kind === 'default' ? 'const __default =' : kind));
  const fn = new Function(`${cjs}\nreturn { defineStore: defineStore, storeToRefs: storeToRefs };`);
  return fn();
}

describe('R100 pinia shim（原生端 store 运行时）', () => {
  it('options 写法：state 初值 / getter 计算 / action 改状态 / 单例共享', () => {
    const { defineStore } = loadPinia();
    const useUi = defineStore('ui', {
      state: () => ({ skin: 'warm', count: 0 }),
      getters: { isDark(state: { skin: string }) { return state.skin === 'night'; } },
      actions: { setSkin(s: string) { (this as unknown as { skin: string }).skin = s; } },
    });
    const a = useUi();
    const b = useUi();
    expect(a).toBe(b); // 单例
    expect(a.skin).toBe('warm');
    expect(a.isDark).toBe(false);
    a.setSkin('night');
    expect(a.skin).toBe('night');
    expect(a.isDark).toBe(true); // getter 实时反映
  });
});
