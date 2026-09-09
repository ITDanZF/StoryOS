import { z } from "zod";
import type { RestoreProjectArchiveDesktopRequest } from "../../../shared/agent/contracts.ts";
import type { ConversationTurnContext } from "../../../shared/contracts/conversations/conversationTurnContext.ts";
import type { ToolApprovalDecision } from "../../agent/tools/security/ToolPolicy.ts";
import type { NovelStatus } from "../../story/application/books/novelPorts.ts";
import type {
  ConversationRef,
  ConversationScope,
} from "../../story/application/conversations/conversationContracts.ts";
import type {
  BookTransferFormat,
  ExportBookOptions,
} from "../../story/application/transfers/bookTransferContracts.ts";
export function requireApprovalDecision(decision: ToolApprovalDecision): ToolApprovalDecision {
  if (!["allow_once", "allow_session", "deny"].includes(decision)) {
    throw new Error("Invalid tool approval decision.");
  }
  return decision;
}

export function requireProjectArchiveBookStrategy(
  value: unknown,
): RestoreProjectArchiveDesktopRequest["bookStrategy"] {
  if (value !== "snapshot" && value !== "current") {
    throw new Error("Invalid project archive book strategy.");
  }
  return value;
}

export function requireConversationScope(scope: ConversationScope): ConversationScope {
  if (!scope || typeof scope !== "object") {
    throw new Error("Conversation scope is required.");
  }
  if (scope.kind === "global") return Object.freeze({ kind: "global" });
  if (scope.kind !== "project") throw new Error("Invalid conversation scope.");
  const projectId = scope.projectId?.trim();
  if (!projectId) throw new Error("Project id is required.");
  return Object.freeze({ kind: "project", projectId });
}

export function requireText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function requireConversationRef(request: ConversationRef): ConversationRef {
  const threadId = requireText(request?.threadId, "Thread id");
  return Object.freeze({
    scope: requireConversationScope(request.scope),
    threadId,
    afterSequence: z.number().int().nonnegative().optional().parse(request.afterSequence),
    limit: z.number().int().min(1).max(1000).optional().parse(request.limit),
  });
}

export function requireContent(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Chapter content must be a string.");
  }
  return value;
}

export function requireNullableRevisionId(value: unknown): string | null {
  if (value === null) return null;
  return requireText(value, "Expected chapter revision id");
}

export function requireConversationTurnContext(
  value: ConversationTurnContext,
): ConversationTurnContext {
  if (!value || typeof value !== "object" || value.kind !== "book_editor") {
    throw new Error("Invalid conversation context.");
  }
  const book =
    value.book === null
      ? null
      : Object.freeze({
          id: requireText(value.book?.id, "Book id"),
          title: requireText(value.book?.title, "Book title"),
        });
  const chapter =
    value.chapter === null
      ? null
      : Object.freeze({
          id: requireText(value.chapter?.id, "Chapter id"),
          title: requireText(value.chapter?.title, "Chapter title"),
          number: requirePositiveInteger(value.chapter?.number, "Chapter number"),
          volumeTitle: requireText(value.chapter?.volumeTitle, "Volume title"),
          revisionNumber:
            value.chapter?.revisionNumber === null
              ? null
              : requirePositiveInteger(value.chapter?.revisionNumber, "Revision number"),
          pageNumber:
            value.chapter?.pageNumber === null
              ? null
              : requirePositiveInteger(value.chapter?.pageNumber, "Page number"),
          documentText: requireString(value.chapter?.documentText, "Chapter text"),
          selection:
            value.chapter?.selection === null
              ? null
              : Object.freeze({
                  from: requireNonNegativeInteger(
                    value.chapter?.selection?.from,
                    "Selection start",
                  ),
                  to: requireNonNegativeInteger(value.chapter?.selection?.to, "Selection end"),
                  text: requireText(value.chapter?.selection?.text, "Selection text"),
                }),
        });
  if (chapter?.selection && chapter.selection.to <= chapter.selection.from) {
    throw new Error("Selection end must be after selection start.");
  }
  return Object.freeze({
    kind: "book_editor",
    projectId: requireText(value.projectId, "Project id"),
    projectName: requireText(value.projectName, "Project name"),
    book,
    chapter,
  });
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

export function requireBoundedString(value: unknown, label: string, maximumLength: number): string {
  const result = requireString(value, label);
  if (result.length > maximumLength) {
    throw new Error(`${label} must be ${maximumLength} characters or fewer.`);
  }
  return result;
}

export function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

export function requirePositiveInteger(value: unknown, label: string): number {
  const result = requireNonNegativeInteger(value, label);
  if (result === 0) throw new Error(`${label} must be a positive integer.`);
  return result;
}

export function requireNovelStatus(value: unknown): NovelStatus {
  if (!["planning", "writing", "completed", "archived"].includes(value as string)) {
    throw new Error("Invalid book status.");
  }
  return value as NovelStatus;
}

export function requireBookTransferFormat(value: unknown): BookTransferFormat {
  if (!["storyos", "text", "markdown", "docx", "epub", "pdf"].includes(value as string)) {
    throw new Error("Invalid book transfer format.");
  }
  return value as BookTransferFormat;
}

export function requireBookExportOptions(value: unknown): ExportBookOptions {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid book export options.");
  }
  const input = value as Record<string, unknown>;
  const keys = [
    "includeTitlePage",
    "includeSynopsis",
    "includeVolumeSummaries",
    "includeTableOfContents",
    "chapterPageBreaks",
    "markdownBundle",
    "splitTextFiles",
  ] as const;
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") throw new Error(`Invalid export option: ${key}`);
    result[key] = input[key] as boolean;
  }
  return Object.freeze(result);
}
