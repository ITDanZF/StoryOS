import type WorkspaceToolContext from "../WorkspaceToolContext.ts";
import { createAnalyzeTextStructureTool } from "./analyzeTextStructure.ts";
import { createBatchEditTextTool } from "./batchEditText.ts";
import { createCompareTextTool } from "./compareText.ts";
import { createEditTextRangeTool } from "./editTextRange.ts";
import { createExtractTextTool } from "./extractText.ts";
import { createInspectTextTool } from "./inspectText.ts";
import { createFindSimilarTextTool } from "./indexing/findSimilarText.ts";
import { createRankedSearchTextTool } from "./indexing/rankedSearchText.ts";
import { createSelectTextContextTool } from "./indexing/selectTextContext.ts";
import TextIndexService from "./indexing/TextIndexService.ts";
import { createMergeTextTool } from "./mergeText.ts";
import { createNormalizeTextTool } from "./normalizeText.ts";
import { createReplaceTextTool } from "./replaceText.ts";
import { createSplitTextTool } from "./splitText.ts";
import { createTextStatsTool } from "./textStats.ts";
import { createTransformLinesTool } from "./transformLines.ts";
import { createValidateTextTool } from "./validateText.ts";

export function createTextTools(context: WorkspaceToolContext) {
  const textIndex = new TextIndexService(context, context.textIndexStore);

  return [
    createTextStatsTool(context),
    createEditTextRangeTool(context),
    createBatchEditTextTool(context),
    createCompareTextTool(context),
    createNormalizeTextTool(context),
    createExtractTextTool(context),
    createSplitTextTool(context),
    createValidateTextTool(context),
    createReplaceTextTool(context),
    createTransformLinesTool(context),
    createMergeTextTool(context),
    createInspectTextTool(context),
    createAnalyzeTextStructureTool(context),
    createRankedSearchTextTool(textIndex),
    createFindSimilarTextTool(context, textIndex),
    createSelectTextContextTool(textIndex),
  ];
}
