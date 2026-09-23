import type NovelApplication from "../../../application/books/NovelApplication.ts";
import type ChapterGenerationService from "../../../application/books/ChapterGenerationService.ts";
import type OutlineApplication from "../../../application/outline/OutlineApplication.ts";
import type NovelVectorPassageQuery from "../../../application/vectors/NovelVectorPassageQuery.ts";

export default class BookToolContext {
  constructor(
    readonly projectId: string,
    readonly novels: NovelApplication,
    readonly chapterGeneration?: ChapterGenerationService,
    readonly novelPassages?: NovelVectorPassageQuery,
    readonly openOutline?: () => OutlineApplication,
  ) {}

  requireBook() {
    const book = this.novels.getProjectBook();
    if (!book) throw new Error("The current project does not contain a book.");
    return book;
  }
}
