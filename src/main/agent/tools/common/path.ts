import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { getCustomizeWorkSpace, getDefaultWorkSpace } from "../../workspace/path.ts";

export function getWorkspaceRoot() {
  let configuredWorkspace: string | null = null;
  try {
    configuredWorkspace = getCustomizeWorkSpace();
  } catch {
    configuredWorkspace = null;
  }
  return path.resolve(configuredWorkspace ?? getDefaultWorkSpace());
}

export function resolveWorkspacePath(inputPath?: string) {
  const workspaceRoot = getWorkspaceRoot();
  const requestedPath = inputPath?.trim() || ".";
  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(workspaceRoot, requestedPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    absolutePath.startsWith("\\\\") ||
    absolutePath.startsWith("//")
  ) {
    throw new Error(`Path is outside the agent workspace. Workspace: ${workspaceRoot}`);
  }
  return absolutePath;
}

function assertInsideWorkspace(workspaceRoot: string, candidate: string): void {
  const relativePath = path.relative(workspaceRoot, candidate);
  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    candidate.startsWith("\\\\") ||
    candidate.startsWith("//")
  ) {
    throw new Error(`Resolved path is outside the agent workspace. Workspace: ${workspaceRoot}`);
  }
}

async function getRealWorkspaceRoot(): Promise<string> {
  try {
    return await realpath(getWorkspaceRoot());
  } catch {
    throw new Error(`Agent workspace does not exist: ${getWorkspaceRoot()}`);
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
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic links and junctions are not valid write targets: ${existingAncestor}`);
      }
      return existingAncestor;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) {
        throw new Error(`No existing parent directory for path: ${absolutePath}`);
      }
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
    if (targetEntry.isSymbolicLink()) {
      throw new Error(`Symbolic links and junctions are not valid write targets: ${requestedPath}`);
    }
    assertInsideWorkspace(workspaceRoot, await realpath(requestedPath));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

export function toWorkspaceRelativePath(absolutePath: string) {
  const workspaceRoot = getWorkspaceRoot();
  const relativePath = path.relative(workspaceRoot, absolutePath);
  return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
}
