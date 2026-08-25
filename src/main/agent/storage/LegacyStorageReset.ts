import path from "node:path";
import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const STORAGE_ARCHITECTURE_VERSION = 2;
const MARKER_FILE = "storage-architecture.json";

type StorageArchitectureMarker = {
  readonly version: number;
};

function removeExactFiles(parentPath: string, names: readonly string[]): void {
  const resolvedParent = path.resolve(parentPath);
  for (const name of names) {
    const target = path.resolve(resolvedParent, name);
    if (path.dirname(target) !== resolvedParent) {
      throw new Error(`Legacy storage path escapes its parent: ${target}`);
    }
    rmSync(target, { force: true });
  }
}

function removeExactDirectories(
  parentPath: string,
  names: readonly string[],
): void {
  const resolvedParent = path.resolve(parentPath);
  for (const name of names) {
    const target = path.resolve(resolvedParent, name);
    if (path.dirname(target) !== resolvedParent) {
      throw new Error(`Managed directory escapes its parent: ${target}`);
    }
    rmSync(target, { recursive: true, force: true });
  }
}

function clearProjectManagedData(stateRoot: string): void {
  const resolvedStateRoot = path.resolve(stateRoot);
  if (path.basename(resolvedStateRoot) !== ".storyos") {
    throw new Error(`Invalid StoryOS state root: ${resolvedStateRoot}`);
  }
  removeExactFiles(resolvedStateRoot, [
    "storyos.sqlite",
    "storyos.sqlite-wal",
    "storyos.sqlite-shm",
    "project.sqlite",
    "project.sqlite-wal",
    "project.sqlite-shm",
  ]);
  removeExactDirectories(resolvedStateRoot, [
    "checkpoints",
    "text-index",
    "tmp",
  ]);
}

function clearWorkspaceManagedData(workspaceRoot: string): void {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  if (!existsSync(resolvedWorkspaceRoot)) return;
  const pending = [resolvedWorkspaceRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const child = path.join(directory, entry.name);
      if (entry.name === ".storyos") {
        clearProjectManagedData(child);
      } else {
        pending.push(child);
      }
    }
  }
}

function resolveWorkspaceRoots(agentHome: string): readonly string[] {
  const roots = new Set<string>([
    path.resolve(agentHome, "workSpaceRoot"),
  ]);
  const configPath = path.join(agentHome, "config.json");
  if (!existsSync(configPath)) return [...roots];
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      readonly AGENT_WORKSPACE?: unknown;
    };
    if (typeof config.AGENT_WORKSPACE === "string") {
      const configured = config.AGENT_WORKSPACE.trim();
      if (configured) {
        roots.add(path.isAbsolute(configured)
          ? path.resolve(configured)
          : path.resolve(homedir(), configured));
      }
    }
  } catch {
    // Configuration validation remains owned by Configuration.
  }
  return [...roots];
}

function hasCurrentMarker(markerPath: string): boolean {
  if (!existsSync(markerPath)) return false;
  try {
    const marker = JSON.parse(
      readFileSync(markerPath, "utf8"),
    ) as Partial<StorageArchitectureMarker>;
    return marker.version === STORAGE_ARCHITECTURE_VERSION;
  } catch {
    return false;
  }
}

export type LegacyGlobalStorageReset = {
  readonly required: boolean;
  readonly complete: () => void;
};

export function prepareLegacyGlobalStorageReset(
  agentHome: string,
): LegacyGlobalStorageReset {
  const resolvedHome = path.resolve(agentHome);
  mkdirSync(resolvedHome, { recursive: true });
  const markerPath = path.join(resolvedHome, MARKER_FILE);
  if (hasCurrentMarker(markerPath)) {
    return Object.freeze({
      required: false,
      complete: (): void => undefined,
    });
  }

  removeExactFiles(resolvedHome, [
    "app.sqlite",
    "app.sqlite-wal",
    "app.sqlite-shm",
  ]);
  removeExactDirectories(resolvedHome, ["library", "logs"]);
  for (const workspaceRoot of resolveWorkspaceRoots(resolvedHome)) {
    clearWorkspaceManagedData(workspaceRoot);
  }
  return Object.freeze({
    required: true,
    complete: (): void => {
      writeFileSync(
        markerPath,
        JSON.stringify({ version: STORAGE_ARCHITECTURE_VERSION }, null, 2),
        "utf8",
      );
    },
  });
}

export function resetLegacyProjectStorage(projectRoot: string): void {
  const stateRoot = path.resolve(projectRoot, ".storyos");
  const hadLegacyDatabase = [
    "storyos.sqlite",
    "storyos.sqlite-wal",
    "storyos.sqlite-shm",
  ].some((name) => existsSync(path.join(stateRoot, name)));
  removeExactFiles(stateRoot, [
    "storyos.sqlite",
    "storyos.sqlite-wal",
    "storyos.sqlite-shm",
  ]);
  if (!hadLegacyDatabase) return;
  removeExactFiles(path.join(stateRoot, "checkpoints"), [
    "memory.sqlite",
    "memory.sqlite-wal",
    "memory.sqlite-shm",
  ]);
}
