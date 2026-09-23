import { shell } from "electron";
import type { ModelConnectionConfiguration } from "../agent/model/ModelConfiguration.ts";
import BookWorkspaceApplication from "../story/application/books/BookWorkspaceApplication.ts";
import OutlineApplication from "../story/application/outline/OutlineApplication.ts";
import SqliteOutlineStore from "../story/storage/book/SqliteOutlineStore.ts";
import ConversationApplication from "../story/application/conversations/ConversationApplication.ts";
import type { ConversationApplicationEventHandler } from "../story/application/conversations/conversationContracts.ts";
import ProjectLifecycleApplication from "../story/application/projects/ProjectLifecycleApplication.ts";
import ProjectNavigationReader from "../story/application/projects/ProjectNavigationReader.ts";
import type { DesktopControllerDependencies } from "./DesktopControllerDependencies.ts";
import type {
  ApplyOutlinePatchRequest,
  BuildChapterContextRequest,
  CreateOutlineRequest,
  LoadHandoffRequest,
  MapOutlineNodesRequest,
  MarkNodesPendingRequest,
  ProposeOutlineRequest,
  ReviewCoverageRequest,
  RunOutlineChecksRequest,
  StartChapterWritingRequest,
  UnmapOutlineNodeRequest,
  UpdateOutlineNodeRequest,
  UpdateOutlineProfileRequest,
  WaiveMainlineRequest,
} from "../../shared/contracts/outline/outlineContracts.ts";
export type { DesktopControllerDependencies } from "./DesktopControllerDependencies.ts";

export default class DesktopController {
  private readonly bookWorkspace: BookWorkspaceApplication;
  private readonly projectLifecycle: ProjectLifecycleApplication;
  private readonly conversations: ConversationApplication;

  private readonly projectNavigation: Pick<ProjectNavigationReader, "read">;

  constructor(private readonly dependencies: DesktopControllerDependencies) {
    this.bookWorkspace = new BookWorkspaceApplication(dependencies);
    this.projectLifecycle = new ProjectLifecycleApplication(dependencies, shell);
    this.conversations = new ConversationApplication(dependencies);
    this.projectNavigation = dependencies.projectNavigation;
  }

  subscribe(handler: ConversationApplicationEventHandler): () => void {
    return this.dependencies.runtime.subscribe(handler);
  }

  prepareModelConfiguration(configuration: ModelConnectionConfiguration): () => void {
    return this.dependencies.runtime.prepareModelConfiguration(configuration);
  }

  sendMessage(...args: Parameters<ConversationApplication["sendMessage"]>) {
    return this.conversations.sendMessage(...args);
  }

  sendConversationMessage(...args: Parameters<ConversationApplication["sendConversationMessage"]>) {
    return this.conversations.sendConversationMessage(...args);
  }

  getConversationSnapshot(...args: Parameters<ConversationApplication["getConversationSnapshot"]>) {
    return this.conversations.getConversationSnapshot(...args);
  }

  listConversationMessages(
    ...args: Parameters<ConversationApplication["listConversationMessages"]>
  ) {
    return this.conversations.listConversationMessages(...args);
  }

  listConversationEvents(...args: Parameters<ConversationApplication["listConversationEvents"]>) {
    return this.conversations.listConversationEvents(...args);
  }

  createConversation(...args: Parameters<ConversationApplication["createConversation"]>) {
    return this.conversations.createConversation(...args);
  }

  switchConversation(...args: Parameters<ConversationApplication["switchConversation"]>) {
    return this.conversations.switchConversation(...args);
  }

  deleteConversation(...args: Parameters<ConversationApplication["deleteConversation"]>) {
    return this.conversations.deleteConversation(...args);
  }

  async getProjectNavigation(projectId: string) {
    return this.projectNavigation.read(projectId);
  }

  getBookshelfBooks(page?: { after?: string; limit: number }) {
    return this.dependencies.bookshelf.listBooks(page);
  }

