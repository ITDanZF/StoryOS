export type NovelMutation = {
  readonly id: string;
  readonly kind: NovelMutationKind;
  readonly novelId?: string;
  readonly volumeId?: string;
  readonly chapterId?: string;
  readonly revisionId?: string;
  readonly revisionNumber?: number;
};

export type NovelMutationKind =
  | "novel_created"
  | "novel_updated"
  | "novel_deleted"
  | "volume_created"
  | "volume_updated"
  | "volume_deleted"
  | "chapter_created"
  | "chapter_updated"
  | "chapter_deleted"
  | "chapter_revision_saved";
