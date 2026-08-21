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
    }
  | {
      readonly kind: "mark";
      readonly mark: "bold" | "italic" | "underline" | "strike";
      readonly enabled: boolean;
    }
  | {
      readonly kind: "clear_inline";
    };

export type EditorTextQuery = {
  readonly text: string;
  readonly caseSensitive: boolean;
};

export type EditorTextRange = {
  readonly from: number;
  readonly to: number;
  readonly expectedText: string;
};

export type EditorTargetSelector =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly caseSensitive: boolean;
      readonly expectedCount: number;
      readonly occurrences:
        | { readonly kind: "all" }
        | { readonly kind: "indices"; readonly indices: readonly number[] };
    }
  | {
      readonly kind: "ranges";
      readonly ranges: readonly EditorTextRange[];
    }
  | {
      readonly kind: "selection";
      readonly expectedText: string;
    };

export type EditorTargetedStyleOperation = {
  readonly selector: EditorTargetSelector;
  readonly style: EditorStyleChange;
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
      readonly kind: "inspect_text";
      readonly queries: readonly EditorTextQuery[];
    }
  | {
      readonly kind: "select_range";
      readonly chapterId: string;
      readonly expectedVersion: number;
      readonly range: EditorTextRange;
    }
  | {
      readonly kind: "apply_targeted_styles";
      readonly chapterId: string;
      readonly expectedVersion: number;
      readonly operations: readonly EditorTargetedStyleOperation[];
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
