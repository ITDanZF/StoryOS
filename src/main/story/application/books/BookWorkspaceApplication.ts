import type { ChapterDraftRequest } from "../../../../shared/book/drafts.ts";
import {
  countTiptapCharacters,
  parseTiptapDocument,
  serializeTiptapDocument,
} from "../../../../shared/book/richText.ts";
import type {
  BookChapterRevisionResult,
  BookWorkspaceChapterDto,
  BookWorkspaceSnapshot,
  CreateBookChapterRequest,
  CreateBookRequest,
  CreateBookVolumeRequest,
  DeleteBookChapterRequest,
  DeleteBookVolumeRequest,
  SaveBookChapterContentRequest,
  UpdateBookChapterRequest,
  UpdateBookRequest,
} from "../../../../shared/contracts/books/bookWorkspaceContracts.ts";
import type { DesktopControllerDependencies } from "../../../desktop/DesktopControllerDependencies.ts";
import type { ActiveWorkspaceRuntime } from "../../runtime/WorkspaceRuntimeManager.ts";
export default class BookWorkspaceApplication {
  constructor(private readonly dependencies: Pick<DesktopControllerDependencies, "runtime">) {}
  async getBookWorkspace(projectId: string): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId,
    });
    return this.createBookWorkspaceSnapshot(runtime, projectId);
  }

  async createBook(request: CreateBookRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    if (runtime.novels.getProjectBook()) {
      throw new Error("This project already contains a book.");
    }
    runtime.novels.createNovel({
      title: request.title,
      synopsis: request.synopsis,
      status: request.status,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async createBookChapter(request: CreateBookChapterRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error(`Project book not found: ${request.projectId}`);
    const volume = runtime.novels.listVolumes(book.id).find((item) => item.id === request.volumeId);
    if (!volume) {
      throw new Error("The chapter must belong to an existing book volume.");
    }
    const siblings = runtime.novels
      .listChapters(book.id)
      .filter((chapter) => chapter.volumeId === volume.id);
    const nextSortOrder =
      siblings.reduce((maximum, chapter) => Math.max(maximum, chapter.sortOrder), -1) + 1;
    runtime.novels.createChapter({
      novelId: book.id,
      volumeId: volume.id,
      title: request.title,
      status: "outline",
      sortOrder: nextSortOrder,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async createBookVolume(request: CreateBookVolumeRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error(`Project book not found: ${request.projectId}`);
    const nextSortOrder =
      runtime.novels
        .listVolumes(book.id)
        .reduce((maximum, volume) => Math.max(maximum, volume.sortOrder), -1) + 1;
    runtime.novels.createVolume({
      novelId: book.id,
      title: request.title,
      sortOrder: nextSortOrder,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async deleteBookVolume(request: DeleteBookVolumeRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    runtime.novels.deleteVolume(request.volumeId);
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async deleteBookChapter(request: DeleteBookChapterRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    runtime.novels.deleteChapter(request.chapterId);
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async updateBook(request: UpdateBookRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error("Project book not found.");
    runtime.novels.updateNovel({
      id: book.id,
      rowVersion: request.expectedRowVersion,
      title: request.title,
      synopsis: request.synopsis,
      status: request.status,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async updateBookChapter(request: UpdateBookChapterRequest): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const chapter = runtime.novels.getChapter(request.chapterId);
    runtime.novels.updateChapter({
      id: chapter.id,
      rowVersion: request.expectedRowVersion,
      volumeId: chapter.volumeId,
      title: request.title,
      status: chapter.status,
      sortOrder: chapter.sortOrder,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async getBookChapterContent(request: {
    projectId: string;
    chapterId: string;
  }): Promise<BookWorkspaceChapterDto> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    return this.toBookWorkspaceChapter(runtime, runtime.novels.getChapter(request.chapterId), true);
  }

  async chapterDraft(request: ChapterDraftRequest) {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    return request.action === "read"
      ? runtime.novels.getDraft(request.chapterId)
      : runtime.novels.saveDraft(request);
  }

  async saveBookChapterContent(
    request: SaveBookChapterContentRequest,
  ): Promise<BookChapterRevisionResult> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const chapter = runtime.novels.getChapter(request.chapterId);
    const document = parseTiptapDocument(request.content);
    const content = serializeTiptapDocument(document);
    const revision = runtime.novels.saveRevision({
      chapterId: chapter.id,
      content,
      characterCount: countTiptapCharacters(document),
      changeSummary: "自动保存",
      expectedCurrentRevisionId: request.expectedCurrentRevisionId,
      expectedRowVersion: request.expectedRowVersion,
      expectedDraftVersion: request.expectedDraftVersion,
    });
    const updated = runtime.novels.getChapter(chapter.id);
    return Object.freeze({
      chapter: this.toBookWorkspaceChapter(runtime, updated, true),
      revision,
    });
  }

  private createBookWorkspaceSnapshot(
    runtime: ActiveWorkspaceRuntime,
    projectId: string,
  ): BookWorkspaceSnapshot {
    const book = runtime.novels.getProjectBook();
    if (!book) {
      return Object.freeze({
        state: "uninitialized",
        projectId,
      });
    }
    return Object.freeze({
      state: "ready",
      book,
      volumes: runtime.novels.listVolumes(book.id),
      chapters: Object.freeze(
        runtime.novels
          .listChapterSummaries(book.id)
          .map((chapter) => Object.freeze({ ...chapter, contentLoaded: false })),
      ),
    });
  }

  private toBookWorkspaceChapter(
    runtime: ActiveWorkspaceRuntime,
    chapter: ReturnType<ActiveWorkspaceRuntime["novels"]["getChapter"]>,
    includeContent = false,
  ): BookWorkspaceChapterDto {
    const metadata = runtime.novels.getCurrentRevisionMetadata(chapter.id);
    return Object.freeze({
      ...chapter,
      characterCount: metadata?.characterCount ?? 0,
      revisionNumber: metadata?.revisionNumber ?? null,
      contentLoaded: includeContent,
      ...(includeContent
        ? {
            content: runtime.novels.getCurrentRevision(chapter.id)?.content ?? "",
            draft: runtime.novels.getDraft(chapter.id),
          }
        : {}),
    });
  }
}
