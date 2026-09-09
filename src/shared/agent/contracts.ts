import type { ChapterDraft, ChapterDraftRequest } from "../book/drafts.ts";
import type {
  BookshelfBookCard,
  BookshelfTrashEntry,
  CreateBookshelfBookRequest,
  CreateBookshelfBookResult,
} from "../contracts/books/bookshelfContracts.ts";
import type {
  BookChapterRevisionResult,
  BookWorkspaceChapterDto,
  BookWorkspaceSnapshot,
  CreateBookChapterRequest,
  CreateBookRequest,
  CreateBookVolumeRequest,
  DeleteBookChapterRequest,
  DeleteBookVolumeRequest,
  ReadyBookWorkspaceSnapshot,
  SaveBookChapterContentRequest,
  UninitializedBookWorkspaceSnapshot,
  UpdateBookChapterRequest,
  UpdateBookRequest,
} from "../contracts/books/bookWorkspaceContracts.ts";
import type { ChapterGenerationMode } from "../contracts/books/chapterGenerationEvents.ts";
import type { NovelDto, VolumeDto } from "../contracts/books/novelContracts.ts";
import type {
  ApplicationEvent,
  RunSnapshot,
} from "../contracts/conversations/applicationContracts.ts";
import type {
  ConversationApplicationEvent,
  ConversationRef,
  ConversationScope,
  ConversationSnapshot,
  CreateConversationRequest,
  SendConversationMessageRequest,
} from "../contracts/conversations/conversationContracts.ts";
import type {
  AssistantBlockChannel,
  ConversationEvent,
  ConversationEventType,
} from "../contracts/conversations/conversationEvents.ts";
import type { ConversationTurnContext } from "../contracts/conversations/conversationTurnContext.ts";
import type {
  MessageDto,
  ThreadDto,
  ThreadSnapshot,
} from "../contracts/conversations/threadContracts.ts";
import type {
  RendererEditorToolRequest,
  RendererEditorToolResponse,
} from "../contracts/editor/contracts.ts";
import type { ToolApprovalDecision } from "../engine/toolApproval.ts";
import type {
  ProjectArchiveSummary,
  RestoreProjectArchiveResult,
} from "../contracts/projects/projectArchiveContracts.ts";
import type {
  CreateProjectRequest,
  ProjectDto,
  ProjectSnapshot,
  RenameProjectRequest,
} from "../contracts/projects/projectContracts.ts";
import type { ProjectNavigationSnapshot } from "../contracts/projects/projectNavigationContracts.ts";
import type {
  AgentConfigurationRequest,
  AgentServiceStatus,
} from "../contracts/settings/contracts.ts";
import type { SkillSnapshot } from "../engine/skills/SkillApplication.ts";
import type { SkillDetail } from "../engine/skills/SkillTypes.ts";
import type { ThreadSkillState } from "../engine/skills/threadPorts.ts";
import type {
  BookTransferFormatCapability,
  CommitBookExportRequest,
  CommitBookImportRequest,
  ExportBookOptions,
  ExportBookResult,
  ExportPreview,
  ImportBookResult,
  ImportPreview,
  PrepareBookExportRequest,
  PrepareBookImportRequest,
} from "../contracts/transfers/bookTransferContracts.ts";

export type RestoreProjectArchiveDesktopRequest = {
  readonly archiveId: string;
  readonly targetParentPath: string;
  readonly projectName: string;
  readonly bookStrategy: "snapshot" | "current";
};

