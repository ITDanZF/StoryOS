import { realpathSync } from "node:fs";
import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { STORYOS_DIRECTORY } from "../../workspace/ProjectLayout.ts";

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isOutside(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return relativePath.startsWith("..") || path.isAbsolute(relativePath);
}

function assertNotInternalState(workspaceRoot: string, candidate: string): void {
  const relative = path.relative(workspaceRoot, candidate);
  const firstSegment = relative.split(path.sep)[0];
  if (firstSegment === STORYOS_DIRECTORY) {
    throw new Error("The .storyos internal state directory is managed by StoryOS and cannot be accessed by file tools.");
  }
}

function assertInsideWorkspace(workspaceRoot: string, candidate: string): void {
  if (isOutside(workspaceRoot, candidate) || candidate.startsWith("\\\\") || candidate.startsWith("//")) {
    throw new Error(`Resolved path is outside the active project workspace. Workspace: ${workspaceRoot}`);
  }
  assertNotInternalState(workspaceRoot, candidate);
}

async function findExistingAncestor(requestedPath: string, absolutePath: string): Promise<string> {
  let existingAncestor = requestedPath;
  for (;;) {
    try {
      const entry = await lstat(existingAncestor);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links and junctions are not valid write targets: ${existingAncestor}`);
      return existingAncestor;
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) throw new Error(`No existing parent directory for path: ${absolutePath}`);
      existingAncestor = parent;
    }
  }
}

function getCanonicalRoot(workspaceRoot: string): string {
  try {
    return realpathSync.native(workspaceRoot);
  } catch {
    return workspaceRoot;
  }
}

export default class WorkspacePathResolver {
  readonly workspaceRoot: string;
  private readonly canonicalWorkspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.canonicalWorkspaceRoot = getCanonicalRoot(this.workspaceRoot);
  }

  resolve(inputPath?: string): string {
    const requestedPath = inputPath?.trim() || ".";
    const absolutePath = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(this.workspaceRoot, requestedPath);
    if (isOutside(this.workspaceRoot, absolutePath) || absolutePath.startsWith("\\\\") || absolutePath.startsWith("//")) {
      throw new Error(`Path is outside the active project workspace. Workspace: ${this.workspaceRoot}`);
    }
    assertNotInternalState(this.workspaceRoot, absolutePath);
    return absolutePath;
  }

  async resolveExisting(inputPath?: string): Promise<string> {
    const requestedPath = this.resolve(inputPath);
    const resolvedPath = await realpath(requestedPath);
    assertInsideWorkspace(this.canonicalWorkspaceRoot, resolvedPath);
    return resolvedPath;
  }

  async resolveForWrite(inputPath?: string): Promise<string> {
    const requestedPath = this.resolve(inputPath);
    await this.assertSafeWrite(requestedPath);
    try {
      return await realpath(requestedPath);
    } catch (error) {
      if (isFileNotFound(error)) {
        return requestedPath;
      }
      throw error;
    }
  }

  async assertSafeWrite(absolutePath: string): Promise<void> {
    const requestedPath = path.resolve(absolutePath);
    const existingAncestor = await findExistingAncestor(requestedPath, absolutePath);
    assertInsideWorkspace(
      this.canonicalWorkspaceRoot,
      await realpath(existingAncestor),
    );
    try {
      const targetEntry = await lstat(requestedPath);
      if (targetEntry.isSymbolicLink()) throw new Error(`Symbolic links and junctions are not valid write targets: ${requestedPath}`);
      assertInsideWorkspace(
        this.canonicalWorkspaceRoot,
        await realpath(requestedPath),
      );
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
    }
  }

  toRelative(absolutePath: string): string {
    const baseRoot = isOutside(this.workspaceRoot, absolutePath)
      ? this.canonicalWorkspaceRoot
      : this.workspaceRoot;
    const relativePath = path.relative(baseRoot, absolutePath);
    return relativePath === "" ? "." : relativePath.split(path.sep).join("/");
  }
}
