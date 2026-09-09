import path from "node:path";
import WorkspaceToolContext from "../../agent/tools/WorkspaceToolContext.ts";
import type { TextIndexStore } from "../../agent/tools/text/indexing/TextIndexStore.ts";
import { STORYOS_DIRECTORY } from "../workspace/ProjectLayout.ts";
export default class StoryWorkspaceToolContext extends WorkspaceToolContext {
  constructor(
    root: string,
    indexRoot = path.join(root, STORYOS_DIRECTORY, "text-index"),
    store?: TextIndexStore,
  ) {
    super(root, indexRoot, store, [STORYOS_DIRECTORY]);
  }
}
