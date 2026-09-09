import type {
  EditorCommandName,
  EditorStyleChange,
  EditorTargetedStyleOperation,
  EditorTextQuery,
  EditorTextRange,
} from "../../../../main/agent/tools/editor/contracts.ts";
import type { EditorTextInspection } from "./ai/richTextTargeting.ts";

export type ChapterEditorLiveContext = {
  readonly version: number;
  readonly documentText: string;
  readonly selection: {
    readonly from: number;
    readonly to: number;
    readonly text: string;
  } | null;
};

export type ChapterEditorBridge = {
  readonly flushPending: () => Promise<void>;
  readonly getContext: () => ChapterEditorLiveContext;
  readonly inspectText: (request: {
    readonly queries: readonly EditorTextQuery[];
  }) => ChapterEditorLiveContext & {
    readonly inspections: readonly EditorTextInspection[];
  };
  readonly selectRange: (request: {
    readonly expectedVersion: number;
    readonly range: EditorTextRange;
  }) => ChapterEditorLiveContext;
  readonly replaceRange: (request: {
    readonly expectedVersion: number;
    readonly from: number;
    readonly to: number;
    readonly replacement: string;
  }) => ChapterEditorLiveContext;
  readonly runCommand: (request: {
    readonly expectedVersion: number;
    readonly command: EditorCommandName;
  }) => ChapterEditorLiveContext;
  readonly setStyle: (request: {
    readonly expectedVersion: number;
    readonly style: EditorStyleChange;
  }) => ChapterEditorLiveContext;
  readonly applyTargetedStyles: (request: {
    readonly expectedVersion: number;
    readonly operations: readonly EditorTargetedStyleOperation[];
  }) => ChapterEditorLiveContext & {
    readonly appliedTargetCount: number;
    readonly appliedOperationCount: number;
    readonly appliedOperations: readonly {
      readonly index: number;
      readonly targetCount: number;
      readonly ranges: readonly EditorTextRange[];
    }[];
  };
  readonly managePage: (request: {
    readonly expectedVersion: number;
    readonly action: "append" | "move" | "delete";
    readonly pageNumber?: number;
    readonly targetPageNumber?: number;
  }) => ChapterEditorLiveContext;
};
