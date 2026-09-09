import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import DeveloperDatabaseService from "../../src/main/developer/DeveloperDatabaseService.ts";

let root: string;
let database: Database.Database;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "storyos-developer-"));
  vi.stubEnv("MINI_AGENT_HOME", root);
  vi.stubEnv("AGENT_WORKSPACE", "");
  database = new Database(path.join(root, "app.sqlite"));
  database.pragma("journal_mode = WAL");
  database.exec(
    "CREATE TABLE projects(path TEXT, name TEXT); CREATE TABLE books(storage_path TEXT,id TEXT); CREATE TABLE future(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO future VALUES(1,'before')",
  );
});
afterEach(() => {
  database.close();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe("developer database sessions", () => {
  it("browses without changing data, creates consistent WAL backups and gates writes", async () => {
    const pause = vi.fn(async () => undefined);
    const resume = vi.fn(async () => undefined);
    const service = new DeveloperDatabaseService(root, { pause, resume });
    const [item] = service.listDatabases();
    const schema = service.describeTable(item.id, "future");
    const request = {
      databaseId: item.id,
      table: "future",
      version: schema.version,
      values: { value: { type: "text", value: "after" } as const },
      operation: "insert" as const,
    };
    expect(() => service.mutate(request)).toThrow("编辑会话");
    expect(service.queryRows({ ...request, offset: 0, limit: 20 }).rows).toHaveLength(1);
    const status = await service.beginEditSession();
    expect(status.editing).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(status.backups).toHaveLength(1);
    const backup = new Database(status.backups[0], { readonly: true });
    try {
      expect(backup.prepare("SELECT value FROM future").pluck().get()).toBe("before");
    } finally {
      backup.close();
    }
    service.mutate(request);
    expect(service.queryRows({ ...request, offset: 0, limit: 20 }).rows).toHaveLength(2);
    await service.endEditSession();
    expect(resume).toHaveBeenCalledOnce();
    expect(service.status().paused).toBe(false);
    expect(() => service.mutate(request)).toThrow("编辑会话");
  });
  it("does not pause or write while the host has unfinished work", async () => {
    const service = new DeveloperDatabaseService(root, {
      pause: async () => {
        throw new Error("busy");
      },
      resume: async () => undefined,
    });
    service.listDatabases();
    await expect(service.beginEditSession()).rejects.toThrow("busy");
    expect(service.status().editing).toBe(false);
    expect(service.status().paused).toBe(false);
    expect(existsSync(path.join(root, "developer-backups"))).toBe(false);
  });
  it("retains a repair entry and can reopen editing after a resume error", async () => {
    const resume = vi
      .fn()
      .mockRejectedValueOnce(new Error("invalid business state"))
      .mockResolvedValue(undefined);
    const service = new DeveloperDatabaseService(root, { pause: async () => undefined, resume });
    await service.beginEditSession();
    await expect(service.endEditSession()).rejects.toThrow("invalid business state");
    expect(service.status().paused).toBe(true);
    expect(service.status().editing).toBe(false);
    expect(service.listDatabases()).toHaveLength(1);
    await service.beginEditSession();
    expect(service.status().editing).toBe(true);
    await service.endEditSession();
    expect(service.status().paused).toBe(false);
  });
  it("requires backup of databases discovered after the editing session began", async () => {
    const service = new DeveloperDatabaseService(root, {
      pause: async () => undefined,
      resume: async () => undefined,
    });
    await service.beginEditSession();
    const bookRoot = path.join(root, "library", "books", "new-book");
    mkdirSync(bookRoot, { recursive: true });
    const book = new Database(path.join(bookRoot, "book.sqlite"));
    book.exec("CREATE TABLE new_table(value TEXT)");
    book.close();
    const item = service.listDatabases().find((item) => item.path.endsWith("book.sqlite"));
    const schema = service.describeTable(item.id, "new_table");
    const request = {
      databaseId: item.id,
      table: schema.name,
      version: schema.version,
      operation: "insert" as const,
      values: { value: { type: "text", value: "new" } as const },
    };
    expect(() => service.mutate(request)).toThrow("备份");
    await service.endEditSession();
    await service.beginEditSession();
    service.mutate(request);
    expect(service.queryRows({ ...request, limit: 20, offset: 0 }).rows).toHaveLength(1);
  });
  it("reports registry schema errors while retaining the database repair entry", () => {
    const service = new DeveloperDatabaseService(root, {
      pause: async () => undefined,
      resume: async () => undefined,
    });
    database.exec("ALTER TABLE projects RENAME COLUMN path TO changed_path");
    expect(service.listDatabases()).toHaveLength(1);
    expect(service.status().warnings[0]).toContain("数据库发现失败");
  });
  it("never creates a missing database when browsing", () => {
    const service = new DeveloperDatabaseService(root, {
      pause: async () => undefined,
      resume: async () => undefined,
    });
    const [item] = service.listDatabases();
    expect(() => service.listTables("not-registered")).toThrow("未被发现");
    expect(service.listTables(item.id).map((item) => item.name)).toContain("future");
    const missingRoot = path.join(root, "missing");
    expect(
      new DeveloperDatabaseService(missingRoot, {
        pause: async () => undefined,
        resume: async () => undefined,
      }).listDatabases(),
    ).toEqual([]);
    expect(existsSync(missingRoot)).toBe(false);
  });
});
