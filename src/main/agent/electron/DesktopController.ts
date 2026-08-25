import { shell } from "electron";
import type ProjectApplication from "../application/ProjectApplication.ts";
import ProjectNavigationReader from "../application/ProjectNavigationReader.ts";
import type BookshelfApplication from "../application/BookshelfApplication.ts";
import type { CreateProjectRequest, RenameProjectRequest } from "../application/projectContracts.ts";
import type {
  ConversationApplicationEventHandler,
  ConversationRef,
  ConversationScope,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from "../application/conversationContracts.ts";
import type { ToolApprovalDecision } from "../security/ToolPolicy.ts";
import type WorkspaceRuntimeManager from "../runtime/WorkspaceRuntimeManager.ts";
import type {
  ActiveWorkspaceRuntime,
} from "../runtime/WorkspaceRuntimeManager.ts";
import type {
  BookChapterRevisionResult,
  BookWorkspaceChapterDto,
  BookWorkspaceSnapshot,
  CreateBookRequest,
  CreateBookChapterRequest,
  CreateBookVolumeRequest,
  DeleteBookChapterRequest,
  DeleteBookVolumeRequest,
  SaveBookChapterContentRequest,
  UpdateBookRequest,
  UpdateBookChapterRequest,
} from "../application/bookWorkspaceContracts.ts";
import {
  countTiptapCharacters,
  parseTiptapDocument,
  serializeTiptapDocument,
} from "../../../shared/book/richText.ts";

export type DesktopControllerDependencies = {
  readonly projects: ProjectApplication;
  readonly runtime: WorkspaceRuntimeManager;
  readonly projectNavigation: Pick<ProjectNavigationReader, "read">;
  readonly bookshelf: Pick<
    BookshelfApplication,
    | "listBooks"
    | "listTrash"
    | "attachBookToProject"
    | "detachBookFromProject"
    | "reconcileRegistry"
    | "moveBookToTrash"
    | "restoreBookFromTrash"
    | "permanentlyDeleteBook"
    | "exportBook"
    | "importBook"
    | "listProjectArchives"
    | "createProjectArchive"
    | "restoreProjectArchive"
  >;
};

export default class DesktopController {
  private readonly projectNavigation: Pick<ProjectNavigationReader, "read">;

  constructor(private readonly dependencies: DesktopControllerDependencies) {
    this.projectNavigation = dependencies.projectNavigation;
  }

  subscribe(handler: ConversationApplicationEventHandler): () => void {
    return this.dependencies.runtime.subscribe(handler);
  }

  sendMessage(request: { readonly threadId: string; readonly content: string }) {
    return this.sendMessageWithRuntime(this.dependencies.runtime, request);
  }

  async sendConversationMessage(request: SendConversationMessageRequest) {
    if (request.context && (
      request.scope.kind !== "project" ||
      request.context.projectId !== request.scope.projectId
    )) {
      throw new Error("Conversation context does not match its project scope.");
    }
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    const result = this.sendMessageWithRuntime(runtime, request);
    return Object.freeze({
      ...result,
      threads: runtime.threads.getSnapshot(),
    });
  }

  private sendMessageWithRuntime(
    runtime: Pick<ActiveWorkspaceRuntime, "threads" | "agent">,
    request: {
      readonly threadId: string;
      readonly content: string;
      readonly context?: SendConversationMessageRequest["context"];
    },
  ) {
    const threadId = request.threadId.trim();
    const content = request.content.trim();
    if (!threadId) throw new Error("Thread id is required.");
    if (!content) throw new Error("Message content is required.");
    const { threads, agent } = runtime;
    const userMessage = threads.appendMessage({ threadId, role: "user", content });
    const runId = agent.startRun({
      threadId,
      message: {
        messageId: userMessage.id,
        content: userMessage.content,
      },
      ...(request.context ? { context: request.context } : {}),
    });
    void agent.waitForRun(runId).then((answer) => {
      threads.appendMessage({ threadId, role: "assistant", content: answer });
    }).catch(() => {
      // Run failures are emitted by AgentApplication; partial assistant replies are not persisted.
    });
    return Object.freeze({ runId });
  }

  async getConversationSnapshot(scope: ConversationScope) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return Object.freeze({
      scope: runtime.conversationScope,
      threads: runtime.threads.getSnapshot(),
    });
  }

  async listConversationMessages(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return runtime.threads.listMessages(request.threadId);
  }

  async listConversationEvents(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return runtime.conversationEvents.listByThread(request.threadId);
  }

  async createConversation(request: CreateConversationRequest) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return runtime.threads.createThread({ title: request.title });
  }

  async switchConversation(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return Object.freeze({
      scope: runtime.conversationScope,
      threads: runtime.threads.switchThread(request.threadId),
    });
  }

  async deleteConversation(request: ConversationRef) {
    const runtime = await this.dependencies.runtime.resolve(request.scope);
    return Object.freeze({
      scope: runtime.conversationScope,
      threads: runtime.threads.deleteThread(request.threadId),
    });
  }

  async getProjectNavigation(projectId: string) {
    return this.projectNavigation.read(projectId);
  }

  getBookshelfBooks() {
    return this.dependencies.bookshelf.listBooks();
  }

  getBookshelfTrash() {
    return this.dependencies.bookshelf.listTrash();
  }

  async attachBookshelfBook(projectId: string, bookId: string) {
    await this.dependencies.bookshelf.attachBookToProject(projectId, bookId);
    return this.projectNavigation.read(projectId);
  }

  async detachProjectBook(projectId: string) {
    await this.dependencies.bookshelf.detachBookFromProject(projectId);
    return this.projectNavigation.read(projectId);
  }

  reconcileBookshelfRegistry() {
    return this.dependencies.bookshelf.reconcileRegistry();
  }

  moveBookshelfBookToTrash(bookId: string) {
    return this.dependencies.bookshelf.moveBookToTrash(bookId);
  }

  restoreBookshelfBookFromTrash(bookId: string) {
    return this.dependencies.bookshelf.restoreBookFromTrash(bookId);
  }

  permanentlyDeleteBookshelfBook(input: {
    readonly bookId: string;
    readonly confirmationBookId: string;
  }): void {
    this.dependencies.bookshelf.permanentlyDeleteBook(input);
  }

  exportBookshelfBook(request: {
    readonly bookId: string;
    readonly outputPath: string;
  }): Promise<void> {
    return this.dependencies.bookshelf.exportBook(request);
  }

  importBookshelfBook(request: { readonly packagePath: string }) {
    return this.dependencies.bookshelf.importBook(request);
  }

  listProjectArchives(bookId?: string) {
    return this.dependencies.bookshelf.listProjectArchives(bookId);
  }

  async restoreProjectArchive(request: {
    readonly archiveId: string;
    readonly targetPath: string;
    readonly bookStrategy: "snapshot" | "current";
  }) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const result = this.dependencies.bookshelf.restoreProjectArchive(request);
    try {
      await this.dependencies.runtime.activate(result.projectPath);
      this.dependencies.projects.switchProject(result.projectPath);
      return Object.freeze({
        result,
        workspace: this.getWorkspaceSnapshot(),
      });
    } catch (error) {
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async getBookWorkspace(projectId: string): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId,
    });
    return this.createBookWorkspaceSnapshot(runtime, projectId);
  }

  async createBook(
    request: CreateBookRequest,
  ): Promise<BookWorkspaceSnapshot> {
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

  async createBookChapter(
    request: CreateBookChapterRequest,
  ): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error(`Project book not found: ${request.projectId}`);
    const volume = runtime.novels.listVolumes(book.id).find(
      (item) => item.id === request.volumeId,
    );
    if (!volume) {
      throw new Error("The chapter must belong to an existing book volume.");
    }
    const siblings = runtime.novels.listChapters(book.id)
      .filter((chapter) => chapter.volumeId === volume.id);
    const nextSortOrder = siblings.reduce(
      (maximum, chapter) => Math.max(maximum, chapter.sortOrder),
      -1,
    ) + 1;
    runtime.novels.createChapter({
      novelId: book.id,
      volumeId: volume.id,
      title: request.title,
      status: "outline",
      sortOrder: nextSortOrder,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async createBookVolume(
    request: CreateBookVolumeRequest,
  ): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error(`Project book not found: ${request.projectId}`);
    const nextSortOrder = runtime.novels.listVolumes(book.id).reduce(
      (maximum, volume) => Math.max(maximum, volume.sortOrder),
      -1,
    ) + 1;
    runtime.novels.createVolume({
      novelId: book.id,
      title: request.title,
      sortOrder: nextSortOrder,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async deleteBookVolume(
    request: DeleteBookVolumeRequest,
  ): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    runtime.novels.deleteVolume(request.volumeId);
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async deleteBookChapter(
    request: DeleteBookChapterRequest,
  ): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    runtime.novels.deleteChapter(request.chapterId);
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async updateBook(
    request: UpdateBookRequest,
  ): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const book = runtime.novels.getProjectBook();
    if (!book) throw new Error("Project book not found.");
    runtime.novels.updateNovel({
      id: book.id,
      title: request.title,
      synopsis: request.synopsis,
      status: request.status,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
  }

  async updateBookChapter(
    request: UpdateBookChapterRequest,
  ): Promise<BookWorkspaceSnapshot> {
    const runtime = await this.dependencies.runtime.resolve({
      kind: "project",
      projectId: request.projectId,
    });
    const chapter = runtime.novels.getChapter(request.chapterId);
    runtime.novels.updateChapter({
      id: chapter.id,
      volumeId: chapter.volumeId,
      title: request.title,
      status: chapter.status,
      sortOrder: chapter.sortOrder,
    });
    return this.createBookWorkspaceSnapshot(runtime, request.projectId);
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
    });
    const updated = runtime.novels.getChapter(chapter.id);
    return Object.freeze({
      chapter: this.toBookWorkspaceChapter(runtime, updated),
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
        runtime.novels.listChapters(book.id)
          .map((chapter) => this.toBookWorkspaceChapter(runtime, chapter)),
      ),
    });
  }

  private toBookWorkspaceChapter(
    runtime: ActiveWorkspaceRuntime,
    chapter: ReturnType<ActiveWorkspaceRuntime["novels"]["getChapter"]>,
  ): BookWorkspaceChapterDto {
    const revision = runtime.novels.getCurrentRevision(chapter.id);
    return Object.freeze({
      ...chapter,
      content: revision?.content ?? "",
      characterCount: revision?.characterCount ?? 0,
      revisionNumber: revision?.revisionNumber ?? null,
    });
  }

  cancelRun(runId: string): boolean { return this.dependencies.runtime.agent.cancelRun(runId); }
  listRuns() { return this.dependencies.runtime.agent.listRuns(); }
  resolveApproval(approvalId: string, decision: ToolApprovalDecision) {
    return this.dependencies.runtime.agent.resolveApproval(approvalId, decision);
  }
  async cancelConversationRun(scope: ConversationScope, runId: string) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return runtime.agent.cancelRun(runId);
  }
  async listConversationRuns(scope: ConversationScope) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return runtime.agent.listRuns();
  }
  async resolveConversationApproval(
    scope: ConversationScope,
    approvalId: string,
    decision: ToolApprovalDecision,
  ) {
    const runtime = await this.dependencies.runtime.resolve(scope);
    return runtime.agent.resolveApproval(approvalId, decision);
  }
  getThreadSnapshot() { return this.dependencies.runtime.threads.getSnapshot(); }
  listMessages(threadId?: string) { return this.dependencies.runtime.threads.listMessages(threadId); }
  createThread(title: string) { return this.dependencies.runtime.threads.createThread({ title }); }
  switchThread(threadId: string) { return this.dependencies.runtime.threads.switchThread(threadId); }
  deleteThread(threadId: string) { return this.dependencies.runtime.threads.deleteThread(threadId); }
  getProjectSnapshot() { return this.dependencies.projects.getSnapshot(); }
  getWorkspaceSnapshot() {
    return Object.freeze({ projects: this.dependencies.projects.getSnapshot(), threads: this.dependencies.runtime.threads.getSnapshot() });
  }

  async createProject(request: CreateProjectRequest) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const project = this.dependencies.projects.createProject(request);
    const bookId = request.bookId?.trim() || null;
    try {
      if (bookId) {
        await this.dependencies.bookshelf.attachBookToProject(
          project.id,
          bookId,
        );
      }
      await this.dependencies.runtime.activate(project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      if (bookId) {
        try {
          await this.dependencies.bookshelf.detachBookFromProject(project.id);
          this.dependencies.projects.switchProject(previousPath);
          this.dependencies.projects.rollbackProjectCreation(project);
          await this.dependencies.runtime.activate(previousPath);
        } catch (recoveryError) {
          throw new AggregateError(
            [error, recoveryError],
            `Project creation recovery failed: ${project.id}`,
          );
        }
        throw error;
      }
      this.dependencies.projects.switchProject(previousPath);
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async openProject(projectPath: string) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    const project = this.dependencies.projects.openProject(projectPath);
    try {
      await this.dependencies.runtime.activate(project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.switchProject(previousPath);
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async openProjectDirectory(projectPath: string): Promise<void> {
    const project = this.dependencies.projects.getProject(projectPath);
    const errorMessage = await shell.openPath(project.path);
    if (errorMessage) throw new Error(`Could not open project directory: ${errorMessage}`);
  }

  async renameProject(request: RenameProjectRequest) {
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === request.projectPath;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(request.projectPath);
    const result = this.dependencies.projects.renameProject(request);
    try {
      if (wasActive) await this.dependencies.runtime.activate(result.project.path);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      this.dependencies.projects.rollbackProjectRename(result);
      if (wasActive) await this.dependencies.runtime.activate(result.previousProject.path);
      throw error;
    }
  }

  async deleteProject(projectPath: string) {
    const project = this.dependencies.projects.getProject(projectPath);
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === project.path;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(project.path);
    try {
      await this.dependencies.bookshelf.createProjectArchive(project.id);
      await shell.trashItem(project.path);
    } catch (error) {
      if (wasActive) await this.dependencies.runtime.activate(project.path);
      throw error;
    }
    const snapshot = this.dependencies.projects.removeProject(project.path);
    await this.dependencies.runtime.activate(snapshot.activeProjectPath);
    return this.getWorkspaceSnapshot();
  }

  async switchProject(projectPath: string | null) {
    const previousPath = this.dependencies.projects.getSnapshot().activeProjectPath;
    await this.dependencies.runtime.activate(projectPath);
    try {
      this.dependencies.projects.switchProject(projectPath);
      return this.getWorkspaceSnapshot();
    } catch (error) {
      await this.dependencies.runtime.activate(previousPath);
      throw error;
    }
  }

  async removeProject(projectPath: string) {
    const wasActive = this.dependencies.projects.getSnapshot().activeProjectPath === projectPath;
    if (wasActive) await this.dependencies.runtime.closeForProjectMutation(projectPath);
    const snapshot = this.dependencies.projects.removeProject(projectPath);
    await this.dependencies.runtime.activate(snapshot.activeProjectPath);
    return this.getWorkspaceSnapshot();
  }

  shutdown(): Promise<void> { return this.dependencies.runtime.shutdown(); }

  getSkillSnapshot() { return this.dependencies.runtime.skills.getSnapshot(); }
  getSkill(skillId: string) { return this.dependencies.runtime.skills.getSkill(skillId); }
  useSkill(skillId: string, threadId?: string) { return this.dependencies.runtime.threads.useSkill(skillId, threadId); }
  disableSkill(skillId: string, threadId?: string) { return this.dependencies.runtime.threads.disableSkill(skillId, threadId); }
  clearSkillState(threadId?: string) { return this.dependencies.runtime.threads.clearSkillState(threadId); }
}
