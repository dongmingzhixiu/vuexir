/**
 * R99 P4：原生端没有 IndexedDB/Dexie，这里提供一个**最小可用 shim**，
 * 在 esbuild 打包时把 `dexie` 别名到它——于是 `utils/db.ts` 可以进 bundle。
 *
 * 行为：内存表 + 落盘到 localStorage（iOS→UserDefaults / Android→SharedPreferences，
 * 由运行时 localStorage shim 提供），API 覆盖 app 实际用到的子集：
 *   db.version(n).stores({...}) / table.get / put / bulkPut / toArray / delete / clear / count
 */
export const DEXIE_SHIM_SOURCE = `
function __vrnDbKey(db, table) { return "vrn.db:" + db + ":" + table; }

class Table {
  constructor(dbName, name) { this.dbName = dbName; this.name = name; }
  _read() {
    try {
      var raw = localStorage.getItem(__vrnDbKey(this.dbName, this.name));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  _write(rows) {
    try { localStorage.setItem(__vrnDbKey(this.dbName, this.name), JSON.stringify(rows)); } catch (e) {}
  }
  async toArray() {
    var rows = this._read();
    try { (globalThis.__vrnErrs = globalThis.__vrnErrs || []).push("toArray:" + this.name + "=" + rows.length); } catch (e) {}
    return rows;
  }
  async count() { return this._read().length; }
  async get(key) {
    var keyName = this.keyPath || "id";
    var hit = this._read().find(function (r) { return r && r[keyName] === key; });
    try { (globalThis.__vrnErrs = globalThis.__vrnErrs || []).push("get:" + this.name + "." + key + "=" + (hit ? "hit" : "miss")); } catch (e) {}
    return hit;
  }
  async put(row) {
    var keyName = this.keyPath || "id";
    var rows = this._read();
    var i = rows.findIndex(function (r) { return r && r[keyName] === row[keyName]; });
    if (i >= 0) rows[i] = row; else rows.push(row);
    this._write(rows);
    return row[keyName];
  }
  async bulkPut(list) {
    var self = this;
    var rows = self._read();
    var keyName = self.keyPath || "id";
    (list || []).forEach(function (row) {
      var i = rows.findIndex(function (r) { return r && r[keyName] === row[keyName]; });
      if (i >= 0) rows[i] = row; else rows.push(row);
    });
    self._write(rows);
    return (list || []).length;
  }
  async delete(key) {
    var keyName = this.keyPath || "id";
    this._write(this._read().filter(function (r) { return !r || r[keyName] !== key; }));
  }
  async clear() { this._write([]); }
  where() { throw new Error("vrn dexie shim: where() 暂不支持"); }
  orderBy() { throw new Error("vrn dexie shim: orderBy() 暂不支持"); }
}

class Version {
  constructor(db) { this._db = db; }
  stores(spec) {
    var db = this._db;
    Object.keys(spec || {}).forEach(function (tableName) {
      var keyPath = String(spec[tableName]).split(",")[0].trim();
      var t = new Table(db.name, tableName);
      t.keyPath = keyPath;
      db[tableName] = t;
    });
    return this;
  }
}

export default class Dexie {
  constructor(name) { this.name = name; }
  version() { return new Version(this); }
}
`;

/**
 * R100 P4：`vue` 的最小 shim —— 只是为了让 stores/utils 里的 ref/computed 能在
 * 原生 JS 运行时（JSC/QuickJS）里跑起来，**不是完整响应式系统**：
 *   · ref(x)      → { value: x }（读写 .value）
 *   · computed(f) → 惰性求值 + 依赖收集（简单标记失效）
 *   · reactive(x) → 原样返回（对象引用语义）
 *   · onMounted   → 收集回调，由宿主在页面挂载后调用
 *   · watch       → 简单轮询式比较（同一个事件循环 tick 内触发）
 */
export const VUE_SHIM_SOURCE = `
var __vrnMounted = [];
export function ref(v) {
  return { __vrnRef: true, value: v };
}
export function shallowRef(v) { return ref(v); }
export function reactive(obj) { return obj; }
export function readonly(obj) { return obj; }
export function computed(fn) {
  // R120：不做缓存——原生端没有依赖追踪，store.init() 是异步的，
  // 首次求值（数据未到）会被永久缓存成空值。每次读都重算，配合 tick 同步即可。
  return {
    __vrnComputed: true,
    get value() {
      try {
        return fn();
      } catch (e) {
        return undefined;
      }
    },
    set value(_v) {},
  };
}
export function onMounted(fn) { __vrnMounted.push(fn); }
export function onUnmounted() {}
export function onBeforeUnmount() {}
export function watch(source, cb) {
  var last = typeof source === "function" ? source() : source && source.value;
  return setInterval(function () {
    var cur = typeof source === "function" ? source() : source && source.value;
    if (cur !== last) { var prev = last; last = cur; cb(cur, prev); }
  }, 16);
}
export function nextTick(fn) { return Promise.resolve().then(fn); }
export function toRefs(obj) {
  var out = {};
  Object.keys(obj || {}).forEach(function (k) { out[k] = ref(obj[k]); });
  return out;
}
export function unref(v) { return v && v.__vrnRef ? v.value : v; }
export function isRef(v) { return !!(v && v.__vrnRef); }
export function __vrnRunMounted() {
  var list = __vrnMounted.slice();
  __vrnMounted.length = 0;
  list.forEach(function (fn) { try { fn(); } catch (e) {} });
}
export default {
  ref: ref, shallowRef: shallowRef, reactive: reactive, readonly: readonly, computed: computed,
  onMounted: onMounted, onUnmounted: onUnmounted, onBeforeUnmount: onBeforeUnmount,
  watch: watch, nextTick: nextTick, toRefs: toRefs, unref: unref, isRef: isRef,
};
`;