export const AGENT_IPC_CHANNELS = Object.freeze({
  status: "agent:status",
  configure: "agent:configure",
  sendMessage: "agent:send-message",
  sendConversationMessage: "agent:conversation-send-message",
  cancelRun: "agent:cancel-run",
  cancelConversationRun: "agent:conversation-cancel-run",
  listRuns: "agent:list-runs",
  listConversationRuns: "agent:conversation-list-runs",
  resolveApproval: "agent:resolve-approval",
  resolveConversationApproval: "agent:conversation-resolve-approval",
  threadSnapshot: "agent:thread-snapshot",
  conversationSnapshot: "agent:conversation-snapshot",
  listMessages: "agent:list-messages",
  listConversationMessages: "agent:conversation-list-messages",
  listConversationEvents: "agent:conversation-list-events",
  createThread: "agent:create-thread",
  createConversation: "agent:conversation-create",
  switchThread: "agent:switch-thread",
  switchConversation: "agent:conversation-switch",
  deleteThread: "agent:delete-thread",
  deleteConversation: "agent:conversation-delete",
  projectSnapshot: "agent:project-snapshot",
  projectNavigation: "agent:project-navigation",
  bookshelfBooks: "agent:bookshelf-books",
  createBookshelfBook: "agent:bookshelf-book-create",
  importBookshelfBook: "agent:bookshelf-book-import",
  exportBookshelfBook: "agent:bookshelf-book-export",
  bookTransferFormats: "agent:book-transfer-formats",
  prepareBookshelfBookImport: "agent:book-transfer-import-prepare",
  commitBookshelfBookImport: "agent:book-transfer-import-commit",
  cancelBookshelfBookImport: "agent:book-transfer-import-cancel",
  prepareBookshelfBookExport: "agent:book-transfer-export-prepare",
  commitBookshelfBookExport: "agent:book-transfer-export-commit",
  cancelBookshelfBookExport: "agent:book-transfer-export-cancel",
  bookshelfTrash: "agent:bookshelf-trash",
  moveBookshelfBookToTrash: "agent:bookshelf-book-trash",
  restoreBookshelfBookFromTrash: "agent:bookshelf-book-restore",
  permanentlyDeleteBookshelfBook: "agent:bookshelf-book-delete-permanently",
  bookProjectArchives: "agent:bookshelf-project-archives",
  restoreProjectArchive: "agent:bookshelf-project-archive-restore",
  bookWorkspace: "agent:book-workspace",
  createBook: "agent:book-create",
  createBookChapter: "agent:book-chapter-create",
  createBookVolume: "agent:book-volume-create",
  deleteBookVolume: "agent:book-volume-delete",
  deleteBookChapter: "agent:book-chapter-delete",
  updateBook: "agent:book-update",
  updateBookChapter: "agent:book-chapter-update",
  getBookChapterContent: "agent:chapter-content",
  chapterDraft: "agent:chapter-draft",
  saveBookChapterContent: "agent:book-chapter-save-content",
  workspaceSnapshot: "agent:workspace-snapshot",
  createProject: "agent:create-project",
  openProject: "agent:open-project",
  openProjectDirectory: "agent:open-project-directory",
  renameProject: "agent:rename-project",
  deleteProject: "agent:delete-project",
  switchProject: "agent:switch-project",
  removeProject: "agent:remove-project",
  skillSnapshot: "agent:skill-snapshot",
  getSkill: "agent:get-skill",
  useSkill: "agent:use-skill",
  disableSkill: "agent:disable-skill",
  clearSkillState: "agent:clear-skill-state",
  event: "agent:event",
  editorToolRequest: "agent:editor-tool-request",
  editorToolResponse: "agent:editor-tool-response",
} as const);

export type WorkspaceSnapshot = {
  readonly projects: ProjectSnapshot;
  readonly threads: ThreadSnapshot;
};

