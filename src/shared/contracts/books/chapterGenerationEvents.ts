export type ChapterGenerationEvent =
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_started";
      readonly mode: ChapterGenerationMode;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_thinking";
      readonly text: string;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_page_ready";
      readonly pageNumber: number;
      readonly content: string;
      readonly generatedCharacterCount: number;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_retrying";
      readonly attempt: number;
      readonly maxAttempts: number;
      readonly reason: string;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_completed";
      readonly revisionNumber: number;
      readonly content: string;
      readonly characterCount: number;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_cancelled";
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_failed";
      readonly error: string;
    });

export type ChapterGenerationEventBase = {
  readonly generationId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly timestamp: string;
};

export type ChapterGenerationMode = "append" | "rewrite";