/**
 * R100 P4：`pinia` 的最小 shim —— 让 `stores/*.ts` 的 defineStore 能在运行时可加载。
 * 支持 options 写法（state/getters/actions）与 setup 写法（函数返回 state 与 action）。
 * 单例语义：同一 id 只创建一次（与 Pinia 一致），跨页面共享。
 */
export const PINIA_SHIM_SOURCE = `
var __vrnStores = (typeof globalThis !== "undefined" && globalThis.__vrnStores) || (globalThis.__vrnStores = {});
function __vrnBind(store, obj) {
  Object.keys(obj || {}).forEach(function (k) {
    var v = obj[k];
    if (typeof v === "function") {
      // R119：action 内部异常在原生端完全不可见 → 记录到全局错误表并 toast 出来
      store[k] = function () {
        var self = this;
        var rec = function (e) {
          try {
            var errs = (globalThis.__vrnErrs = globalThis.__vrnErrs || []);
            errs.push(k + ": " + String((e && e.message) || e));
            if (typeof bridge !== "undefined" && bridge && bridge.toast) bridge.toast("E(" + k + "): " + String((e && e.message) || e).slice(0, 40));
          } catch (_) {}
        };
        try {
          var r = v.apply(self, arguments);
          if (r && typeof r.then === "function") r.then(null, rec);
          return r;
        } catch (e) {
          rec(e);
          throw e;
        }
      };
    } else store[k] = v;
  });
}
export function defineStore(id, def) {
  return function useStore() {
    if (__vrnStores[id]) return __vrnStores[id];
    var store = {};
    if (typeof def === "function") {
      var ret = def();
      __vrnBind(store, ret);
      Object.keys(ret || {}).forEach(function (k) {
        if (ret[k] && ret[k].__vrnRef) store[k] = ret[k].value;
      });
    } else {
      var state = typeof def.state === "function" ? def.state() : def.state || {};
      Object.keys(state).forEach(function (k) { store[k] = state[k]; });
      Object.keys(def.getters || {}).forEach(function (k) {
        var g = def.getters[k];
        Object.defineProperty(store, k, {
          enumerable: true,
          get: function () {
            try {
              return g.call(store, store);
            } catch (e) {
              // R124：getter 异常在原生端不可见 → 记录并 toast 一次
              try {
                if (!globalThis.__vrnGetErr) {
                  globalThis.__vrnGetErr = {};
                }
                if (!globalThis.__vrnGetErr[k]) {
                  globalThis.__vrnGetErr[k] = 1;
                  if (typeof bridge !== "undefined" && bridge && bridge.toast) {
                    bridge.toast("G(" + k + "): " + String((e && e.message) || e).slice(0, 36));
                  }
                }
              } catch (_) {}
              return undefined;
            }
          },
        });
      });
      __vrnBind(store, def.actions);
    }
    __vrnStores[id] = store;
    return store;
  };
}
export function createPinia() { return {}; }
export function storeToRefs(store) {
  var out = {};
  Object.keys(store || {}).forEach(function (k) {
    var v = store[k];
    if (typeof v !== "function") out[k] = { __vrnRef: true, get value() { return store[k]; }, set value(x) { store[k] = x; } };
  });
  return out;
}
export default { defineStore: defineStore, createPinia: createPinia, storeToRefs: storeToRefs };
`;

/** R118：vue-router 最小 shim（页面里的 useRoute/useRouter 在原生端由编译器接管导航） */
export const VUE_ROUTER_SHIM_SOURCE = `
export function useRoute() {
  return {
    params: (typeof globalThis.__vrnRouteParams === "object" && globalThis.__vrnRouteParams) || {},
    query: {},
    path: (globalThis.__vrnRoutePath || "/"),
    name: "",
  };
}
export function useRouter() {
  return {
    push: function (p) { try { if (typeof __routerPush === "function") __routerPush(typeof p === "string" ? p : (p && (p.name || p.path)) || ""); } catch (e) {} },
    replace: function (p) { return this.push(p); },
    back: function () { try { if (typeof __routerBack === "function") __routerBack(); } catch (e) {} },
  };
}
export function createRouter(o) { return { options: o, install: function () {} }; }
export function createWebHashHistory() { return {}; }
export function createWebHistory() { return {}; }
export default { useRoute: useRoute, useRouter: useRouter, createRouter: createRouter };
`;