  createBookshelfBook(request: { readonly title: string; readonly synopsis: string }) {
    return this.dependencies.bookshelf.createBook(request);
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

  getBookTransferFormats() {
    return this.dependencies.bookshelf.listTransferFormats();
  }

  prepareBookshelfBookImport(
    request: Parameters<DesktopControllerDependencies["bookshelf"]["prepareBookImport"]>[0],
  ) {
    return this.dependencies.bookshelf.prepareBookImport(request);
  }

  commitBookshelfBookImport(
    request: Parameters<DesktopControllerDependencies["bookshelf"]["commitBookImport"]>[0],
  ) {
    return this.dependencies.bookshelf.commitBookImport(request);
  }

  cancelBookshelfBookImport(sessionId: string): void {
    this.dependencies.bookshelf.cancelBookImport(sessionId);
  }

  prepareBookshelfBookExport(
    request: Parameters<DesktopControllerDependencies["bookshelf"]["prepareBookExport"]>[0],
  ) {
    return this.dependencies.bookshelf.prepareBookExport(request);
  }

  commitBookshelfBookExport(
    request: Parameters<DesktopControllerDependencies["bookshelf"]["commitBookExport"]>[0],
  ) {
    return this.dependencies.bookshelf.commitBookExport(request);
  }

  cancelBookshelfBookExport(exportId: string): void {
    this.dependencies.bookshelf.cancelBookExport(exportId);
  }

  listProjectArchives(bookId?: string) {
    return this.dependencies.bookshelf.listProjectArchives(bookId);
  }

  getBookProjectArchives(bookId: string) {
    return this.dependencies.bookshelf.listProjectArchiveSummaries(bookId);
  }

  restoreProjectArchive(...args: Parameters<ProjectLifecycleApplication["restoreProjectArchive"]>) {
    return this.projectLifecycle.restoreProjectArchive(...args);
  }

  getBookWorkspace(...args: Parameters<BookWorkspaceApplication["getBookWorkspace"]>) {
    return this.bookWorkspace.getBookWorkspace(...args);
  }

  createBook(...args: Parameters<BookWorkspaceApplication["createBook"]>) {
    return this.bookWorkspace.createBook(...args);
  }

  createBookChapter(...args: Parameters<BookWorkspaceApplication["createBookChapter"]>) {
    return this.bookWorkspace.createBookChapter(...args);
  }

  createBookVolume(...args: Parameters<BookWorkspaceApplication["createBookVolume"]>) {
    return this.bookWorkspace.createBookVolume(...args);
  }

  deleteBookVolume(...args: Parameters<BookWorkspaceApplication["deleteBookVolume"]>) {
    return this.bookWorkspace.deleteBookVolume(...args);
  }

  deleteBookChapter(...args: Parameters<BookWorkspaceApplication["deleteBookChapter"]>) {
    return this.bookWorkspace.deleteBookChapter(...args);
  }

  updateBook(...args: Parameters<BookWorkspaceApplication["updateBook"]>) {
    return this.bookWorkspace.updateBook(...args);
  }

  updateBookChapter(...args: Parameters<BookWorkspaceApplication["updateBookChapter"]>) {
    return this.bookWorkspace.updateBookChapter(...args);
  }

  getBookChapterContent(...args: Parameters<BookWorkspaceApplication["getBookChapterContent"]>) {
    return this.bookWorkspace.getBookChapterContent(...args);
  }

  chapterDraft(...args: Parameters<BookWorkspaceApplication["chapterDraft"]>) {
    return this.bookWorkspace.chapterDraft(...args);
  }

  saveBookChapterContent(...args: Parameters<BookWorkspaceApplication["saveBookChapterContent"]>) {
    return this.bookWorkspace.saveBookChapterContent(...args);
  }

  cancelRun(...args: Parameters<ConversationApplication["cancelRun"]>) {
    return this.conversations.cancelRun(...args);
  }
  listRuns(...args: Parameters<ConversationApplication["listRuns"]>) {
    return this.conversations.listRuns(...args);
  }
  resolveApproval(...args: Parameters<ConversationApplication["resolveApproval"]>) {
    return this.conversations.resolveApproval(...args);
  }
  cancelConversationRun(...args: Parameters<ConversationApplication["cancelConversationRun"]>) {
    return this.conversations.cancelConversationRun(...args);
  }
  listConversationRuns(...args: Parameters<ConversationApplication["listConversationRuns"]>) {
    return this.conversations.listConversationRuns(...args);
  }
  resolveConversationApproval(
    ...args: Parameters<ConversationApplication["resolveConversationApproval"]>
  ) {
    return this.conversations.resolveConversationApproval(...args);
  }
  getThreadSnapshot(...args: Parameters<ConversationApplication["getThreadSnapshot"]>) {
    return this.conversations.getThreadSnapshot(...args);
  }
  listMessages(...args: Parameters<ConversationApplication["listMessages"]>) {
    return this.conversations.listMessages(...args);
  }
  createThread(...args: Parameters<ConversationApplication["createThread"]>) {
    return this.conversations.createThread(...args);
  }
  switchThread(...args: Parameters<ConversationApplication["switchThread"]>) {
    return this.conversations.switchThread(...args);
  }
  deleteThread(...args: Parameters<ConversationApplication["deleteThread"]>) {
    return this.conversations.deleteThread(...args);
  }
  getProjectSnapshot(...args: Parameters<ProjectLifecycleApplication["getProjectSnapshot"]>) {
    return this.projectLifecycle.getProjectSnapshot(...args);
  }
  getWorkspaceSnapshot(...args: Parameters<ProjectLifecycleApplication["getWorkspaceSnapshot"]>) {
    return this.projectLifecycle.getWorkspaceSnapshot(...args);
  }

  createProject(...args: Parameters<ProjectLifecycleApplication["createProject"]>) {
    return this.projectLifecycle.createProject(...args);
  }

  openProject(...args: Parameters<ProjectLifecycleApplication["openProject"]>) {
    return this.projectLifecycle.openProject(...args);
  }

  openProjectDirectory(...args: Parameters<ProjectLifecycleApplication["openProjectDirectory"]>) {
    return this.projectLifecycle.openProjectDirectory(...args);
  }

  renameProject(...args: Parameters<ProjectLifecycleApplication["renameProject"]>) {
    return this.projectLifecycle.renameProject(...args);
  }

  deleteProject(...args: Parameters<ProjectLifecycleApplication["deleteProject"]>) {
    return this.projectLifecycle.deleteProject(...args);
  }

  switchProject(...args: Parameters<ProjectLifecycleApplication["switchProject"]>) {
    return this.projectLifecycle.switchProject(...args);
  }

  removeProject(...args: Parameters<ProjectLifecycleApplication["removeProject"]>) {
    return this.projectLifecycle.removeProject(...args);
  }

  shutdown(): Promise<void> {
    return this.dependencies.runtime.shutdown();
  }
  hasActiveRun(): boolean {
    return this.dependencies.runtime.hasActiveRun();
  }
  closeForDeveloper(): Promise<void> {
    return this.dependencies.runtime.closeForDeveloper();
  }

  getSkillSnapshot() {
    return this.dependencies.runtime.skills.getSnapshot();
  }
  getSkill(skillId: string) {
    return this.dependencies.runtime.skills.getSkill(skillId);
  }
  useSkill(skillId: string, threadId?: string) {
    return this.dependencies.runtime.threads.useSkill(skillId, threadId);
  }
  disableSkill(skillId: string, threadId?: string) {
    return this.dependencies.runtime.threads.disableSkill(skillId, threadId);
  }
  clearSkillState(threadId?: string) {
    return this.dependencies.runtime.threads.clearSkillState(threadId);
  }

  getOutlineSnapshot(projectId: string) {
    return this.outlineApplication(projectId).then((outline) => outline.getOutlineSnapshot(projectId));
  }

  createOutline(request: CreateOutlineRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.createOutline(request));
  }

