import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Database, LoaderCircle, Search, Table2 } from "lucide-react";
import type { DatabaseInfo } from "../../../shared/developerDatabase.ts";
import type { TableLoad } from "./useDatabaseCatalog.ts";

export default function DatabaseSidebar({ databases, tableLists, selected, disabled, discovering, onSelect, onRetry, onRefresh }: {
  databases: DatabaseInfo[]; tableLists: Record<string, TableLoad>;
  selected: { databaseId: string; tableName: string } | null; disabled: boolean; discovering: boolean;
  onSelect: (database: DatabaseInfo, table: string) => void; onRetry: (id: string) => void; onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [width, setWidth] = useState(300);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCollapsed((previous) => new Set([...previous].filter((id) => databases.some((database) => database.id === id))));
  }, [databases]);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const maxWidth = Math.min(420, viewport - 320);
  const actualWidth = viewport < 600 ? 180 : viewport < 740 ? 240 : Math.max(240, Math.min(width, maxWidth));
  const query = search.trim().toLowerCase();
  const visible = databases.flatMap((database) => {
    const load = tableLists[database.id];
    const matchesDatabase = database.name.toLowerCase().includes(query);
    const tables = load?.state === "ready" ? load.tables.filter((table) => matchesDatabase || table.name.toLowerCase().includes(query)) : [];
    return query && !matchesDatabase && !tables.length && load?.state === "ready" ? [] : [{ database, load, tables }];
  });
  const keys = visible.flatMap(({ database, tables }) => [database.id, ...(!collapsed.has(database.id) || query ? tables.map((table) => JSON.stringify([database.id, table.name])) : [])]);
  const activeFocus = focusKey && keys.includes(focusKey) ? focusKey : keys[0];
  const loading = Object.values(tableLists).some((load) => load.state === "loading");
  const failures = Object.values(tableLists).filter((load) => load.state === "error").length;
  function toggle(id: string, close: boolean) {
    setCollapsed((previous) => { const next = new Set(previous); if (close) next.add(id); else next.delete(id); return next; });
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, databaseId: string, table?: string) {
    const nodes = [...treeRef.current.querySelectorAll<HTMLButtonElement>('[role="treeitem"]')];
    const index = nodes.indexOf(event.currentTarget);
    let target: HTMLButtonElement;
    if (event.key === "ArrowDown") target = nodes[index + 1];
    else if (event.key === "ArrowUp") target = nodes[index - 1];
    else if (event.key === "Home") target = nodes[0];
    else if (event.key === "End") target = nodes[nodes.length - 1];
    else if (event.key === "ArrowLeft") {
      if (table !== undefined) target = nodes.find((node) => node.dataset.key === databaseId);
      else toggle(databaseId, true);
    } else if (event.key === "ArrowRight" && table === undefined) {
      if (!collapsed.has(databaseId) || query) target = nodes[index + 1]?.dataset.parent === databaseId ? nodes[index + 1] : undefined;
      else toggle(databaseId, false);
    } else return;
    event.preventDefault(); target?.focus();
  }
  return <aside aria-label="数据库与表" style={{ width: actualWidth }} className="relative flex min-h-0 shrink-0 flex-col border-r border-border bg-surface-subtle/70">
    <div className="shrink-0 space-y-3 border-b border-border p-4">
      <div className="flex items-center justify-between"><h2 className="text-xs font-semibold">数据库与表</h2><span className="text-[10px] text-text-subtle">{databases.length} 库</span></div>
      <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-text-subtle" /><input aria-label="搜索数据库或表名" placeholder="搜索数据库或表名…" className="w-full min-w-0 rounded-lg border border-border bg-card py-2 pr-2 pl-8 text-xs outline-none focus:border-border-strong" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <div role="tree" aria-label="数据库树" ref={treeRef}>
        {visible.map(({ database, load, tables }) => {
          const expanded = Boolean(query) || !collapsed.has(database.id);
          const current = selected?.databaseId === database.id;
          const sameName = databases.some((item) => item.id !== database.id && item.name === database.name);
          return <div key={database.id} className="mb-3">
            <button role="treeitem" aria-level={1} aria-expanded={expanded} aria-label={database.name} data-key={database.id} tabIndex={activeFocus === database.id ? 0 : -1} onFocus={() => setFocusKey(database.id)} onKeyDown={(event) => keyboard(event, database.id)} onClick={() => toggle(database.id, expanded)} title={`${database.name}\n${database.path}`} className="group flex min-h-10 w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-border-strong">
              {expanded ? <ChevronDown size={13} className="mt-0.5 shrink-0 text-text-subtle" /> : <ChevronRight size={13} className="mt-0.5 shrink-0 text-text-subtle" />}
              <Database size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className={`line-clamp-2 break-all group-focus-visible:line-clamp-none ${current ? "font-semibold text-foreground" : "font-medium text-text-secondary"}`}>{database.name}</span><span className={`mt-1 break-all text-[10px] text-text-subtle ${sameName ? "block" : "hidden group-focus-visible:block"}`}>{database.path}</span></span>
              {current ? <span className="shrink-0 text-[10px] text-muted-foreground">当前</span> : load?.state === "ready" && <span className="shrink-0 text-[10px] text-text-subtle">{load.tables.length}</span>}
            </button>
            {expanded && <>
              {load?.state === "loading" && <p role="status" className="flex items-center gap-2 py-2 pl-9 text-[11px] text-text-subtle"><LoaderCircle size={12} className="animate-spin" />正在读取数据表…</p>}
              {load?.state === "error" && <div className="ml-8 rounded-lg bg-danger-surface p-2 text-[11px] text-danger-text"><p className="break-all">{load.error}</p><button disabled={disabled || loading} onClick={() => onRetry(database.id)} className="mt-2 underline disabled:opacity-40">重试</button></div>}
              {load?.state === "ready" && !tables.length && <p className="py-2 pl-9 text-[11px] text-text-subtle">暂无数据表</p>}
              {tables.map((table) => {
                const key = JSON.stringify([database.id, table.name]);
                const chosen = current && selected.tableName === table.name;
                return <button key={key} role="treeitem" aria-level={2} aria-selected={chosen} aria-label={table.name} data-key={key} data-parent={database.id} aria-disabled={disabled} tabIndex={activeFocus === key ? 0 : -1} onFocus={() => setFocusKey(key)} onKeyDown={(event) => keyboard(event, database.id, table.name)} onClick={() => { if (!disabled) onSelect(database, table.name); }} title={`${table.name} · ${table.type}\n${database.name}\n${database.path}`} className={`group my-0.5 flex min-h-8 w-full items-center gap-2 rounded-lg border-l-2 py-1.5 pr-2 pl-9 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${chosen ? "border-ring bg-border/60 font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted"} ${disabled ? "opacity-50" : ""}`}><Table2 size={13} className="shrink-0" /><span className="truncate font-mono group-focus-visible:whitespace-normal group-focus-visible:break-all">{table.name}</span></button>;
              })}
            </>}
          </div>;
        })}
      </div>
      {discovering && <p role="status" className="p-4 text-xs text-text-subtle">正在发现数据库…</p>}
      {!discovering && !visible.length && <div className="p-4 text-xs text-text-subtle"><p>{query ? "没有匹配的数据库或表" : "没有发现本地数据库"}</p><button className="mt-3 underline" disabled={disabled} onClick={() => query ? setSearch("") : onRefresh()}>{query ? "清除搜索" : "刷新"}</button></div>}
    </div>
    <footer className="shrink-0 border-t border-border px-4 py-3 text-[10px] text-text-subtle">{databases.length} 个数据库{loading ? " · 仍在加载部分数据库" : " · 表加载完成"}{failures > 0 && <span className="mt-1 block text-danger-text">{failures} 个库读取失败，结果不完整</span>}</footer>
    {viewport >= 740 && <div role="separator" tabIndex={0} aria-label="调整数据库侧栏宽度" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={maxWidth} aria-valuenow={actualWidth} className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none hover:bg-border-strong/50 focus-visible:bg-border-strong" onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); setWidth(Math.max(240, Math.min(maxWidth, actualWidth + (event.key === "ArrowRight" ? 20 : -20)))); } }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(Math.max(240, Math.min(maxWidth, event.clientX))); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} />}
  </aside>;
}
