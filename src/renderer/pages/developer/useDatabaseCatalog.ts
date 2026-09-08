import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseInfo, DeveloperDatabaseApi, TableInfo } from "../../../shared/developerDatabase.ts";

export type TableLoad = { state: "loading" } | { state: "ready"; tables: TableInfo[] } | { state: "error"; error: string };
export function useDatabaseCatalog(api: DeveloperDatabaseApi | undefined) {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [tableLists, setTableLists] = useState<Record<string, TableLoad>>({});
  const [catalogError, setError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(true);
  const generation = useRef(0);
  const refreshCatalog = useCallback(async () => {
    const version = ++generation.current;
    setError(null); setDiscovering(true);
    let items: DatabaseInfo[];
    try { items = await api.listDatabases(); }
    finally { if (generation.current === version) setDiscovering(false); }
    const results: Record<string, TableLoad> = Object.fromEntries(items.map((item) => [item.id, { state: "loading" }]));
    if (generation.current !== version) return { items, results };
    setDatabases(items); setTableLists({ ...results });
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length && generation.current === version) {
        const item = items[cursor++];
        try { results[item.id] = { state: "ready", tables: await api.listTables(item.id) }; }
        catch (error) { results[item.id] = { state: "error", error: String(error) }; }
        if (generation.current === version) setTableLists({ ...results });
      }
    }));
    return { items, results };
  }, [api]);
  useEffect(() => {
    if (!api) return;
    let disposed = false;
    void refreshCatalog().catch((error) => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; generation.current++; };
  }, [api, refreshCatalog]);
  async function retryDatabase(id: string) {
    const version = generation.current;
    setTableLists((current) => ({ ...current, [id]: { state: "loading" } }));
    let result: TableLoad;
    try { result = { state: "ready", tables: await api.listTables(id) }; }
    catch (error) { result = { state: "error", error: String(error) }; }
    if (version === generation.current) setTableLists((current) => ({ ...current, [id]: result }));
  }
  return { databases, tableLists, catalogError, discovering, refreshCatalog, retryDatabase };
}
