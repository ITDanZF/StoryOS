import type NovelApplication from "../../application/NovelApplication.ts";
import type ChapterGenerationService from "../../book-generation/ChapterGenerationService.ts";

export default class BookToolContext {
  constructor(
    readonly projectId: string,
    readonly novels: NovelApplication,
    readonly chapterGeneration?: ChapterGenerationService,
  ) {}

  requireBook() {
    const book = this.novels.getProjectBook();
    if (!book) throw new Error("The current project does not contain a book.");
    return book;
  }
}
