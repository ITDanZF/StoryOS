import FileStateTracker from "./common/fileState.ts";
import WorkspacePathResolver from "./common/path.ts";

export default class WorkspaceToolContext {
  readonly paths: WorkspacePathResolver;
  readonly files: FileStateTracker;

  constructor(workspaceRoot: string) {
    this.paths = new WorkspacePathResolver(workspaceRoot);
    this.files = new FileStateTracker();
  }
}
