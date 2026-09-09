import { getDefaultWorkSpace } from "../../agent/environment/paths.ts";
import type { SkillInstaller } from "../../agent/skills/SkillInstallService.ts";
import WorkspaceToolContext from "./StoryWorkspaceToolContext.ts";
import { createBookTools, type BookToolContext } from "./tools/book/index.ts";
import type { RendererEditorToolClient } from "./tools/editor/contracts.ts";
import { createEditorTools } from "./tools/editor/editorTools.ts";
import { createTools as createCoreTools } from "../../agent/tools/index.ts";

export type CreateToolsOptions = {
  readonly skillInstaller?: SkillInstaller;
  readonly workspaceContext?: WorkspaceToolContext;
  readonly bookContext?: BookToolContext;
  readonly rendererEditorTools?: RendererEditorToolClient;
  readonly rendererEditorProjectId?: string;
};

export function createTools(options: CreateToolsOptions = {}) {
  const context = options.workspaceContext ?? new WorkspaceToolContext(getDefaultWorkSpace());
  return [
    ...createCoreTools({ workspaceContext: context, skillInstaller: options.skillInstaller }),
    ...(options.bookContext ? createBookTools(options.bookContext) : []),
    ...(options.rendererEditorTools && options.rendererEditorProjectId
      ? createEditorTools(options.rendererEditorTools, options.rendererEditorProjectId)
      : []),
  ];
}

export default class Tools {
  constructor(private readonly context?: WorkspaceToolContext) {}

  getTools() {
    return createTools({ workspaceContext: this.context });
  }
}
