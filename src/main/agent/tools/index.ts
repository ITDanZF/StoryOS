import { getDefaultWorkSpace } from "../workspace/path.ts";
import type { SkillInstaller } from "../skills/SkillInstallService.ts";
import WorkspaceToolContext from "./WorkspaceToolContext.ts";
import { createEditFileTool } from "./io/editFile.ts";
import { createListFilesTool } from "./io/listFiles.ts";
import { createReadFileTool } from "./io/readFile.ts";
import { createSearchTextTool } from "./io/searchText.ts";
import { createWriteFileTool } from "./io/writeFile.ts";
import { createSkillTool } from "./skill/createSkill.ts";
import { createTextTools } from "./text/index.ts";

export type CreateToolsOptions = {
  readonly skillInstaller?: SkillInstaller;
  readonly workspaceContext?: WorkspaceToolContext;
};

export function createTools(options: CreateToolsOptions = {}) {
  const context = options.workspaceContext
    ?? new WorkspaceToolContext(getDefaultWorkSpace());
  return [
    createReadFileTool(context),
    createWriteFileTool(context),
    createEditFileTool(context),
    createListFilesTool(context),
    createSearchTextTool(context),
    ...createTextTools(context),
    ...(options.skillInstaller ? [createSkillTool(options.skillInstaller)] : []),
  ];
}

export default class Tools {
  constructor(private readonly context?: WorkspaceToolContext) {}

  getTools() {
    return createTools({ workspaceContext: this.context });
  }
}
