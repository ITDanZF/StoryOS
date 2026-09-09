import { ArrowDown, ArrowUp, KeyRound } from "lucide-react";
import type { DataRow, QueryRequest, SqlValue, TableSchema } from "../../../shared/developerDatabase.ts";

export function displayValue(value: SqlValue): string {
  if (value.type === "null") return "NULL";
  if (value.type === "blob") return value.value ? `BLOB · ${value.value.length / 2} 字节预览` : "BLOB · 0 字节";
  if (value.type === "text" && value.value === "") return '""';
  return value.value;
}
export function StructureView({ schema }: { schema: TableSchema }) {
  return <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded border px-2 py-1">结构版本 {schema.version}</span><span className="rounded border px-2 py-1">{schema.withoutRowid ? "WITHOUT ROWID" : "ROWID"}</span>{schema.strict && <span className="rounded border px-2 py-1">STRICT</span>}<span className="rounded border px-2 py-1">行定位：{schema.locator.join(" + ") || "无"}</span></div>
    <table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground">{["字段", "声明类型 / 亲和性", "约束", "默认表达式"].map((name) => <th key={name} className="p-3 font-medium">{name}</th>)}</tr></thead><tbody>{schema.columns.map((column) => <tr key={column.name} className="border-b border-border"><td className="p-3 font-mono">{column.name}</td><td className="p-3">{column.type || "—"} / {column.affinity}</td><td className="p-3">{[column.primaryKey ? `PK ${column.primaryKey}` : "", column.notNull ? "NOT NULL" : "", column.hidden ? "GENERATED" : ""].filter(Boolean).join(" · ") || "—"}</td><td className="p-3 font-mono">{column.defaultSql ?? "—"}</td></tr>)}</tbody></table>
    <section><h3 className="mb-3 text-sm font-semibold">建表定义</h3><pre className="overflow-auto rounded-xl bg-surface-subtle p-4 text-xs leading-6">{schema.sql}</pre></section>
    {schema.foreignKeys.length > 0 && <section><h3 className="mb-3 text-sm font-semibold">外键</h3><pre className="overflow-auto rounded-xl bg-surface-subtle p-4 text-xs">{JSON.stringify(schema.foreignKeys, null, 2)}</pre></section>}
    {schema.objects.map((object) => <section key={object.name}><h3 className="mb-2 text-sm font-semibold">{object.type} · {object.name}</h3><pre className="overflow-auto rounded-xl bg-surface-subtle p-4 text-xs leading-6">{object.sql ?? "SQLite 自动创建的约束索引"}</pre></section>)}
  </div>;
}
export default function DatabaseTable({ schema, rows, sort, busy, onSort, onOpen }: {
  schema: TableSchema; rows: DataRow[]; sort: QueryRequest["sort"]; busy: boolean;
  onSort: (sort: QueryRequest["sort"]) => void; onOpen: (row: DataRow) => void;
}) {
  return <div className="min-h-0 flex-1 overflow-auto">
    <table className="w-full border-separate border-spacing-0 text-left text-sm">
      <thead className="sticky top-0 z-10 bg-surface-subtle"><tr>{schema.columns.map((column) => <th key={column.name} className="border-b border-r border-border px-4 py-3 font-medium"><button disabled={busy} onClick={() => onSort({ column: column.name, direction: sort?.column === column.name && sort.direction === "asc" ? "desc" : "asc" })} className="flex items-center gap-2 whitespace-nowrap" title={`按 ${column.name} 排序`}>{column.primaryKey > 0 && <KeyRound size={12} className="text-warning-text" />}{column.name}{sort?.column === column.name && (sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button><p className="mt-1 text-[10px] font-normal text-text-subtle">{column.type || "无声明类型"}</p></th>)}<th className="sticky right-0 border-b border-border bg-surface-subtle px-4 py-3 font-medium">记录</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="group hover:bg-surface-subtle/70">{row.cells.map((value, i) => <td key={schema.columns[i].name} className="max-w-72 border-b border-r border-border px-4 py-3 font-mono text-xs"><div className={`truncate ${value.type === "null" ? "italic text-text-subtle" : "text-text-secondary"}`} title={value.type === "blob" ? "打开记录查看十六进制数据" : displayValue(value)}>{displayValue(value)}{row.truncated[i] ? "…" : ""}</div></td>)}<td className="sticky right-0 border-b border-border bg-card px-4 py-3"><button disabled={busy || !row.identity} onClick={() => onOpen(row)} className="whitespace-nowrap text-xs text-text-secondary hover:text-foreground disabled:text-text-subtle">打开记录</button></td></tr>)}</tbody>
    </table>
    {!rows.length && <div className="py-20 text-center text-sm text-text-subtle">没有符合条件的记录</div>}
  </div>;
}
