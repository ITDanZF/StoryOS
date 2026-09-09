import type Database from "better-sqlite3";
import type { ColumnInfo, TableInfo, TableSchema } from "../../shared/developerDatabase.ts";

export function quote(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

type TableEntry = { schema: string; name: string; type: string; wr: number; strict: number };
function entries(db: Database.Database): TableEntry[] {
  return (db.pragma("table_list") as TableEntry[]).filter((table) => table.schema === "main");
}
export function listTables(db: Database.Database): TableInfo[] {
  return entries(db)
    .filter((table) => !table.name.startsWith("sqlite_") && table.type !== "shadow")
    .map(({ name, type }) => ({ name, type }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
function affinity(type: string): string {
  const value = type.toUpperCase();
  if (value.includes("INT")) return "INTEGER";
  if (/CHAR|CLOB|TEXT/.test(value)) return "TEXT";
  if (!value || value.includes("BLOB")) return "BLOB";
  if (/REAL|FLOA|DOUB/.test(value)) return "REAL";
  return "NUMERIC";
}
export function describeTable(db: Database.Database, name: string): TableSchema {
  const table = entries(db).find((entry) => entry.name === name);
  if (!table) throw new Error("数据表已不存在，请刷新结构。");
  const fields = db.prepare("SELECT * FROM pragma_table_xinfo(?)").all(name) as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
    hidden: number;
  }[];
  const columns: ColumnInfo[] = fields
    .filter((field) => field.hidden !== 1)
    .map((field) => ({
      name: field.name,
      type: field.type,
      affinity: affinity(field.type),
      notNull: Boolean(field.notnull),
      defaultSql: field.dflt_value,
      primaryKey: field.pk,
      hidden: field.hidden,
    }));
  const insertable = table.type === "table" && !name.startsWith("sqlite_");
  const primary = columns
    .filter((column) => column.primaryKey)
    .sort((a, b) => a.primaryKey - b.primaryKey);
  // Nullable PRIMARY KEYs in ordinary SQLite tables do not uniquely identify every row.
  const integerAlias =
    primary.length === 1 &&
    primary[0].type.toUpperCase() === "INTEGER" &&
    !table.wr &&
    !db.prepare("SELECT origin FROM pragma_index_list(?) WHERE origin = 'pk'").get(name);
  let locator =
    primary.length &&
    (table.wr || table.strict || integerAlias || primary.every((column) => column.notNull))
      ? primary.map((column) => column.name)
      : [];
  if (insertable && !locator.length && !table.wr) {
    const alias = ["rowid", "_rowid_", "oid"].find(
      (candidate) => !fields.some((field) => field.name.toLowerCase() === candidate),
    );
    if (alias) locator = [alias];
  }
  if (!insertable) locator = [];
  const objects = db
    .prepare("SELECT type, name, sql FROM sqlite_schema WHERE tbl_name = ? ORDER BY type, name")
    .all(name) as TableSchema["objects"];
  return {
    name,
    type: table.type,
    version: db.pragma("schema_version", { simple: true }) as number,
    columns,
    withoutRowid: Boolean(table.wr),
    strict: Boolean(table.strict),
    locator,
    insertable,
    writable: insertable && locator.length > 0,
    reason: !insertable
      ? "视图、虚拟表和 SQLite 内部对象仅支持浏览。"
      : !locator.length
        ? "没有可靠行标识，无法更新或删除记录。"
        : null,
    sql: objects.find((object) => object.type === "table" || object.type === "view")?.sql ?? null,
    objects: objects.filter((object) => object.type === "index" || object.type === "trigger"),
    foreignKeys: db
      .prepare("SELECT * FROM pragma_foreign_key_list(?)")
      .all(name) as TableSchema["foreignKeys"],
  };
}
