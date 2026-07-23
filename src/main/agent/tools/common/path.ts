import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { STORYOS_DIRECTORY } from "../../workspace/ProjectLayout.ts";

let activeWorkspaceRoot: string | null = null;

export function setActiveWorkspaceRoot(workspaceRoot: string): void {
  activeWorkspaceRoot = path.resolve(workspaceRoot);
}

export function getWorkspaceRoot(): string {
  if (!activeWorkspaceRoot) throw new Error("No active StoryOS workspace.");
  return activeWorkspaceRoot;
}

function assertNotInternalState(workspaceRoot: string, candidate: string): void {
  const relative = path.relative(workspaceRoot, candidate);
  const firstSegment = relative.split(path.sep)[0];
  if (firstSegment === STORYOS_DIRECTORY) {
    throw new Error("The .storyos internal state directory is managed by StoryOS and cannot be accessed by file tools.");
  }
}

export function resolveWorkspacePath(inputPath?: string): string {
  const workspaceRoot = getWorkspaceRoot();
  const requestedPath = inputPath?.trim() || ".";
  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(workspaceRoot, requestedPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || absolutePath.startsWith("\\\\") || absolutePath.startsWith("//")) {
    throw new Error(`Path is outside the active project workspace. Workspace: ${workspaceRoot}`);
  }
  assertNotInternalState(workspaceRoot, absolutePath);
  return absolutePath;
}

function assertInsideWorkspace(workspaceRoot: string, candidate: string): void {
  const relativePath = path.relative(workspaceRoot, candidate);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath) || candidate.startsWith("\\\\") || candidate.startsWith("//")) {
    throw new Error(`Resolved path is outside the active project workspace. Workspace: ${workspaceRoot}`);
  }
  assertNotInternalState(workspaceRoot, candidate);
}

async function getRealWorkspaceRoot(): Promise<string> {
  try {
    return await realpath(getWorkspaceRoot());
  } catch {
    throw new Error(`Active project workspace does not exist: ${getWorkspaceRoot()}`);
  }
}

export async function resolveExistingWorkspacePath(inputPath?: string): Promise<string> {
  const requestedPath = resolveWorkspacePath(inputPath);
  const workspaceRoot = await getRealWorkspaceRoot();
  const resolvedPath = await realpath(requestedPath);
  assertInsideWorkspace(workspaceRoot, resolvedPath);
  return resolvedPath;
}

async function findExistingAncestor(requestedPath: string, absolutePath: string): Promise<string> {
  let existingAncestor = requestedPath;
  for (;;) {
    try {
      const entry = await lstat(existingAncestor);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links and junctions are not valid write targets: ${existingAncestor}`);
      return existingAncestor;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) throw new Error(`No existing parent directory for path: ${absolutePath}`);
      existingAncestor = parent;
    }
  }
}

export async function assertSafeWorkspaceWritePath(absolutePath: string): Promise<void> {
  const requestedPath = resolveWorkspacePath(absolutePath);
  const workspaceRoot = await getRealWorkspaceRoot();
  const existingAncestor = await findExistingAncestor(requestedPath, absolutePath);
  assertInsideWorkspace(workspaceRoot, await realpath(existingAncestor));
  try {
    const targetEntry = await lstat(requestedPath);
    if (targetEntry.isSymbolicLink()) throw new Error(`Symbolic links and junctions are not valid write targets: ${requestedPath}`);
    assertInsideWorkspace(workspaceRoot, await realpath(requestedPath));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export function toWorkspaceRelativePath(absolutePath: string): string {
  const relativePath = path.relative(getWorkspaceRoot(), absolutePath);
  return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
}