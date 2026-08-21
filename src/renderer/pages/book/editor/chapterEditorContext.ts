import type {
  EditorCommandName,
  EditorStyleChange,
} from "../../../../main/agent/tools/editor/contracts.ts";

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
  readonly getContext: () => ChapterEditorLiveContext;
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
  readonly managePage: (request: {
    readonly expectedVersion: number;
    readonly action: "append" | "move" | "delete";
    readonly pageNumber?: number;
    readonly targetPageNumber?: number;
  }) => ChapterEditorLiveContext;
};
