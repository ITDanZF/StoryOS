import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import Database from "better-sqlite3";
import type ProjectApplication from "../application/ProjectApplication.ts";
import SqliteStore from "../Memory/SqliteStore.ts";
import { getAgentHome } from "../workspace/path.ts";
import { getWorkspaceLayout } from "../workspace/ProjectLayout.ts";

type LegacyThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  metadata?: { projectPath?: string; activeSkillIds?: readonly string[]; disabledSkillIds?: readonly string[] };
};

type LegacyIndex = { threads: LegacyThread[] };

type TargetConversation = { root: string; checkpointPath: string; threads: LegacyThread[] };

function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export default class LegacyWorkspaceMigrator {
  constructor(
    private readonly projects: ProjectApplication,
    private readonly agentHome = getAgentHome(),
  ) {}

  migrate(): void {
    const markerPath = path.join(this.agentHome, "migrations", "workspace-v2.json");
    if (existsSync(markerPath)) return;
    const legacySessions = path.join(this.agentHome, "sessions");
    const legacyIndexPath = path.join(legacySessions, "index.json");
    mkdirSync(path.dirname(markerPath), { recursive: true });
    if (!existsSync(legacyIndexPath)) {
      this.writeMarker(markerPath, 0);
      return;
    }

    const legacyIndex = JSON.parse(readFileSync(legacyIndexPath, "utf-8")) as LegacyIndex;
    const snapshot = this.projects.getSnapshot();
    const targets = new Map<string, TargetConversation>();
    const targetFor = (thread: LegacyThread): TargetConversation => {
      const requestedPath = thread.metadata?.projectPath?.trim();
      const project = requestedPath
        ? snapshot.projects.find((item) => samePath(item.path, requestedPath))
        : null;
      const layout = project
        ? getWorkspaceLayout(project.path)
        : getWorkspaceLayout(snapshot.systemWorkspace.path, true);
      let target = targets.get(layout.conversationsRoot);
      if (!target) {
        target = { root: layout.conversationsRoot, checkpointPath: layout.checkpointPath, threads: [] };
        targets.set(layout.conversationsRoot, target);
      }
      return target;
    };

    for (const thread of legacyIndex.threads ?? []) targetFor(thread).threads.push(thread);
    for (const target of targets.values()) this.migrateConversations(legacySessions, target);

    const legacyCheckpointPath = path.join(legacySessions, "memory.sqlite");
    if (existsSync(legacyCheckpointPath)) {
      for (const target of targets.values()) {
        this.migrateCheckpoints(legacyCheckpointPath, target.checkpointPath, target.threads.map((thread) => thread.id));
      }
    }
    this.writeMarker(markerPath, legacyIndex.threads?.length ?? 0);
  }

  private migrateConversations(legacySessions: string, target: TargetConversation): void {
    mkdirSync(target.root, { recursive: true });
    const targetIndexPath = path.join(target.root, "index.json");
    const existing = existsSync(targetIndexPath)
      ? JSON.parse(readFileSync(targetIndexPath, "utf-8")) as LegacyIndex
      : { threads: [] };
    const byId = new Map(existing.threads.map((thread) => [thread.id, thread]));
    for (const thread of target.threads) {
      byId.set(thread.id, {
        ...thread,
        metadata: {
          activeSkillIds: thread.metadata?.activeSkillIds ?? [],
          disabledSkillIds: thread.metadata?.disabledSkillIds ?? [],
        },
      });
      const fileName = `${encodeURIComponent(thread.id)}.json`;
      const source = path.join(legacySessions, fileName);
      const destination = path.join(target.root, fileName);
      if (existsSync(source) && !existsSync(destination)) copyFileSync(source, destination);
    }
    writeFileSync(targetIndexPath, JSON.stringify({ threads: [...byId.values()] }, null, 2), "utf-8");
  }

  private migrateCheckpoints(sourcePath: string, targetPath: string, threadIds: readonly string[]): void {
    if (threadIds.length === 0) return;
    new SqliteStore(targetPath).close();
    const source = new Database(sourcePath, { readonly: true });
    const target = new Database(targetPath);
    try {
      for (const table of ["checkpoints", "writes"]) {
        const exists = source.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { count: number };
        if (!exists.count) continue;
        const columns = (source.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);
        const targetColumns = new Set((target.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
        const shared = columns.filter((column) => targetColumns.has(column));
        if (!shared.includes("thread_id") || shared.length === 0) continue;
        const quoted = shared.map((column) => `"${column}"`).join(", ");
        const placeholders = shared.map(() => "?").join(", ");
        const insert = target.prepare(`INSERT OR REPLACE INTO ${table} (${quoted}) VALUES (${placeholders})`);
        const select = source.prepare(`SELECT ${quoted} FROM ${table} WHERE thread_id = ? OR thread_id LIKE ?`);
        const transaction = target.transaction(() => {
          for (const threadId of threadIds) {
            for (const row of select.all(threadId, `${threadId}/%`) as Array<Record<string, unknown>>) {
              insert.run(...shared.map((column) => row[column]));
            }
          }
        });
        transaction();
      }
    } finally {
      source.close();
      target.close();
    }
  }

  private writeMarker(markerPath: string, migratedThreadCount: number): void {
    writeFileSync(markerPath, JSON.stringify({ version: 2, migratedAt: new Date().toISOString(), migratedThreadCount, legacyDataRetained: true }, null, 2), "utf-8");
  }
}