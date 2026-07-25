import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { createBatchEditTextTool } from "./batchEditText.ts";
import { createCompareTextTool } from "./compareText.ts";
import { createEditTextRangeTool } from "./editTextRange.ts";
import { createExtractTextTool } from "./extractText.ts";
import { createNormalizeTextTool } from "./normalizeText.ts";
import { createSplitTextTool } from "./splitText.ts";
import { createTextStatsTool } from "./textStats.ts";
import { createValidateTextTool } from "./validateText.ts";

export function createTextTools(context: WorkspaceToolContext) {
  return [
    createTextStatsTool(context),
    createEditTextRangeTool(context),
    createBatchEditTextTool(context),
    createCompareTextTool(context),
    createNormalizeTextTool(context),
    createExtractTextTool(context),
    createSplitTextTool(context),
    createValidateTextTool(context),
  ];
}
