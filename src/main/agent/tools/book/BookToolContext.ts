import type NovelApplication from "../../application/NovelApplication.ts";

export default class BookToolContext {
  constructor(
    readonly projectId: string,
    readonly novels: NovelApplication,
  ) {}

  requireBook() {
    const book = this.novels.getProjectBook();
    if (!book) throw new Error("The current project does not contain a book.");
    return book;
  }
}
