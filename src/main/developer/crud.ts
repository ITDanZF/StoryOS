import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { DataRow, MutationRequest, QueryRequest, RowDetail, RowRequest, SqlValue, TableRequest, TableSchema } from "../../shared/developerDatabase.ts";
import { describeTable, quote } from "./schema.ts";

const valueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("null") }).strict(),
  z.object({ type: z.enum(["integer", "real", "text", "blob"]), value: z.string().max(16 * 1024 * 1024) }).strict(),
]);
const tableRequest = z.object({ databaseId: z.string().min(1), table: z.string().min(1), version: z.number().int().nonnegative() });
const identitySchema = z.array(valueSchema).min(1).max(2000);
const rowRequest = tableRequest.extend({ identity: identitySchema });
// A schema-derived column name may legitimately be "__proto__". Validate entries
// without z.record's prototype-key filtering, and create data properties safely.
const valuesSchema = z.custom<Record<string, unknown>>((input) =>
  input !== null && typeof input === "object" && !Array.isArray(input))
  .transform((input) => Object.fromEntries(Object.entries(input).map(([name, value]) => [name, valueSchema.parse(value)])));
const mutationRequest = tableRequest.extend({
  operation: z.enum(["insert", "update", "delete"]), values: valuesSchema,
  identity: identitySchema.optional(), fingerprint: z.string().optional(),
});
const queryRequest = tableRequest.extend({
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), limit: z.union([z.literal(20), z.literal(50), z.literal(100)]),
  sort: z.object({ column: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
  filter: z.object({ column: z.string(), operator: z.enum(["eq", "ne", "contains", "gt", "lt", "null", "notNull"]), value: valueSchema }).optional(),
});

export function bindValue(value: SqlValue): string | number | bigint | Buffer | null {
  if (value.type === "null") return null;
  if (value.type === "text") return value.value;
  if (value.type === "blob") {
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(value.value)) throw new Error("BLOB 必须是完整的十六进制字节。");
    return Buffer.from(value.value, "hex");
  }
  if (value.type === "integer") {
    if (!/^-?\d+$/.test(value.value)) throw new Error("请输入有效整数。");
    const result = BigInt(value.value);
    if (result < -(2n ** 63n) || result > 2n ** 63n - 1n) throw new Error("整数超出 SQLite 64 位范围。");
    return result;
  }
  if (!value.value.trim() || !Number.isFinite(Number(value.value))) throw new Error("请输入有限数值。");
  return Number(value.value);
}
function encode(value: unknown, type: string, hexadecimal = false): SqlValue {
  if (type === "null") return { type: "null" };
  if (type === "blob") return { type: "blob", value: hexadecimal ? String(value).toLowerCase() : (value as Buffer).toString("hex") };
  if (type === "text" && hexadecimal) return { type: "text", value: Buffer.from(String(value), "hex").toString("utf8") };
  if (type === "integer" || type === "real" || type === "text") return { type, value: String(value) };
  throw new Error(`无法识别 SQLite 值类型：${type}`);
}
function schemaFor(db: Database.Database, request: TableRequest): TableSchema {
  const schema = describeTable(db, request.table);
  if (schema.version !== request.version) throw new Error("表结构已变化，请保留草稿并刷新结构后重试。");
  return schema;
}
function column(schema: TableSchema, name: string): string {
  if (!schema.columns.some((field) => field.name === name)) throw new Error("字段不存在，请刷新结构。");
  return quote(name);
}
function projection(schema: TableSchema, preview: boolean): string {
  return schema.columns.map(({ name }) => {
    const field = quote(name);
    // Read bytes before decoding: SQLite text substr/length stop at embedded NULs.
    const expr = `CASE WHEN typeof(${field}) IN ('text','blob') THEN hex(${preview ? `substr(cast(${field} AS blob),1,1024)` : `cast(${field} AS blob)`}) ELSE ${field} END`;
    return `${expr}, typeof(${field}), CASE WHEN typeof(${field}) IN ('text','blob') THEN length(cast(${field} AS blob)) ELSE 0 END`;
  }).join(", ");
}
function cells(schema: TableSchema, raw: unknown[], preview = false): SqlValue[] {
  return schema.columns.map((_, index) => {
    const value = encode(raw[index * 3], raw[index * 3 + 1] as string, true);
    if (preview && value.type === "text") return { ...value, value: value.value.slice(0, 256) };
    if (preview && value.type === "blob") return { ...value, value: value.value.slice(0, 512) };
    return value;
  });
}
function identityWhere(schema: TableSchema, identity: SqlValue[]): { sql: string; params: unknown[] } {
  if (!schema.writable || identity.length !== schema.locator.length) throw new Error("此记录没有有效行标识。");
  return { sql: schema.locator.map((name) => `${quote(name)} IS ?`).join(" AND "), params: identity.map(bindValue) };
}
function detail(db: Database.Database, schema: TableSchema, identity: SqlValue[]): RowDetail {
  const where = identityWhere(schema, identity);
  const sizeSql = schema.columns.map(({ name }) => `coalesce(length(cast(${quote(name)} AS blob)),0)`).join(" + ");
  const sizes = db.prepare(`SELECT ${sizeSql} FROM ${quote(schema.name)} WHERE ${where.sql} LIMIT 2`).pluck().all(...where.params) as number[];
  if (sizes.length !== 1) throw new Error("记录已删除或行标识不唯一，请刷新。");
  if (sizes[0] > 8 * 1024 * 1024) throw new Error("此记录超过 8 MiB 编辑上限，请使用外部数据库工具处理。");
  const raw = db.prepare(`SELECT ${projection(schema, false)} FROM ${quote(schema.name)} WHERE ${where.sql}`).raw().safeIntegers().get(...where.params) as unknown[];
  const values = cells(schema, raw);
  return { values, fingerprint: createHash("sha256").update(JSON.stringify(values)).digest("hex") };
}

