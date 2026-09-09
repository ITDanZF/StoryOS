import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeTable, listTables } from "../../src/main/developer/schema.ts";
import { bindValue, mutate, queryRows, readRow } from "../../src/main/developer/crud.ts";
import type { MutationRequest, SqlValue } from "../../src/shared/developerDatabase.ts";

let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
});
afterEach(() => db.close());
const text = (value: string): SqlValue => ({ type: "text", value });
const integer = (value: string): SqlValue => ({ type: "integer", value });
const base = (table: string) => ({
  databaseId: "test",
  table,
  version: describeTable(db, table).version,
});
function rows(table: string) {
  return queryRows(db, { ...base(table), offset: 0, limit: 20 }).rows;
}
function insert(table: string, values: Record<string, SqlValue>) {
  mutate(db, { ...base(table), operation: "insert", values });
}
function edit(
  table: string,
  values: Record<string, SqlValue>,
  operation: MutationRequest["operation"] = "update",
) {
  const identity = rows(table)[0].identity;
  const detail = readRow(db, { ...base(table), identity });
  mutate(db, { ...base(table), operation, values, identity, fingerprint: detail.fingerprint });
}
describe("metadata driven SQLite CRUD", () => {
  it("discovers unknown tables and performs CRUD after adding and renaming fields", () => {
    expect(listTables(db)).toEqual([]);
    db.exec("CREATE TABLE future(id INTEGER PRIMARY KEY, text TEXT DEFAULT (upper('new')))");
    expect(listTables(db).map((table) => table.name)).toEqual(["future"]);
    insert("future", {});
    expect(rows("future")[0].cells[1]).toEqual(text("NEW"));
    db.exec(
      "ALTER TABLE future ADD COLUMN count INTEGER NOT NULL DEFAULT 0; ALTER TABLE future RENAME COLUMN text TO title",
    );
    edit("future", { title: text("changed"), count: integer("5") });
    expect(rows("future")[0].cells).toEqual([integer("1"), text("changed"), integer("5")]);
    db.exec("ALTER TABLE future DROP COLUMN count");
    expect(describeTable(db, "future").columns.map((column) => column.name)).toEqual([
      "id",
      "title",
    ]);
    edit("future", {}, "delete");
    expect(rows("future")).toEqual([]);
  });
  it("rejects stale schema and stale row versions without writes", () => {
    db.exec(
      "CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO items VALUES(1,'old')",
    );
    const request = base("items");
    const identity = rows("items")[0].identity;
    const detail = readRow(db, { ...request, identity });
    db.exec("UPDATE items SET value='external'");
    expect(() =>
      mutate(db, {
        ...request,
        identity,
        fingerprint: detail.fingerprint,
        operation: "update",
        values: { value: text("mine") },
      }),
    ).toThrow("其他连接修改");
    db.exec("ALTER TABLE items ADD COLUMN extra TEXT");
    expect(() => queryRows(db, { ...request, offset: 0, limit: 20 })).toThrow("表结构已变化");
    expect(() => mutate(db, { ...request, operation: "insert", values: {} })).toThrow(
      "表结构已变化",
    );
    expect(rows("items")[0].cells[1]).toEqual(text("external"));
  });
  it("preserves NULL, empty text, mixed storage types, int64, real and binary data", () => {
    db.exec("CREATE TABLE values_table(id INTEGER PRIMARY KEY, a, b, c, d, e, f, g)");
    const values = {
      a: { type: "null" } as SqlValue,
      b: text(""),
      c: integer("9223372036854775807"),
      d: { type: "blob", value: "00ff8041" } as SqlValue,
      e: { type: "real", value: "2" } as SqlValue,
      f: text("中文\u0000尾部"),
      g: { type: "blob", value: "" } as SqlValue,
    };
    insert("values_table", values);
    const detail = readRow(db, {
      ...base("values_table"),
      identity: rows("values_table")[0].identity,
    });
    expect(detail.values.slice(1)).toEqual(Object.values(values));
    expect(() => bindValue(integer("9223372036854775808"))).toThrow("64 位");
    expect(() => bindValue({ type: "blob", value: "a" })).toThrow("十六进制");
    expect(() => bindValue({ type: "real", value: "NaN" })).toThrow("有限数值");
  });
  it("keeps long values bounded in the grid and loads complete editor values on demand", () => {
    db.exec("CREATE TABLE big(id INTEGER PRIMARY KEY, text TEXT, binary BLOB)");
    insert("big", {
      text: text("文".repeat(1000)),
      binary: { type: "blob", value: "ab".repeat(1000) },
    });
    const row = rows("big")[0];
    expect(row.truncated).toEqual([false, true, true]);
    expect(row.cells[1]).toEqual(text("文".repeat(256)));
    expect(readRow(db, { ...base("big"), identity: row.identity }).values[1]).toEqual(
      text("文".repeat(1000)),
    );
  });
  it("supports composite WITHOUT ROWID keys and changing primary keys", () => {
    db.exec(
      "CREATE TABLE composite(a TEXT, b INTEGER, value TEXT, PRIMARY KEY(a,b)) WITHOUT ROWID",
    );
    insert("composite", { a: text("key"), b: integer("9007199254740993"), value: text("old") });
    expect(describeTable(db, "composite").locator).toEqual(["a", "b"]);
    edit("composite", { a: text("new key") });
    expect(rows("composite")[0].identity).toEqual([text("new key"), integer("9007199254740993")]);
    edit("composite", {}, "delete");
    expect(rows("composite")).toHaveLength(0);
  });
  it("does not mistake nullable PRIMARY KEYs for unique row identities", () => {
    db.exec(
      "CREATE TABLE nullable(id TEXT PRIMARY KEY, value TEXT); INSERT INTO nullable VALUES(NULL,'a'),(NULL,'b')",
    );
    expect(describeTable(db, "nullable").locator).toEqual(["rowid"]);
    edit("nullable", { value: text("changed") });
    expect(rows("nullable").map((row) => row.cells[1])).toEqual([text("changed"), text("b")]);
  });
  it("handles shadowed rowid names and INTEGER PRIMARY KEY DESC correctly", () => {
    db.exec(
      'CREATE TABLE shadow("ROWID" TEXT, "_rowid_" TEXT, oid TEXT); CREATE TABLE alias("rowid" INTEGER PRIMARY KEY, "_rowid_" TEXT, oid TEXT); CREATE TABLE descending(id INTEGER PRIMARY KEY DESC)',
    );
    expect(describeTable(db, "shadow").writable).toBe(false);
    expect(describeTable(db, "alias").locator).toEqual(["rowid"]);
    expect(describeTable(db, "descending").locator).toEqual(["rowid"]);
    insert("shadow", { ROWID: text("a") });
    expect(rows("shadow")[0].identity).toBeNull();
  });
  it("quotes identifiers and binds values without SQL injection", () => {
    db.exec('CREATE TABLE "odd"" table" ("id" INTEGER PRIMARY KEY, "select" TEXT)');
    insert('odd" table', { select: text("'; DROP TABLE anything; --") });
    expect(rows('odd" table')[0].cells[1]).toEqual(text("'; DROP TABLE anything; --"));
    expect(() => insert('odd" table', { unknown: text("x") })).toThrow("字段不存在");
  });
  it("enforces NOT NULL, CHECK, UNIQUE and generated column restrictions", () => {
    db.exec(
      "CREATE TABLE constrained(id INTEGER PRIMARY KEY, value INTEGER NOT NULL UNIQUE CHECK(value>0), doubled INTEGER GENERATED ALWAYS AS (value*2) STORED)",
    );
    insert("constrained", { value: integer("3") });
    expect(rows("constrained")[0].cells[2]).toEqual(integer("6"));
    expect(() => insert("constrained", { value: integer("3") })).toThrow("UNIQUE");
    expect(() => edit("constrained", { value: integer("-1") })).toThrow("CHECK");
    expect(() => edit("constrained", { value: { type: "null" } })).toThrow("NOT NULL");
    expect(() => edit("constrained", { doubled: integer("99") })).toThrow("生成列");
    expect(rows("constrained")[0].cells[1]).toEqual(integer("3"));
  });
  it("preserves column names that collide with JavaScript prototype properties", () => {
    db.exec('CREATE TABLE special(id INTEGER PRIMARY KEY, "__proto__" TEXT, constructor TEXT)');
    insert(
      "special",
      Object.fromEntries([
        ["__proto__", text("data")],
        ["constructor", text("record")],
      ]),
    );
    expect(rows("special")[0].cells.slice(1)).toEqual([text("data"), text("record")]);
    edit("special", Object.fromEntries([["__proto__", text("updated")]]));
    expect(rows("special")[0].cells[1]).toEqual(text("updated"));
  });
  it("preserves foreign key cascades and triggers and rolls back ignored mutations", () => {
    db.exec(
      "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER PRIMARY KEY, parent INTEGER REFERENCES parent(id) ON DELETE CASCADE); CREATE TABLE audit(message TEXT); INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1,1); CREATE TRIGGER record_delete AFTER DELETE ON parent BEGIN INSERT INTO audit VALUES('deleted'); END",
    );
    edit("parent", {}, "delete");
    expect(rows("child")).toHaveLength(0);
    expect(rows("audit")[0].cells[0]).toEqual(text("deleted"));
    db.exec(
      "INSERT INTO parent VALUES(2); CREATE TRIGGER ignore_update BEFORE UPDATE ON parent BEGIN SELECT RAISE(IGNORE); END",
    );
    expect(() => edit("parent", { id: integer("4") })).toThrow("回滚");
    expect(rows("parent")[0].cells[0]).toEqual(integer("2"));
  });
  it("keeps views and virtual tables read only and excludes FTS shadow tables", () => {
    db.exec(
      "CREATE TABLE ordinary(id INTEGER PRIMARY KEY); CREATE VIEW view_data AS SELECT * FROM ordinary; CREATE VIRTUAL TABLE search USING fts5(content)",
    );
    expect(describeTable(db, "view_data").insertable).toBe(false);
    expect(describeTable(db, "search").insertable).toBe(false);
    expect(listTables(db).map((table) => table.name)).toEqual(["ordinary", "search", "view_data"]);
    expect(() => insert("view_data", {})).toThrow("仅支持浏览");
  });
  it("queries with literal contains, typed filters, stable sort and bounded pages", () => {
    db.exec("CREATE TABLE paged(id INTEGER PRIMARY KEY, label TEXT)");
    for (let i = 0; i < 25; i++) insert("paged", { label: text(i === 0 ? "100%" : "same") });
    const first = queryRows(db, {
      ...base("paged"),
      offset: 0,
      limit: 20,
      sort: { column: "label", direction: "asc" },
    });
    expect(first.rows).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    const last = queryRows(db, { ...base("paged"), offset: 20, limit: 20 });
    expect(last.rows).toHaveLength(5);
    expect(last.hasMore).toBe(false);
    const filtered = queryRows(db, {
      ...base("paged"),
      offset: 0,
      limit: 20,
      filter: { column: "label", operator: "contains", value: text("%") },
    });
    expect(filtered.rows).toHaveLength(1);
  });
});
