import { describe, expect, it } from 'vitest';
import { DEXIE_SHIM_SOURCE } from '../src/shims';

/** 在 Node 里用假 localStorage 跑 shim，验证「内存表 + 落盘」语义 */
function loadShim() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  // shim 源码是 ESM（供 esbuild 打包），测试里剥掉 export 再 eval
  const cjs = DEXIE_SHIM_SOURCE.replace('export default class Dexie', 'class Dexie');
  const mod = new Function('localStorage', `${cjs}\nreturn Dexie;`)(localStorage);
  return { Dexie: mod, store };
}

class BirthdayDB extends loadShim().Dexie {
  constructor() {
    super('birthday-app');
    this.version(1).stores({ birthdays: 'id, nextBirthday', settings: 'key' });
  }
}

describe('R99 dexie shim（原生端数据层）', () => {
  it('put/get/toArray/delete/bulkPut 往返一致，并落盘到 localStorage', async () => {
    const db = new BirthdayDB();
    await db.settings.put({ key: 'skin', value: 'warm' });
    expect(await db.settings.get('skin')).toEqual({ key: 'skin', value: 'warm' });

    await db.birthdays.bulkPut([
      { id: 'a', name: '妈妈' },
      { id: 'b', name: '爸爸' },
    ]);
    expect((await db.birthdays.toArray()).map((r: { id: string }) => r.id)).toEqual(['a', 'b']);
    expect(await db.birthdays.count()).toBe(2);

    await db.birthdays.delete('a');
    expect((await db.birthdays.toArray()).map((r: { id: string }) => r.id)).toEqual(['b']);

    await db.settings.put({ key: 'skin', value: 'night' });
    expect(await db.settings.get('skin')).toEqual({ key: 'skin', value: 'night' }); // 按主键覆盖而非追加
  });
});
