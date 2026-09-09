import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareLegacyGlobalStorageReset,
  resetLegacyProjectStorage,
} from "../../src/main/story/storage/LegacyStorageReset.ts";

const roots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "storyos-storage-reset-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("legacy storage reset", () => {
  it("removes the legacy application database only once", () => {
    const agentHome = createRoot();
    const databasePath = path.join(agentHome, "app.sqlite");
    const configPath = path.join(agentHome, "config.json");
    const libraryPath = path.join(agentHome, "library");
    const logsPath = path.join(agentHome, "logs");
    const projectRoot = path.join(agentHome, "workSpaceRoot", "Novel");
    const stateRoot = path.join(projectRoot, ".storyos");
    const projectDatabase = path.join(stateRoot, "project.sqlite");
    const projectFile = path.join(projectRoot, "chapter.md");
    mkdirSync(libraryPath, { recursive: true });
    mkdirSync(logsPath);
    mkdirSync(path.join(stateRoot, "checkpoints"), { recursive: true });
    writeFileSync(databasePath, "legacy", "utf8");
    writeFileSync(`${databasePath}-wal`, "legacy", "utf8");
    writeFileSync(
      configPath,
      JSON.stringify({
        MODEL_PROVIDER: "deepseek",
        MODEL_API_KEY: "preserved-test-key",
      }),
      "utf8",
    );
    writeFileSync(path.join(libraryPath, "cached-book"), "legacy", "utf8");
    writeFileSync(path.join(logsPath, "app.log"), "legacy", "utf8");
    writeFileSync(projectDatabase, "legacy", "utf8");
    writeFileSync(path.join(stateRoot, "checkpoints", "memory.sqlite"), "legacy", "utf8");
    writeFileSync(projectFile, "正文", "utf8");

    const reset = prepareLegacyGlobalStorageReset(agentHome);
    expect(reset.required).toBe(true);
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(libraryPath)).toBe(false);
    expect(existsSync(logsPath)).toBe(false);
    expect(existsSync(projectDatabase)).toBe(false);
    expect(existsSync(path.join(stateRoot, "checkpoints"))).toBe(false);
    expect(existsSync(projectFile)).toBe(true);
    reset.complete();

    writeFileSync(databasePath, "new architecture", "utf8");
    const repeated = prepareLegacyGlobalStorageReset(agentHome);
    expect(repeated.required).toBe(false);
    expect(existsSync(databasePath)).toBe(true);
  });

  it("removes only legacy project databases and preserves project files", () => {
    const projectRoot = createRoot();
    const stateRoot = path.join(projectRoot, ".storyos");
    mkdirSync(stateRoot);
    const checkpointRoot = path.join(stateRoot, "checkpoints");
    mkdirSync(checkpointRoot);
    const legacyDatabase = path.join(stateRoot, "storyos.sqlite");
    const legacyCheckpoint = path.join(checkpointRoot, "memory.sqlite");
    const projectFile = path.join(projectRoot, "chapter.md");
    writeFileSync(legacyDatabase, "legacy", "utf8");
    writeFileSync(`${legacyDatabase}-shm`, "legacy", "utf8");
    writeFileSync(legacyCheckpoint, "legacy", "utf8");
    writeFileSync(projectFile, "正文", "utf8");

    resetLegacyProjectStorage(projectRoot);

    expect(existsSync(legacyDatabase)).toBe(false);
    expect(existsSync(`${legacyDatabase}-shm`)).toBe(false);
    expect(existsSync(legacyCheckpoint)).toBe(false);
    expect(existsSync(projectFile)).toBe(true);

    writeFileSync(legacyCheckpoint, "new architecture", "utf8");
    resetLegacyProjectStorage(projectRoot);
    expect(existsSync(legacyCheckpoint)).toBe(true);
  });
});
