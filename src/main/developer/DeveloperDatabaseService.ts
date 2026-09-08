import Database from "better-sqlite3";
import path from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseInfo, DeveloperStatus, MutationRequest, QueryRequest, RowRequest } from "../../shared/developerDatabase.ts";
import { getSystemWorkspaceRoot, getWorkspaceLayout } from "../agent/workspace/ProjectLayout.ts";
import { listTables, describeTable } from "./schema.ts";
import { mutate, queryRows, readRow } from "./crud.ts";

export type MaintenanceHost = { pause(): Promise<void>; resume(): Promise<void> };

export default class DeveloperDatabaseService {
  private readonly databases = new Map<string, DatabaseInfo>();
  private editing = false;
  private transitioning = false;
  private paused = false;
  private backups: string[] = [];
  private warnings: string[] = [];
  private readonly backedUp = new Set<string>();

  constructor(private readonly agentHome: string, private readonly host: MaintenanceHost) {}

  status(): DeveloperStatus { return { editing: this.editing, backups: [...this.backups], warnings: [...this.warnings], paused: this.paused }; }

  listDatabases(): DatabaseInfo[] {
    if (this.transitioning) throw new Error("正在切换编辑会话，请稍后重试。");
    this.warnings = [];
    const found = new Map<string, DatabaseInfo>();
    const add = (file: string, name: string) => {
      if (!existsSync(file)) return;
      const resolved = path.resolve(file);
      const id = createHash("sha256").update(process.platform === "win32" ? resolved.toLowerCase() : resolved).digest("hex");
      found.set(id, { id, name, path: resolved });
    };
    const workspace = (root: string, name: string) => {
      const layout = getWorkspaceLayout(root);
      add(layout.projectDatabasePath, name);
      add(layout.checkpointPath, `${name} · 检查点`);
    };
    const appFile = path.join(this.agentHome, "app.sqlite");
    add(appFile, "全局注册库");
    workspace(getSystemWorkspaceRoot(), "全局对话");
    if (existsSync(appFile)) {
      const db = this.open(appFile, true);
      try {
        for (const [sql, visit] of [
          ["SELECT path, name FROM projects", (row: Record<string, string>) => workspace(row.path, `项目 · ${row.name}`)],
          ["SELECT storage_path, id FROM books", (row: Record<string, string>) => add(path.join(row.storage_path, "book.sqlite"), `书籍 · ${row.id}`)],
        ] as const) {
          try { for (const row of db.prepare(sql).all() as Record<string, string>[]) visit(row); }
          catch (error) { this.warnings.push(`数据库发现失败 (${sql})：${String(error)}`); }
        }
      } finally { db.close(); }
    }
    // The library can still be inspected when manual edits invalidate its registry.
    const library = path.join(this.agentHome, "library", "books");
    if (existsSync(library)) for (const entry of readdirSync(library, { withFileTypes: true })) {
      if (entry.isDirectory()) add(path.join(library, entry.name, "book.sqlite"), `书籍 · ${entry.name}`);
    }
    for (const [id, item] of found) this.databases.set(id, item);
    return [...this.databases.values()].filter((item) => existsSync(item.path));
  }

  listTables(id: string) { return this.withDatabase(id, (db) => listTables(db)); }
  describeTable(id: string, table: string) { return this.withDatabase(id, (db) => describeTable(db, table)); }
  queryRows(request: QueryRequest) { return this.withDatabase(request.databaseId, (db) => queryRows(db, request)); }
  readRow(request: RowRequest) { return this.withDatabase(request.databaseId, (db) => readRow(db, request)); }
  mutate(request: MutationRequest): void {
    if (!this.editing || !this.backedUp.has(request.databaseId)) throw new Error("请先开启编辑会话。新增数据库需退出后重新开启，以完成备份。");
    this.withDatabase(request.databaseId, (db) => mutate(db, request), true);
  }

  async beginEditSession(): Promise<DeveloperStatus> {
    if (this.transitioning || this.editing) throw new Error("编辑会话已开启或正在切换。");
    const databases = this.listDatabases();
    this.transitioning = true;
    try {
      if (!this.paused) { await this.host.pause(); this.paused = true; }
      this.backups = [];
      this.backedUp.clear();
      const root = path.join(this.agentHome, "developer-backups", `${Date.now()}-${randomUUID()}`);
      mkdirSync(root, { recursive: true });
      for (const item of databases) {
        const target = path.join(root, `${item.id}.sqlite`);
        const db = this.open(item.path, true);
        try { await db.backup(target); } finally { db.close(); }
        this.backups.push(target);
        this.backedUp.add(item.id);
      }
      this.editing = true;
      return this.status();
    } finally { this.transitioning = false; }
  }

  async endEditSession(): Promise<void> {
    if (this.transitioning) throw new Error("编辑会话正在切换。");
    if (!this.paused) return;
    this.transitioning = true;
    this.editing = false;
    try {
      await this.host.resume();
      this.paused = false;
      this.backedUp.clear();
    } finally { this.transitioning = false; }
  }

  private open(file: string, readonly: boolean): Database.Database {
    const db = new Database(file, { readonly, fileMustExist: true, timeout: 5000 });
    try {
      db.pragma("foreign_keys = ON");
      if (readonly) db.pragma("query_only = ON");
      return db;
    } catch (error) { db.close(); throw error; }
  }
  private withDatabase<T>(id: string, run: (db: Database.Database) => T, write = false): T {
    if (this.transitioning) throw new Error("正在切换编辑会话。");
    const item = this.databases.get(id);
    if (!item) throw new Error("数据库未被发现，请刷新数据库列表。");
    const db = this.open(item.path, !write);
    try { return run(db); } finally { db.close(); }
  }
}
