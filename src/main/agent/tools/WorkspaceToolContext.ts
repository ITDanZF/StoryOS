import path from "node:path";
import FileStateTracker from "./common/fileState.ts";
import WorkspacePathResolver from "./common/path.ts";
import type { TextIndexStore } from "./text/indexing/TextIndexStore.ts";

export default class WorkspaceToolContext {
  readonly paths: WorkspacePathResolver;
  readonly files: FileStateTracker;
  readonly textIndexRoot: string;
  readonly textIndexStore?: TextIndexStore;

  constructor(
    workspaceRoot: string,
    textIndexRoot = path.join(workspaceRoot, ".agent", "text-index"),
    textIndexStore?: TextIndexStore,
    deniedDirectories: readonly string[] = [".agent"],
  ) {
    this.paths = new WorkspacePathResolver(workspaceRoot, deniedDirectories);
    this.files = new FileStateTracker();
    this.textIndexRoot = path.resolve(textIndexRoot);
    this.textIndexStore = textIndexStore;
  }
}
