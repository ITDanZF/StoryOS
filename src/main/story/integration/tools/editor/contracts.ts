import type { RendererEditorToolOperation } from "../../../../../shared/contracts/editor/contracts.ts";
export type {
  EditorCommandName,
  EditorStyleChange,
  EditorTargetedStyleOperation,
  EditorTargetSelector,
  EditorTextQuery,
  EditorTextRange,
  RendererEditorToolOperation,
  RendererEditorToolRequest,
  RendererEditorToolResponse,
} from "../../../../../shared/contracts/editor/contracts.ts";

export interface RendererEditorToolClient {
  invoke(projectId: string, operation: RendererEditorToolOperation): Promise<unknown>;
}
