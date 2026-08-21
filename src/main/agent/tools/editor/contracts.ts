export type EditorCommandName =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "clearFormatting"
  | "undo"
  | "redo"
  | "pageBreak";

export type EditorStyleChange =
  | {
      readonly kind: "text_color";
      readonly value: string | null;
    }
  | {
      readonly kind: "background_color";
      readonly value: string | null;
    }
  | {
      readonly kind: "paragraph";
      readonly lineHeight?: "1" | "1.5" | "1.75" | "2" | null;
      readonly firstLineIndent?: boolean;
      readonly indentDelta?: -2 | 2;
    }
  | {
      readonly kind: "link";
      readonly href: string | null;
    };

export type RendererEditorToolOperation =
  | { readonly kind: "get_context" }
  | {
      readonly kind: "open_chapter";
      readonly chapterId: string;
      readonly pageNumber?: number;
    }
  | {
      readonly kind: "replace_range";
      readonly chapterId: string;
      readonly expectedVersion: number;
      readonly from: number;
      readonly to: number;
      readonly replacement: string;
    }
  | {
      readonly kind: "run_command";
      readonly chapterId: string;
      readonly expectedVersion: number;
      readonly command: EditorCommandName;
    }
  | {
      readonly kind: "set_style";
      readonly chapterId: string;
      readonly expectedVersion: number;
      readonly style: EditorStyleChange;
    }
  | {
      readonly kind: "page_operation";
      readonly chapterId: string;
      readonly expectedVersion: number;
      readonly action: "append" | "move" | "delete";
      readonly pageNumber?: number;
      readonly targetPageNumber?: number;
    };

export type RendererEditorToolRequest = {
  readonly requestId: string;
  readonly projectId: string;
  readonly operation: RendererEditorToolOperation;
};

export type RendererEditorToolResponse = {
  readonly requestId: string;
  readonly success: boolean;
  readonly result?: unknown;
  readonly error?: string;
};

export interface RendererEditorToolClient {
  invoke(
    projectId: string,
    operation: RendererEditorToolOperation,
  ): Promise<unknown>;
}