export type AgentDesktopApi = import("../book/reader.ts").BookReaderApi & {
  getStatus(): Promise<AgentServiceStatus>;
  configure(request: AgentConfigurationRequest): Promise<AgentServiceStatus>;
  sendMessage(request: { threadId: string; content: string }): Promise<{ runId: string }>;
  sendConversationMessage(request: SendConversationMessageRequest): Promise<{
    runId: string;
    threads: ThreadSnapshot;
  }>;
  cancelRun(runId: string): Promise<boolean>;
  cancelConversationRun(scope: ConversationScope, runId: string): Promise<boolean>;
  listRuns(): Promise<readonly RunSnapshot[]>;
  listConversationRuns(scope: ConversationScope): Promise<readonly RunSnapshot[]>;
  resolveApproval(approvalId: string, decision: ToolApprovalDecision): Promise<boolean>;
  resolveConversationApproval(
    scope: ConversationScope,
    approvalId: string,
    decision: ToolApprovalDecision,
  ): Promise<boolean>;
  getThreadSnapshot(): Promise<ThreadSnapshot>;
  getConversationSnapshot(scope: ConversationScope): Promise<ConversationSnapshot>;
  listMessages(threadId?: string): Promise<readonly MessageDto[]>;
  listConversationMessages(request: ConversationRef): Promise<readonly MessageDto[]>;
  listConversationEvents(request: ConversationRef): Promise<readonly ConversationEvent[]>;
  createThread(title: string): Promise<ThreadDto>;
  createConversation(request: CreateConversationRequest): Promise<ThreadDto>;
  switchThread(threadId: string): Promise<ThreadSnapshot>;
  switchConversation(request: ConversationRef): Promise<ConversationSnapshot>;
  deleteThread(threadId: string): Promise<ThreadSnapshot>;
  deleteConversation(request: ConversationRef): Promise<ConversationSnapshot>;
  getProjectSnapshot(): Promise<ProjectSnapshot>;
  getProjectNavigation(projectId: string): Promise<ProjectNavigationSnapshot>;
  getBookshelfBooks(page?: {
    after?: string;
    limit: number;
  }): Promise<readonly BookshelfBookCard[]>;
  createBookshelfBook(request: CreateBookshelfBookRequest): Promise<CreateBookshelfBookResult>;
  importBookshelfBook(request: { readonly packagePath: string }): Promise<ImportBookResult>;
  exportBookshelfBook(request: {
    readonly bookId: string;
    readonly outputPath: string;
  }): Promise<void>;
  getBookTransferFormats(): Promise<readonly BookTransferFormatCapability[]>;
  prepareBookshelfBookImport(request: PrepareBookImportRequest): Promise<ImportPreview>;
  commitBookshelfBookImport(request: CommitBookImportRequest): Promise<ImportBookResult>;
  cancelBookshelfBookImport(sessionId: string): Promise<void>;
  prepareBookshelfBookExport(request: PrepareBookExportRequest): Promise<ExportPreview>;
  commitBookshelfBookExport(request: CommitBookExportRequest): Promise<ExportBookResult>;
  cancelBookshelfBookExport(exportId: string): Promise<void>;
  getBookshelfTrash(): Promise<readonly BookshelfTrashEntry[]>;
  moveBookshelfBookToTrash(bookId: string): Promise<BookshelfTrashEntry>;
  restoreBookshelfBookFromTrash(bookId: string): Promise<BookshelfBookCard>;
  permanentlyDeleteBookshelfBook(request: {
    readonly bookId: string;
    readonly confirmationBookId: string;
  }): Promise<void>;
  getBookProjectArchives(bookId: string): Promise<readonly ProjectArchiveSummary[]>;
  restoreProjectArchive(request: RestoreProjectArchiveDesktopRequest): Promise<{
    readonly result: RestoreProjectArchiveResult;
    readonly workspace: WorkspaceSnapshot;
  }>;
  getBookWorkspace(projectId: string): Promise<BookWorkspaceSnapshot>;
  createBook(request: CreateBookRequest): Promise<BookWorkspaceSnapshot>;
  createBookChapter(request: CreateBookChapterRequest): Promise<BookWorkspaceSnapshot>;
  createBookVolume(request: CreateBookVolumeRequest): Promise<BookWorkspaceSnapshot>;
  deleteBookVolume(request: DeleteBookVolumeRequest): Promise<BookWorkspaceSnapshot>;
  deleteBookChapter(request: DeleteBookChapterRequest): Promise<BookWorkspaceSnapshot>;
  updateBook(request: UpdateBookRequest): Promise<BookWorkspaceSnapshot>;
  updateBookChapter(request: UpdateBookChapterRequest): Promise<BookWorkspaceSnapshot>;
  getBookChapterContent(request: {
    projectId: string;
    chapterId: string;
  }): Promise<BookWorkspaceChapterDto>;
  chapterDraft(request: ChapterDraftRequest): Promise<ChapterDraft | null>;
  saveBookChapterContent(
    request: SaveBookChapterContentRequest,
  ): Promise<BookChapterRevisionResult>;
  getWorkspaceSnapshot(): Promise<WorkspaceSnapshot>;
  createProject(request: CreateProjectRequest): Promise<WorkspaceSnapshot>;
  openProject(projectPath: string): Promise<WorkspaceSnapshot>;
  openProjectDirectory(projectPath: string): Promise<void>;
  renameProject(request: RenameProjectRequest): Promise<WorkspaceSnapshot>;
  deleteProject(projectPath: string): Promise<WorkspaceSnapshot>;
  switchProject(projectPath: string | null): Promise<WorkspaceSnapshot>;
  removeProject(projectPath: string): Promise<WorkspaceSnapshot>;
  getSkillSnapshot(): Promise<SkillSnapshot>;
  getSkill(skillId: string): Promise<SkillDetail | null>;
  useSkill(skillId: string, threadId?: string): Promise<ThreadSkillState>;
  disableSkill(skillId: string, threadId?: string): Promise<ThreadSkillState>;
  clearSkillState(threadId?: string): Promise<ThreadSkillState>;
  onEvent(handler: (event: ConversationApplicationEvent) => void): () => void;
  onEditorToolRequest(
    handler: (request: RendererEditorToolRequest) => Promise<unknown>,
  ): () => void;
};

