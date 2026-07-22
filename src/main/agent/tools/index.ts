import { editFileTool } from "./io/editFile.ts";
import { listFilesTool } from "./io/listFiles.ts";
import { readFileTool } from "./io/readFile.ts";
import { searchTextTool } from "./io/searchText.ts";
import { writeFileTool } from "./io/writeFile.ts";
import type { SkillInstaller } from "../skills/SkillInstallService.ts";
import { createSkillTool } from "./skill/createSkill.ts";

export type CreateToolsOptions = {
  readonly skillInstaller?: SkillInstaller;
};

export function createTools(options: CreateToolsOptions = {}) {
  return [
    readFileTool,
    writeFileTool,
    editFileTool,
    listFilesTool,
    searchTextTool,
    ...(options.skillInstaller ? [createSkillTool(options.skillInstaller)] : []),
  ];
}

export default class Tools {
  getTools() {
    return createTools();
  }
}
