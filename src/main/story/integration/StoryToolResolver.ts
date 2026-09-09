import type { ClientTool } from "@langchain/core/tools";
import ToolResolver from "../../agent/tools/ToolResolver.ts";
import { createTools, type CreateToolsOptions } from "./createStoryTools.ts";
import { createToolManifest } from "./StoryToolManifest.ts";
export type { RegisteredTool } from "../../agent/tools/ToolResolver.ts";
export default class StoryToolResolver extends ToolResolver {
  constructor(options?: readonly ClientTool[] | CreateToolsOptions) {
    super(
      Array.isArray(options) ? options : createTools(options as CreateToolsOptions | undefined),
      createToolManifest,
    );
  }
}