  updateOutlineProfile(request: UpdateOutlineProfileRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.updateOutlineProfile(request));
  }

  updateOutlineNode(request: UpdateOutlineNodeRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.updateOutlineNode(request));
  }

  previewOutlinePatch(request: ApplyOutlinePatchRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.previewOutlinePatch(request));
  }

  applyOutlinePatch(request: ApplyOutlinePatchRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.applyOutlinePatch(request));
  }

  mapOutlineNodes(request: MapOutlineNodesRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.mapOutlineNodes(request));
  }

  unmapOutlineNode(request: UnmapOutlineNodeRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.unmapOutlineNode(request));
  }

  proposeOutline(request: ProposeOutlineRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.proposeOutline(request));
  }

  runOutlineChecks(request: RunOutlineChecksRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.runOutlineChecks(request));
  }

  buildChapterContext(request: BuildChapterContextRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.buildChapterContext(request));
  }

  markNodesPendingVerification(request: MarkNodesPendingRequest) {
    return this.outlineApplication(request.projectId).then((outline) =>
      outline.markNodesPendingVerification(request),
    );
  }

  reviewChapterCoverage(request: ReviewCoverageRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.reviewChapterCoverage(request));
  }

  loadEventGraphHandoff(request: LoadHandoffRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.loadEventGraphHandoff(request));
  }

  waiveChapterMainline(request: WaiveMainlineRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.waiveChapterMainline(request));
  }

  startChapterWriting(request: StartChapterWritingRequest) {
    return this.outlineApplication(request.projectId).then((outline) => outline.startChapterWriting(request));
  }

  private async outlineApplication(projectId: string): Promise<OutlineApplication> {
    const runtime = await this.dependencies.runtime.resolve({ kind: "project", projectId });
    const database = runtime.openBookDatabase();
    if (!database) throw new Error("The current project does not contain a book.");
    return new OutlineApplication(new SqliteOutlineStore(database), {
      model: runtime.model,
      chapterGeneration: runtime.chapterGeneration,
      retrieveEvidence: (bookId, chapterId, query) =>
        runtime.retrieveOutlineEvidence(bookId, chapterId, query),
    });
  }
}
