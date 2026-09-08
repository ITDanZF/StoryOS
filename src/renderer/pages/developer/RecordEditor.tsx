import { useEffect, useRef, useState } from "react";
import { X, Save, Trash2 } from "lucide-react";
import type { SqlValue, TableSchema } from "../../../shared/developerDatabase.ts";
import type { EditorState } from "./useDeveloperDatabase.ts";

type Field = { mode: "default" | "null" | "value"; type: "text" | "integer" | "real" | "blob"; value: string };
const inputClass = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-500";
function initialFields(schema: TableSchema, editor: EditorState): Field[] {
  return schema.columns.map((column, index) => {
    const value = editor.detail?.values[index];
    if (value && value.type !== "null") return { mode: "value", type: value.type, value: value.value };
    const type = column.affinity === "INTEGER" ? "integer" : column.affinity === "REAL" ? "real" : column.affinity === "BLOB" ? "blob" : "text";
    return { mode: editor.row ? "null" : "default", type, value: "" };
  });
}
export default function RecordEditor({ schema, editor, busy, editable, error, onSave, onClose, onDelete, onDirtyChange }: {
  schema: TableSchema; editor: EditorState; busy: boolean; editable: boolean; error: string | null;
  onSave: (values: Record<string, SqlValue>) => void; onClose: () => void; onDelete: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [fields, setFields] = useState(() => initialFields(schema, editor));
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const initial = initialFields(schema, editor);
  const dirty = fields.some((field, index) => JSON.stringify(field) !== JSON.stringify(initial[index]));
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  function update(index: number, change: Partial<Field>) {
    setFields((current) => current.map((field, i) => i === index ? { ...field, ...change } : field));
  }
  function submit() {
    const values: Record<string, SqlValue> = Object.create(null);
    fields.forEach((field, index) => {
      if (schema.columns[index].hidden || field.mode === "default") return;
      if (editor.row && JSON.stringify(field) === JSON.stringify(initial[index])) return;
      values[schema.columns[index].name] = field.mode === "null" ? { type: "null" } : { type: field.type, value: field.value };
    });
    onSave(values);
  }
  return (
    <dialog ref={dialogRef} aria-labelledby="record-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 pt-8 backdrop:bg-black/20">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-5">
          <div><h2 id="record-title" className="font-semibold">{editor.row ? editable ? "编辑记录" : "查看记录" : "新增记录"}</h2><p className="mt-1 font-mono text-xs text-neutral-500">{schema.name}</p></div>
          <button autoFocus aria-label="关闭记录" disabled={busy} onClick={onClose} className="rounded-lg p-2 hover:bg-neutral-100"><X size={18} /></button>
        </header>
        <form id="record-form" onSubmit={(event) => { event.preventDefault(); submit(); }} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!editable && <p className="text-sm text-neutral-500">当前为浏览模式，开启编辑会话后可修改数据。</p>}
          {schema.columns.map((column, index) => {
            const field = fields[index];
            const disabled = !editable || busy || Boolean(column.hidden);
            return <fieldset key={column.name} disabled={disabled} className="space-y-2">
              <legend className="mb-2 flex max-w-full flex-wrap items-center gap-2 text-sm font-medium"><span className="break-all font-mono">{column.name}</span><span className="text-xs font-normal text-neutral-400">{column.type || "无声明类型"}{column.primaryKey ? ` · PK ${column.primaryKey}` : ""}{column.notNull ? " · NOT NULL" : ""}{column.hidden ? " · 生成列" : ""}</span></legend>
              <div className="flex gap-2">
                <select aria-label={`${column.name} 填写方式`} className={inputClass} value={field.mode} onChange={(event) => update(index, { mode: event.target.value as Field["mode"] })}>
                  {!editor.row && <option value="default">使用数据库默认值 / 省略</option>}
                  <option value="value">填写值</option><option value="null" disabled={column.notNull}>NULL</option>
                </select>
                {field.mode === "value" && <select aria-label={`${column.name} 值类型`} className={`${inputClass} max-w-28`} value={field.type} onChange={(event) => update(index, { type: event.target.value as Field["type"] })}>
                  <option value="text">TEXT</option><option value="integer">INTEGER</option><option value="real">REAL</option><option value="blob">BLOB</option>
                </select>}
              </div>
              {field.mode === "value" && <textarea aria-label={`${column.name} 值`} spellCheck={false} rows={field.type === "text" || field.type === "blob" ? 3 : 1} className={`${inputClass} resize-y font-mono`} value={field.value} onChange={(event) => update(index, { value: event.target.value })} />}
              {field.mode === "value" && field.type === "blob" && <p className="text-xs text-neutral-500">使用十六进制字节，例如 FF00A1；空内容代表空 BLOB。</p>}
              {field.mode === "default" && <p className="break-all text-xs text-neutral-500">{column.defaultSql === null ? "省略此列，由 SQLite 决定是否允许为空或自动生成。" : `默认表达式：${column.defaultSql}`}</p>}
            </fieldset>;
          })}
        </form>
        <footer className="flex justify-between gap-3 border-t border-neutral-200 p-5">
          <div>{editable && editor.row && <button disabled={busy} onClick={onDelete} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={15} />删除记录</button>}</div>
          <div className="flex gap-2"><button disabled={busy} onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm">关闭</button>{editable && <button type="submit" form="record-form" disabled={busy || Boolean(editor.row && !dirty)} className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"><Save size={15} />保存记录</button>}</div>
        </footer>
      </aside>
    </dialog>
  );
}
