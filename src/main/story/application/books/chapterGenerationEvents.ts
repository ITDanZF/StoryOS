import type { ChapterGenerationEvent } from "../../../../shared/contracts/books/chapterGenerationEvents.ts";
export type {
  ChapterGenerationEvent,
  ChapterGenerationEventBase,
  ChapterGenerationMode,
} from "../../../../shared/contracts/books/chapterGenerationEvents.ts";

export type ChapterGenerationEventHandler = (event: ChapterGenerationEvent) => void | Promise<void>;