export function queryRows(db: Database.Database, input: QueryRequest): { rows: DataRow[]; hasMore: boolean } {
  const request = queryRequest.parse(input);
  return db.transaction(() => {
    const schema = schemaFor(db, request);
    const params: unknown[] = [];
    let where = "";
    if (request.filter) {
      const { operator, value } = request.filter;
      const field = column(schema, request.filter.column);
      const operators = { eq: "=", ne: "!=", gt: ">", lt: "<" };
      if (operator === "null" || operator === "notNull") where = `${field} IS ${operator === "notNull" ? "NOT " : ""}NULL`;
      else if (operator === "contains") {
        if (value.type !== "text") throw new Error("包含查询需要文本值。");
        where = `instr(cast(${field} AS text), ?) > 0`; params.push(value.value);
      } else { where = `${field} ${operators[operator]} ?`; params.push(bindValue(value)); }
    }
    const order = request.sort ? [`${column(schema, request.sort.column)} ${request.sort.direction.toUpperCase()}`] : [];
    order.push(...schema.locator.map(quote));
    const locators = schema.locator.map((name) => `, ${quote(name)}, typeof(${quote(name)})`).join("");
    const rows = db.prepare(`SELECT ${projection(schema, true)}${locators} FROM ${quote(schema.name)}${where ? ` WHERE ${where}` : ""}${order.length ? ` ORDER BY ${order.join(", ")}` : ""} LIMIT ? OFFSET ?`)
      .raw().safeIntegers().all(...params, request.limit + 1, request.offset) as unknown[][];
    return {
      hasMore: rows.length > request.limit,
      rows: rows.slice(0, request.limit).map((raw) => ({
        cells: cells(schema, raw, true), truncated: cells(schema, raw, true).map((value, index) =>
          Number(raw[index * 3 + 2]) > (value.type === "text" ? Buffer.byteLength(value.value) : value.type === "blob" ? value.value.length / 2 : 0)),
        identity: schema.locator.length ? schema.locator.map((_, index) => encode(raw[schema.columns.length * 3 + index * 2], raw[schema.columns.length * 3 + index * 2 + 1] as string)) : null,
      })),
    };
  })();
}
export function readRow(db: Database.Database, input: RowRequest): RowDetail {
  const request = rowRequest.parse(input);
  return db.transaction(() => detail(db, schemaFor(db, request), request.identity))();
}
export function mutate(db: Database.Database, input: MutationRequest): void {
  const request = mutationRequest.parse(input);
  db.transaction(() => {
    const schema = schemaFor(db, request);
    if (!schema.insertable) throw new Error(schema.reason);
    const names = Object.keys(request.values);
    const fields = names.map((name) => {
      const result = column(schema, name);
      if (schema.columns.find((field) => field.name === name).hidden) throw new Error("生成列不可直接写入。");
      return result;
    });
    const values = names.map((name) => bindValue(request.values[name]));
    const byteSize = values.reduce<number>((total, value) => total + (typeof value === "string" ? Buffer.byteLength(value) : Buffer.isBuffer(value) ? value.length : 8), 0);
    if (byteSize > 8 * 1024 * 1024) throw new Error("提交内容超过 8 MiB 编辑上限。");
    if (request.operation === "insert") {
      db.prepare(`INSERT INTO ${quote(schema.name)} ${fields.length ? `(${fields.join(", ")}) VALUES (${names.map((name) => request.values[name].type === "real" ? "CAST(? AS REAL)" : "?").join(", ")})` : "DEFAULT VALUES"}`).run(...values);
      return;
    }
    if (!request.identity || !request.fingerprint) throw new Error("缺少原始记录标识或版本。");
    const current = detail(db, schema, request.identity);
    if (current.fingerprint !== request.fingerprint) throw new Error("记录已被其他连接修改，请保留草稿并重新加载。");
    const where = identityWhere(schema, request.identity);
    if (request.operation === "update" && !fields.length) throw new Error("没有要保存的字段。");
    const sql = request.operation === "delete" ? `DELETE FROM ${quote(schema.name)}`
      : `UPDATE ${quote(schema.name)} SET ${fields.map((field, index) => `${field} = ${request.values[names[index]].type === "real" ? "CAST(? AS REAL)" : "?"}`).join(", ")}`;
    const result = db.prepare(`${sql} WHERE ${where.sql}`).run(...(request.operation === "delete" ? [] : values), ...where.params);
    if (result.changes !== 1) throw new Error("目标记录数量发生变化，操作已回滚。");
  }).immediate();
}
