import { useEffect, useRef, useState } from "react";
import type { DatabaseInfo, DataRow, DeveloperStatus, QueryRequest, RowDetail, SqlValue, TableSchema } from "../../../shared/developerDatabase.ts";

import { useDatabaseCatalog } from "./useDatabaseCatalog.ts";

export type EditorState = { row: DataRow | null; detail: RowDetail | null };
export function useDeveloperDatabase() {
  const api = window.storyOSDeveloper;
  const catalog = useDatabaseCatalog(api);
  const [selected, setSelected] = useState<{ databaseId: string; tableName: string } | null>(null);
  const selectionVersion = useRef(0);
  const [selecting, setSelecting] = useState(false);
  const [database, setDatabase] = useState<DatabaseInfo | null>(null);
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [filter, setFilter] = useState<QueryRequest["filter"]>();
  const [sort, setSort] = useState<QueryRequest["sort"]>();
  const [status, setStatus] = useState<DeveloperStatus | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!api) return;
    let disposed = false;
    setBusy(true);
    void api.status().then((nextStatus) => {
      if (!disposed) setStatus(nextStatus);
    }).catch((error) => { if (!disposed) setError(String(error)); })
      .finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; selectionVersion.current++; };
  }, [api]);

  async function loadRows(nextSchema: TableSchema, nextOffset: number, nextLimit: number,
    nextFilter: QueryRequest["filter"], nextSort: QueryRequest["sort"], selectedDatabase = database, version = selectionVersion.current) {
    const result = await api.queryRows({ databaseId: selectedDatabase.id, table: nextSchema.name, version: nextSchema.version,
      offset: nextOffset, limit: nextLimit, filter: nextFilter, sort: nextSort });
    if (version !== selectionVersion.current) return;
    setRows(result.rows); setHasMore(result.hasMore); setOffset(nextOffset); setLimit(nextLimit);
    setFilter(nextFilter); setSort(nextSort);
  }
  async function selectTable(item: DatabaseInfo, name: string) {
    if (busy || editor || (selected?.databaseId === item.id && selected.tableName === name)) return;
    const version = ++selectionVersion.current;
    setSelected({ databaseId: item.id, tableName: name }); setDatabase(item);
    setSchema(null); setRows([]); setHasMore(false); setOffset(0); setFilter(undefined); setSort(undefined);
    setSelecting(true); setError(null); setNotice(null);
    try {
      const next = await api.describeTable(item.id, name);
      if (version !== selectionVersion.current) return;
      await loadRows(next, 0, limit, undefined, undefined, item, version);
      if (version === selectionVersion.current) setSchema(next);
    } catch (error) { if (version === selectionVersion.current) setError(String(error)); }
    finally { if (version === selectionVersion.current) setSelecting(false); }
  }
  return {
    api, ...catalog, database, selected, schema, rows, hasMore, offset, limit, filter, sort,
    status, editor, busy: busy || selecting, navigationDisabled: busy || Boolean(editor),
    error: error ?? catalog.catalogError, notice, run, setEditor, selectTable,
    refresh: () => run(async () => {
      selectionVersion.current++;
      setSchema(null); setRows([]); setHasMore(false);
      const { items, results } = await catalog.refreshCatalog();
      setStatus(await api.status());
      if (selected) {
        const item = items.find((item) => item.id === selected.databaseId);
        if (!item) {
          setSelected(null); setDatabase(null); throw new Error("当前数据库已不存在，请重新选择。");
        }
        const load = results[item.id];
        if (load.state === "error") throw new Error(load.error);
        if (load.state !== "ready") throw new Error("数据库表列表尚未加载完成。");
        if (!load.tables.some((table) => table.name === selected.tableName)) {
          setSelected(null); throw new Error("当前表已删除或重命名，请重新选择。");
        }
        const next = await api.describeTable(item.id, selected.tableName);
        await loadRows(next, 0, limit, undefined, undefined, item);
        setDatabase(item); setSchema(next);
      }
    }),
    query: (nextOffset: number, nextLimit = limit, nextFilter = filter, nextSort = sort) => run(async () => {
      await loadRows(schema, nextOffset, nextLimit, nextFilter === null ? undefined : nextFilter, nextSort);
    }),
    openRow: (row: DataRow) => run(async () => {
      const detail = await api.readRow({ databaseId: database.id, table: schema.name, version: schema.version, identity: row.identity });
      setEditor({ row, detail });
    }),
    save: (values: Record<string, SqlValue>) => run(async () => {
      await api.mutate({ databaseId: database.id, table: schema.name, version: schema.version,
        operation: editor.row ? "update" : "insert", values,
        ...(editor.row ? { identity: editor.row.identity, fingerprint: editor.detail.fingerprint } : {}) });
      setEditor(null);
      setNotice("记录已保存。");
      await loadRows(schema, offset, limit, filter, sort);
    }),
    remove: () => run(async () => {
      await api.mutate({ databaseId: database.id, table: schema.name, version: schema.version,
        operation: "delete", values: {}, identity: editor.row.identity, fingerprint: editor.detail.fingerprint });
      setEditor(null); setNotice("记录已删除，数据库触发器和外键规则已执行。");
      await loadRows(schema, 0, limit, filter, sort);
    }),
    begin: () => run(async () => {
      try { setStatus(await api.beginEditSession()); }
      finally { setStatus(await api.status()); }
    }),
    end: () => run(async () => {
      try { await api.endEditSession(); setEditor(null); }
      finally { setStatus(await api.status()); }
    }),
  };
}
