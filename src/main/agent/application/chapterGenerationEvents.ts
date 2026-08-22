export type ChapterGenerationMode = "append" | "rewrite";

type ChapterGenerationEventBase = {
  readonly generationId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly timestamp: string;
};

export type ChapterGenerationEvent =
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_started";
      readonly mode: ChapterGenerationMode;
      readonly initialText: string;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_delta";
      readonly sequence: number;
      readonly text: string;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_completed";
      readonly revisionNumber: number;
      readonly content: string;
      readonly characterCount: number;
    })
  | (ChapterGenerationEventBase & {
      readonly type: "chapter_generation_failed";
      readonly error: string;
    });

export type ChapterGenerationEventHandler = (
  event: ChapterGenerationEvent,
) => void | Promise<void>;
