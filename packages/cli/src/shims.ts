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
  async toArray() { return this._read(); }
  async count() { return this._read().length; }
  async get(key) {
    var keyName = this.keyPath || "id";
    return this._read().find(function (r) { return r && r[keyName] === key; });
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