export type {
  AgentConfigurationRequest,
  AgentServiceStatus,
  ApplicationEvent,
  AssistantBlockChannel,
  BookChapterRevisionResult,
  BookshelfBookCard,
  BookshelfTrashEntry,
  BookTransferFormatCapability,
  BookWorkspaceChapterDto,
  BookWorkspaceSnapshot,
  ChapterGenerationMode,
  ConversationApplicationEvent,
  ConversationEvent,
  ConversationEventType,
  ConversationRef,
  ConversationScope,
  ConversationSnapshot,
  ConversationTurnContext,
  CreateBookChapterRequest,
  CreateBookRequest,
  CreateBookshelfBookRequest,
  CreateBookshelfBookResult,
  CreateBookVolumeRequest,
  CreateConversationRequest,
  CreateProjectRequest,
  DeleteBookChapterRequest,
  DeleteBookVolumeRequest,
  ExportBookOptions,
  ExportBookResult,
  ExportPreview,
  ImportBookResult,
  ImportPreview,
  MessageDto,
  NovelDto,
  PrepareBookExportRequest,
  PrepareBookImportRequest,
  ProjectArchiveSummary,
  ProjectDto,
  ProjectNavigationSnapshot,
  ProjectSnapshot,
  ReadyBookWorkspaceSnapshot,
  RenameProjectRequest,
  RendererEditorToolRequest,
  RendererEditorToolResponse,
  RestoreProjectArchiveResult,
  RunSnapshot,
  SaveBookChapterContentRequest,
  SendConversationMessageRequest,
  SkillDetail,
  SkillSnapshot,
  ThreadDto,
  ThreadSkillState,
  ThreadSnapshot,
  ToolApprovalDecision,
  UninitializedBookWorkspaceSnapshot,
  UpdateBookChapterRequest,
  UpdateBookRequest,
  VolumeDto,
};
