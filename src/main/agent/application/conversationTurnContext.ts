export type BookEditorSelectionContext = {
  readonly from: number;
  readonly to: number;
  readonly text: string;
};

export type BookEditorChapterContext = {
  readonly id: string;
  readonly title: string;
  readonly number: number;
  readonly volumeTitle: string;
  readonly revisionNumber: number | null;
  readonly pageNumber: number | null;
  readonly documentText: string;
  readonly selection: BookEditorSelectionContext | null;
};

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

export type ConversationTurnContext = BookEditorConversationContext;
