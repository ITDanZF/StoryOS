import { ConfirmDialog } from "../../components/ui/Dialog.tsx";
import { ArrowLeft, Database, RefreshCw, Plus, LockKeyhole, UnlockKeyhole, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import type { QueryRequest, SqlValue } from "../../../shared/developerDatabase.ts";
import WindowTitleBar from "../../components/WindowTitleBar.tsx";
import { cn } from "../../../lib/utils.ts";
import { useDeveloperDatabase } from "./useDeveloperDatabase.ts";
import DatabaseTable, { StructureView } from "./DatabaseTable.tsx";
import DatabaseSidebar from "./DatabaseSidebar.tsx";
import RecordEditor from "./RecordEditor.tsx";

const button = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-surface-subtle disabled:opacity-40";
const primaryButton = cn(button, "border-primary bg-primary text-primary-foreground hover:bg-primary");
const input = "min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none focus:border-border-strong";
export default function DeveloperPage() {
  const db = useDeveloperDatabase();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"data" | "structure">("data");
  const [field, setField] = useState("");
  const [operator, setOperator] = useState<NonNullable<QueryRequest["filter"]>["operator"]>("contains");
  const [value, setValue] = useState("");
  const [valueType, setValueType] = useState<"text" | "integer" | "real" | "blob">("text");
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<{ title: string; description: string; action: () => void } | null>(null);
  const blocker = useBlocker(Boolean(db.status?.paused || db.editor || db.busy));
  useEffect(() => {
    if (!dirty && !db.busy) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, db.busy]);
  const closeEditor = () => {
    if (dirty) setConfirmation({ title: "放弃未保存的修改？", description: "已保存的数据不受影响，当前草稿将被丢弃。", action: () => db.setEditor(null) });
    else db.setEditor(null);
  };
  const beginEditing = () => setConfirmation({ title: "开启数据库编辑会话", description: "StoryOS 将暂停业务访问并备份已有数据库。直接修改记录会执行数据库约束和触发器，但不会自动执行应用业务逻辑。", action: () => void db.begin() });
  return <main className="relative flex h-dvh flex-col overflow-hidden bg-card pt-8 font-sans text-foreground [&_button:disabled]:cursor-not-allowed [&_button:not(:disabled)]:cursor-pointer">
    <WindowTitleBar />
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
      <div className="flex items-center gap-4"><button aria-label="返回设置" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => navigate("/settings")}><ArrowLeft size={18} /></button><span className="h-6 w-px bg-border" /><div><h1 className="text-sm font-semibold">开发者工具 <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">SQLite</span></h1><p className="mt-1 text-[11px] text-text-subtle">本地数据浏览与编辑</p></div></div>
      <div className="flex items-center gap-2"><button className={button} disabled={db.busy || !db.api || Boolean(db.editor)} onClick={() => { setField(""); void db.refresh(); }}><RefreshCw size={14} className={db.busy ? "animate-spin" : ""} />刷新结构</button>{db.status?.paused && <button className={button} disabled={db.busy || Boolean(db.editor)} onClick={() => void db.end()}>结束会话并恢复应用</button>}{!db.status?.editing && <button className={primaryButton} disabled={db.busy || !db.status || Boolean(db.editor)} onClick={beginEditing}><UnlockKeyhole size={14} />开启编辑</button>}</div>
    </header>
    {!db.api ? <div className="m-auto text-center"><Database size={32} className="mx-auto mb-4 text-text-subtle" /><p className="text-sm text-muted-foreground">请在 StoryOS 桌面开发环境中打开此页面。</p></div> : <>
      <div className={`flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-2 text-xs ${db.status?.paused ? "border-warning-border bg-warning-surface text-warning-text" : "border-border bg-surface-subtle text-muted-foreground"}`}>
        {db.status?.paused ? <UnlockKeyhole size={13} /> : <LockKeyhole size={13} />}
        <span>{db.status?.editing ? "编辑会话已开启 · 业务访问已暂停" : db.status?.paused ? "业务访问已暂停 · 可重试开启编辑或恢复应用" : "浏览模式 · 开启编辑会话后可新增、修改和删除记录"}</span>
        {db.status?.backups.length > 0 && <details className="ml-auto"><summary className="cursor-pointer">{db.status.backups.length} 个数据库备份</summary><div className="absolute right-4 z-20 mt-2 max-h-48 max-w-[90vw] overflow-auto rounded-lg border border-warning-border bg-card p-3 font-mono text-[10px] shadow-lg">{db.status.backups.map((file) => <p key={file}>{file}</p>)}</div></details>}
      </div>
      {db.error && <div role="alert" className="shrink-0 border-b border-danger-border bg-danger-surface px-6 py-3 text-sm text-danger-text">{db.error}</div>}
      {db.notice && <div role="status" className="shrink-0 bg-success-surface px-6 py-2 text-xs text-success-text">{db.notice}</div>}
      {db.status?.warnings.map((warning) => <div key={warning} role="alert" className="bg-warning-surface px-6 py-2 text-xs text-warning-text">{warning}</div>)}
      <div className="flex min-h-0 flex-1">
        <DatabaseSidebar databases={db.databases} tableLists={db.tableLists} selected={db.selected} discovering={db.discovering}
          disabled={db.navigationDisabled} onRetry={(id) => void db.retryDatabase(id)} onRefresh={() => void db.refresh()}
          onSelect={(item, name) => {
            if (db.selected?.databaseId === item.id && db.selected.tableName === name) return;
            setField(""); setValue(""); setTab("data"); void db.selectTable(item, name);
          }} />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!db.schema ? <div className="m-auto p-8 text-center"><Database size={36} strokeWidth={1.3} className="mx-auto mb-4 text-text-subtle" /><h2 className="text-base font-medium">{db.selected ? `${db.database.name} / ${db.selected.tableName}` : "选择一个数据表"}</h2><p className="mt-2 text-xs text-text-subtle">字段与表单根据 SQLite 结构自动生成</p>{db.busy && <LoaderCircle size={18} className="mx-auto mt-5 animate-spin text-text-subtle" />}</div> : <>
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-5"><div className="min-w-0"><p className="mb-2 truncate text-xs text-muted-foreground">{db.database.name}</p><h2 className="truncate font-mono text-lg font-semibold">{db.schema.name}</h2><p className="mt-1 max-h-12 overflow-auto break-all text-[11px] text-text-subtle" title={db.database.path}>{db.database.path}</p></div><button className={button} disabled={db.busy || !db.status?.editing || !db.schema.insertable} onClick={() => db.setEditor({ row: null, detail: null })}><Plus size={14} />新增记录</button></div>
            <div className="flex shrink-0 gap-6 border-b border-border px-6">{([['data', '数据'], ['structure', '结构']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`border-b-2 pb-3 text-xs font-medium ${tab === key ? "border-primary text-foreground" : "border-transparent text-text-subtle"}`}>{label}</button>)}</div>
            {db.schema.reason && <p className="bg-surface-subtle px-6 py-2 text-xs text-muted-foreground">{db.schema.reason}</p>}
            {tab === "structure" ? <StructureView schema={db.schema} /> : <>
              <form className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-6 py-3" onSubmit={(event) => { event.preventDefault(); if (field) void db.query(0, db.limit, { column: field, operator, value: { type: valueType, value } as SqlValue }); }}>
                <select aria-label="筛选字段" value={field} onChange={(event) => setField(event.target.value)} className={`${input} max-w-40`}><option value="">选择字段</option>{db.schema.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>
                <select aria-label="筛选条件" value={operator} onChange={(event) => setOperator(event.target.value as typeof operator)} className={input}>{Object.entries({ contains: "包含", eq: "等于", ne: "不等于", gt: "大于", lt: "小于", null: "为空", notNull: "不为空" }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                {operator !== "null" && operator !== "notNull" && <><select aria-label="筛选值类型" value={valueType} onChange={(event) => setValueType(event.target.value as typeof valueType)} className={input}><option value="text">TEXT</option><option value="integer">INTEGER</option><option value="real">REAL</option><option value="blob">BLOB</option></select><input aria-label="筛选值" placeholder="输入筛选值" value={value} onChange={(event) => setValue(event.target.value)} className={`${input} w-36 flex-1`} /></>}
                <button className={button} disabled={db.busy || !field}>查询</button>{db.filter && <button type="button" className={button} disabled={db.busy} onClick={() => { setField(""); setValue(""); void db.query(0, db.limit, null); }}>清除</button>}
              </form>
              <DatabaseTable schema={db.schema} rows={db.rows} busy={db.busy} sort={db.sort} onSort={(sort) => void db.query(0, db.limit, db.filter, sort)} onOpen={(row) => void db.openRow(row)} />
              <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-3 text-xs text-text-subtle"><div className="flex items-center gap-2"><span>每页</span><select aria-label="每页记录数" className={input} value={db.limit} disabled={db.busy} onChange={(event) => void db.query(0, Number(event.target.value))}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select>{db.busy && <LoaderCircle size={14} className="animate-spin" />}</div><div className="flex items-center gap-3"><span>{db.rows.length ? `${db.offset + 1}–${db.offset + db.rows.length}` : "0"} 条</span><button aria-label="上一页" className={button} disabled={db.busy || db.offset === 0} onClick={() => void db.query(Math.max(0, db.offset - db.limit))}><ChevronLeft size={14} /></button><button aria-label="下一页" className={button} disabled={db.busy || !db.hasMore} onClick={() => void db.query(db.offset + db.limit)}><ChevronRight size={14} /></button></div></footer>
            </>}
          </>}
        </section>
      </div>
      {db.editor && <RecordEditor key={`${db.database.id}:${db.schema.name}:${JSON.stringify(db.editor.row?.identity)}`} schema={db.schema} editor={db.editor} editable={Boolean(db.status?.editing)} busy={db.busy} error={db.error} onDirtyChange={setDirty} onSave={(values) => void db.save(values)} onClose={closeEditor} onDelete={() => setConfirmation({ title: "删除这条记录？", description: `数据库：${db.database.name}\n表：${db.schema.name}\n行标识：${JSON.stringify(db.editor.row.identity)}\n外键级联和触发器可能影响关联记录。`, action: () => void db.remove() })} />}
    </>}
    {(confirmation || blocker.state === "blocked") && <ConfirmDialog
      title={confirmation?.title ?? "请先结束当前操作"}
      description={confirmation?.description ?? "请关闭记录编辑器并结束编辑会话，恢复应用后再离开开发者页面。"}
      cancelLabel={confirmation ? "取消" : "留在此页"}
      onClose={() => { setConfirmation(null); if (blocker.state === "blocked") blocker.reset(); }}
      onConfirm={confirmation ? () => { const action = confirmation.action; setConfirmation(null); action(); } : undefined} />}

  </main>;
}
