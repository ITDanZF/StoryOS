import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getCustomizeWorkSpace, getDefaultWorkSpace } from "./path.ts";

export const STORYOS_DIRECTORY = ".storyos";
export const SYSTEM_WORKSPACE_DIRECTORY = ".storyos-default";
export const SYSTEM_WORKSPACE_ID = "system-default";
export const PROJECT_SCHEMA_VERSION = 1;

export type ProjectLocationType = "created" | "linked";

export type ProjectMetadata = {
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly name: string;
  readonly locationType: ProjectLocationType | "system-default";
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type WorkspaceLayout = {
  readonly rootPath: string;
  readonly filesRoot: string;
  readonly stateRoot: string;
  readonly databasePath: string;
  readonly checkpointPath: string;
  readonly skillsRoot: string;
  readonly temporaryRoot: string;
  readonly metadataPath: string;
};

export function getDefaultProjectsRoot(): string {
  return path.resolve(getCustomizeWorkSpace() || getDefaultWorkSpace());
}

export function getSystemWorkspaceRoot(): string {
  return path.join(getDefaultProjectsRoot(), SYSTEM_WORKSPACE_DIRECTORY);
}

export function getWorkspaceLayout(rootPath: string, systemDefault = false): WorkspaceLayout {
  const resolvedRoot = path.resolve(rootPath);
  const stateRoot = path.join(resolvedRoot, STORYOS_DIRECTORY);
  return Object.freeze({
    rootPath: resolvedRoot,
    filesRoot: systemDefault ? path.join(resolvedRoot, "files") : resolvedRoot,
    stateRoot,
    databasePath: path.join(stateRoot, "storyos.sqlite"),
    checkpointPath: path.join(stateRoot, "checkpoints", "memory.sqlite"),
    skillsRoot: path.join(stateRoot, "skills"),
    temporaryRoot: path.join(stateRoot, "tmp"),
    metadataPath: path.join(stateRoot, "project.json"),
  });
}

function writeMetadata(layout: WorkspaceLayout, metadata: ProjectMetadata): void {
  writeFileSync(layout.metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

export function readProjectMetadata(rootPath: string): ProjectMetadata | null {
  const metadataPath = getWorkspaceLayout(rootPath).metadataPath;
  if (!existsSync(metadataPath)) return null;
  const value = JSON.parse(readFileSync(metadataPath, "utf-8")) as Partial<ProjectMetadata>;
  if (
    value.schemaVersion !== PROJECT_SCHEMA_VERSION ||
    typeof value.projectId !== "string" || !value.projectId.trim() ||
    typeof value.name !== "string" || !value.name.trim() ||
    !["created", "linked", "system-default"].includes(value.locationType ?? "") ||
    typeof value.createdAt !== "string" || typeof value.updatedAt !== "string"
  ) {
    throw new Error(`Invalid StoryOS project metadata: ${metadataPath}`);
  }
  return Object.freeze(value as ProjectMetadata);
}

export function ensureWorkspaceLayout(input: {
  readonly rootPath: string;
  readonly projectId: string;
  readonly name: string;
  readonly locationType: ProjectLocationType | "system-default";
}): { readonly layout: WorkspaceLayout; readonly metadata: ProjectMetadata } {
  const layout = getWorkspaceLayout(input.rootPath, input.locationType === "system-default");
  mkdirSync(layout.rootPath, { recursive: true });
  mkdirSync(layout.filesRoot, { recursive: true });
  mkdirSync(path.dirname(layout.checkpointPath), { recursive: true });
  mkdirSync(layout.skillsRoot, { recursive: true });
  mkdirSync(layout.temporaryRoot, { recursive: true });

  const existing = readProjectMetadata(layout.rootPath);
  const now = new Date().toISOString();
  if (existing) {
    if (existing.projectId !== input.projectId) throw new Error(`Project id conflict in ${layout.metadataPath}`);
    const metadata: ProjectMetadata = Object.freeze({ ...existing, name: input.name, locationType: input.locationType, updatedAt: now });
    writeMetadata(layout, metadata);
    return Object.freeze({ layout, metadata });
  }

  const metadata: ProjectMetadata = Object.freeze({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: input.projectId,
    name: input.name,
    locationType: input.locationType,
    createdAt: now,
    updatedAt: now,
  });
  writeMetadata(layout, metadata);
  return Object.freeze({ layout, metadata });
}

export function ensureSystemWorkspace(): WorkspaceLayout {
  return ensureWorkspaceLayout({
    rootPath: getSystemWorkspaceRoot(),
    projectId: SYSTEM_WORKSPACE_ID,
    name: "无项目对话",
    locationType: "system-default",
  }).layout;
}
