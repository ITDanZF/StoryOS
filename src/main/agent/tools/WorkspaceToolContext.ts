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
    textIndexRoot = path.join(workspaceRoot, ".storyos", "text-index"),
    textIndexStore?: TextIndexStore,
  ) {
    this.paths = new WorkspacePathResolver(workspaceRoot);
    this.files = new FileStateTracker();
    this.textIndexRoot = path.resolve(textIndexRoot);
    this.textIndexStore = textIndexStore;
  }
}
