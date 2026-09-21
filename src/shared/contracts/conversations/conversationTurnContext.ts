export const BOOK_EDITOR_PAGE_EXCERPT_MAX_CHARS = 2000;
export const BOOK_EDITOR_SELECTION_TEXT_MAX_CHARS = 2000;

export type ConversationTurnContext = BookEditorConversationContext;

export type BookEditorConversationContext = {
  readonly kind: "book_editor";
  readonly projectId: string;
  readonly projectName: string;
  readonly book: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly chapter: BookEditorChapterContext | null;
};

export type BookEditorChapterContext = {
  readonly id: string;
  readonly title: string;
  readonly number: number;
  readonly volumeTitle: string;
  readonly revisionId: string | null;
  readonly revisionNumber: number | null;
  readonly pageNumber: number | null;
  readonly pageExcerpt: string | null;
  readonly selection: BookEditorSelectionContext | null;
};

export type BookEditorSelectionContext = {
  readonly from: number;
  readonly to: number;
  readonly text: string | null;
};

export function clipBookEditorExcerpt(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}
