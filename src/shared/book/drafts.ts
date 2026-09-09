export type ChapterDraft = {
  chapterId: string;
  baseRevisionId: string | null;
  draftVersion: number;
  content: string;
  updatedAt: string;
};
export type ChapterDraftRequest = {
  projectId: string;
  chapterId: string;
} & (
  | { action: "read" }
  | {
      action: "save";
      baseRevisionId: string | null;
      expectedDraftVersion: number;
      content: string;
    }
);
